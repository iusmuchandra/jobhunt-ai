"""
ONE-TIME DATABASE CLEANUP SCRIPT
=================================
Run this once to:
  1. Delete all jobs older than 14 days (including those missing expiresAt)
  2. Delete all user_job_matches pointing to deleted/stale jobs
  3. Deduplicate jobs with the same company + title (keeps the newest)

Usage:
  pip install firebase-admin
  python cleanup_db.py --dry-run      # Preview what will be deleted
  python cleanup_db.py                # Actually delete

Set env var or edit CRED_PATH below to point to your Firebase service account JSON.
"""

import os
import sys
import argparse
import time
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import firebase_admin
from firebase_admin import credentials, firestore

# ── Config ─────────────────────────────────────────────────────────────────────
CRED_PATH = os.getenv("FIREBASE_CREDENTIALS", "serviceAccountKey.json")
MAX_AGE_DAYS = 14
BATCH_SIZE = 400  # Firestore max is 500; keep headroom
# ───────────────────────────────────────────────────────────────────────────────


def init_firebase():
    cred = credentials.Certificate(CRED_PATH)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def commit_batch(db, refs: list, dry_run: bool, label: str) -> int:
    """Delete a list of DocumentReferences in batches."""
    if not refs:
        return 0
    if dry_run:
        print(f"  [DRY RUN] Would delete {len(refs)} {label}")
        return len(refs)

    deleted = 0
    for i in range(0, len(refs), BATCH_SIZE):
        batch = db.batch()
        for ref in refs[i : i + BATCH_SIZE]:
            batch.delete(ref)
        batch.commit()
        deleted += len(refs[i : i + BATCH_SIZE])
        print(f"  ✓ Deleted {deleted}/{len(refs)} {label}...")

    return deleted


def step1_delete_stale_jobs(db, dry_run: bool):
    """
    Delete jobs that are either:
      a) Have expiresAt < now  (properly expired)
      b) Have postedAt older than MAX_AGE_DAYS  (scraped before expiresAt was added)
      c) Missing postedAt entirely  (bad data)
    Returns the set of deleted job IDs so step 2 can clean matches.
    """
    print(f"\n── Step 1: Stale Job Cleanup (older than {MAX_AGE_DAYS} days) ──────────────")
    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    now = datetime.now(timezone.utc)

    all_jobs = db.collection("jobs").stream()

    stale_refs = []
    stale_ids = set()

    for doc in all_jobs:
        data = doc.to_dict()
        ref = doc.reference
        job_id = doc.id

        expires_at = data.get("expiresAt")
        posted_at = data.get("postedAt")

        # Case A: expiresAt exists and is in the past
        if expires_at:
            exp = expires_at if isinstance(expires_at, datetime) else expires_at.replace(tzinfo=timezone.utc) if hasattr(expires_at, 'replace') else None
            try:
                exp_dt = expires_at.astimezone(timezone.utc) if hasattr(expires_at, 'astimezone') else None
                if exp_dt and exp_dt < now:
                    stale_refs.append(ref)
                    stale_ids.add(job_id)
                    continue
            except Exception:
                pass

        # Case B: postedAt is too old
        if posted_at:
            try:
                if hasattr(posted_at, 'astimezone'):
                    posted_dt = posted_at.astimezone(timezone.utc)
                elif hasattr(posted_at, 'replace'):
                    posted_dt = posted_at.replace(tzinfo=timezone.utc)
                else:
                    posted_dt = None

                if posted_dt and posted_dt < cutoff:
                    stale_refs.append(ref)
                    stale_ids.add(job_id)
                    continue
            except Exception:
                pass

        # Case C: missing postedAt entirely — treat as stale
        if not posted_at and not expires_at:
            stale_refs.append(ref)
            stale_ids.add(job_id)

    print(f"  Found {len(stale_refs)} stale jobs to delete")
    deleted = commit_batch(db, stale_refs, dry_run, "stale jobs")
    return stale_ids


