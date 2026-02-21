// src/lib/jobs/matcher.ts
//
// CRITICAL FIX: All user_job_matches documents now include `profileId`.
// Previously missing profileId caused the frontend query to return 0 results.

import { adminDb } from '@/lib/firebase-admin';
import { deepseek } from '@/lib/deepseek';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

interface MatchResult {
  score: number;
  reasons: string[];
  weaknesses: string[];
  suggestions: string[];
}

export class JobMatchingEngine {

  /**
   * Match a set of new job IDs against all active users and their profiles.
   * Writes user_job_matches documents WITH profileId so the frontend can filter.
   */
  async matchJobsWithUsers(jobIds: string[]): Promise<void> {
    if (jobIds.length === 0) return;

    // Fetch active users
    const usersSnapshot = await adminDb
      .collection('users')
      .where('active', '==', true)
      .get();

    if (usersSnapshot.empty) {
      console.log('[Matcher] No active users to match.');
      return;
    }

    // Fetch jobs in chunks (Firestore 'in' limit = 10)
    const allJobDocs: { id: string; data: DocumentData }[] = [];
    for (let i = 0; i < jobIds.length; i += 10) {
      const chunk = jobIds.slice(i, i + 10);
      const snap = await adminDb
        .collection('jobs')
        .where('__name__', 'in', chunk)
        .get();
      // FIX: explicit type on QueryDocumentSnapshot to resolve implicit 'any'
      snap.docs.forEach((d: QueryDocumentSnapshot) =>
        allJobDocs.push({ id: d.id, data: d.data() })
      );
    }

    console.log(`[Matcher] Matching ${allJobDocs.length} jobs against ${usersSnapshot.docs.length} users`);

    let matchCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Load all active job profiles for this user
      const profilesSnap = await adminDb
        .collection('users')
        .doc(userId)
        .collection('job_profiles')
        .where('isActive', '==', true)
        .get();

      // If no profiles exist, fall back to user-level preferences with a synthetic profile
      const profiles: { id: string | null; data: DocumentData }[] = profilesSnap.empty
        ? [{ id: null, data: userDoc.data() }]
        : profilesSnap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, data: d.data() }));

      for (const profile of profiles) {
        const profileData = profile.data;

        for (const job of allJobDocs) {
          // Quick keyword pre-filter before the expensive AI call
          if (!this.quickMatch(profileData, job.data)) continue;

          // Duplicate check — scoped to profileId when available
          const existingQuery = profile.id
            ? adminDb.collection('user_job_matches')
                .where('userId', '==', userId)
                .where('jobId', '==', job.id)
                .where('profileId', '==', profile.id)
                .limit(1)
            : adminDb.collection('user_job_matches')
                .where('userId', '==', userId)
                .where('jobId', '==', job.id)
                .limit(1);

          const existingSnap = await existingQuery.get();
          if (!existingSnap.empty) continue; // Already matched

          try {
            const matchResult: MatchResult = await deepseek.calculateMatchScore(
              profileData,
              job.data
            );

            if (matchResult.score >= 70) {
              const matchDoc: Record<string, unknown> = {
                userId,
                jobId: job.id,
                matchScore: matchResult.score,
                matchReasons: matchResult.reasons,
                weaknesses: matchResult.weaknesses || [],
                notifiedAt: new Date(),
                viewed: false,
                applied: false,
                createdAt: new Date(),
              };

              // ✅ THE FIX: Write profileId so the frontend can filter by it
              if (profile.id) {
                matchDoc.profileId = profile.id;
              }

              await adminDb.collection('user_job_matches').add(matchDoc);
              matchCount++;

              console.log(
                `[Matcher] ✅ Match: ${userId}/${profile.id || 'default'} → ${job.data.title} @ ${job.data.company} (${matchResult.score}%)`
              );
            }
          } catch (err) {
            console.error(`[Matcher] AI error for job ${job.id}, user ${userId}:`, err);
          }
        }
      }
    }

    console.log(`[Matcher] Created ${matchCount} matches`);
  }

  /**
   * Fast keyword pre-filter before calling the AI.
   * Prevents wasting AI credits on obviously irrelevant jobs.
   */
  private quickMatch(profile: DocumentData, job: DocumentData): boolean {
    const titleLower = (job.title as string || '').toLowerCase();

    // At least one keyword must appear in the job title (word-boundary match)
    const keywords: string[] = profile.keywords || profile.searchKeywords || profile.jobTitles || [];
    if (keywords.length > 0) {
      const hasKeyword = keywords.some((kw: string) => {
        try {
          return new RegExp(`\\b${kw.toLowerCase()}\\b`, 'i').test(titleLower);
        } catch {
          return titleLower.includes(kw.toLowerCase());
        }
      });
      if (!hasKeyword) return false;
    }

    // Exclude keywords must not appear
    const excludes: string[] = profile.excludeKeywords || [];
    if (excludes.length > 0) {
      const isExcluded = excludes.some((ex: string) => {
        try {
          return new RegExp(`\\b${ex.toLowerCase()}\\b`, 'i').test(titleLower);
        } catch {
          return titleLower.includes(ex.toLowerCase());
        }
      });
      if (isExcluded) return false;
    }

    return true;
  }

  /**
   * Recalculate all match scores when a user updates their profile.
   */
  async updateUserMatchScores(userId: string, profileId?: string): Promise<void> {
    const userDoc = await adminDb.collection('users').doc(userId).get();

    let profileData: DocumentData | undefined;
    if (profileId) {
      const profileDoc = await adminDb
        .collection('users').doc(userId)
        .collection('job_profiles').doc(profileId)
        .get();
      profileData = profileDoc.data();
    } else {
      profileData = userDoc.data();
    }

    if (!profileData) {
      console.error(`[Matcher] No profile data for user ${userId}`);
      return;
    }

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
    const jobsSnapshot = await adminDb
      .collection('jobs')
      .where('postedAt', '>', cutoff)
      .limit(500)
      .get();

    let updated = 0;
    for (const jobDoc of jobsSnapshot.docs) {
      if (!this.quickMatch(profileData, jobDoc.data())) continue;

      try {
        const matchResult = await deepseek.calculateMatchScore(profileData, jobDoc.data());

        if (matchResult.score >= 70) {
          const matchDocData: Record<string, unknown> = {
            userId,
            jobId: jobDoc.id,
            matchScore: matchResult.score,
            matchReasons: matchResult.reasons,
            weaknesses: matchResult.weaknesses || [],
            notifiedAt: new Date(),
            viewed: false,
            applied: false,
            createdAt: new Date(),
          };

          if (profileId) matchDocData.profileId = profileId;

          await adminDb.collection('user_job_matches').add(matchDocData);
          updated++;
        }
      } catch (err) {
        console.error(`[Matcher] Score update error for job ${jobDoc.id}:`, err);
      }
    }

    console.log(`[Matcher] Updated ${updated} matches for user ${userId}`);
  }
}

export const jobMatcher = new JobMatchingEngine();