def step2_delete_orphaned_matches(db, stale_job_ids: set, dry_run: bool):
    """
    Delete user_job_matches where:
      a) jobId points to a job we just deleted (stale_job_ids)
      b) createdAt is older than MAX_AGE_DAYS (belt-and-suspenders)
    """
    print(f"\n── Step 2: Orphaned Match Cleanup ──────────────────────────────────────────")
    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)

    all_matches = db.collection("user_job_matches").stream()

    orphan_refs = []

    for doc in all_matches:
        data = doc.to_dict()
        job_id = data.get("jobId", "")
        created_at = data.get("createdAt") or data.get("notifiedAt")

        # Case A: points to a deleted job
        if job_id in stale_job_ids:
            orphan_refs.append(doc.reference)
            continue

        # Case B: match itself is old
        if created_at:
            try:
                if hasattr(created_at, 'astimezone'):
                    created_dt = created_at.astimezone(timezone.utc)
                elif hasattr(created_at, 'replace'):
                    created_dt = created_at.replace(tzinfo=timezone.utc)
                else:
                    created_dt = None

                if created_dt and created_dt < cutoff:
                    orphan_refs.append(doc.reference)
            except Exception:
                pass

    print(f"  Found {len(orphan_refs)} orphaned matches to delete")
    commit_batch(db, orphan_refs, dry_run, "orphaned matches")


def step3_deduplicate_jobs(db, dry_run: bool):
    """
    For jobs sharing the same (company, title), keep the newest one
    and delete the rest.
    """
    print(f"\n── Step 3: Deduplication (same company + title) ────────────────────────────")

    # Fetch remaining (non-stale) jobs
    all_jobs = db.collection("jobs").stream()

    groups = defaultdict(list)  # key → list of (doc_id, ref, posted_at)

    for doc in all_jobs:
        data = doc.to_dict()
        company = (data.get("company") or "").strip().lower()
        title = (data.get("title") or "").strip().lower()
        key = f"{company}::{title}"

        posted_at = data.get("postedAt")
        try:
            if hasattr(posted_at, 'astimezone'):
                posted_dt = posted_at.astimezone(timezone.utc)
            else:
                posted_dt = datetime.min.replace(tzinfo=timezone.utc)
        except Exception:
            posted_dt = datetime.min.replace(tzinfo=timezone.utc)

        groups[key].append((doc.id, doc.reference, posted_dt))

    dup_refs = []
    dup_groups = 0

    for key, entries in groups.items():
        if len(entries) < 2:
            continue
        dup_groups += 1
        # Sort newest first, keep index 0, delete the rest
        entries.sort(key=lambda x: x[2], reverse=True)
        for doc_id, ref, _ in entries[1:]:
            dup_refs.append(ref)

    print(f"  Found {dup_groups} duplicate groups → {len(dup_refs)} excess copies to delete")
    commit_batch(db, dup_refs, dry_run, "duplicate jobs")

    # Also clean up matches pointing to now-deleted duplicate job IDs
    if not dry_run and dup_refs:
        print("  Cleaning matches for deleted duplicates...")
        # Collect the IDs we just deleted
        deleted_ids = set()
        # We need the IDs — re-derive from refs
        for ref in dup_refs:
            deleted_ids.add(ref.id)
        step2_delete_orphaned_matches(db, deleted_ids, dry_run=False)


def main():
    parser = argparse.ArgumentParser(description="One-time Firestore cleanup")
    parser.add_argument("--dry-run", action="store_true", help="Preview without deleting")
    args = parser.parse_args()

    if args.dry_run:
        print("🔍 DRY RUN MODE — nothing will be deleted\n")
    else:
        print("🚨 LIVE MODE — this will permanently delete data")
        confirm = input("Type YES to continue: ").strip()
        if confirm != "YES":
            print("Aborted.")
            sys.exit(0)

    start = time.time()
    db = init_firebase()

    stale_ids = step1_delete_stale_jobs(db, args.dry_run)
    step2_delete_orphaned_matches(db, stale_ids, args.dry_run)
    step3_deduplicate_jobs(db, args.dry_run)

    print(f"\n✅ Done in {time.time() - start:.1f}s")


if __name__ == "__main__":
    main()
