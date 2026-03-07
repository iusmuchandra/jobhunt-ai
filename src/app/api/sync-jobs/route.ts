import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { adminDb } from '@/lib/firebase-admin';
import { JobMatchingEngine } from '@/lib/jobs/scraper';
import { verifyAuthToken } from '@/lib/api-auth';

const execAsync = promisify(exec);
const FIRESTORE_BATCH_LIMIT = 500;

type JobForMatching = { id: string; data: any };

async function syncJobsToFirestore(newJobs: any[]): Promise<JobForMatching[]> {
  const jobsForMatching: JobForMatching[] = [];

  for (let i = 0; i < newJobs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = newJobs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = adminDb.batch();

    for (const job of chunk) {
      const jobRef = adminDb.collection('jobs').doc();
      batch.set(jobRef, {
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        source: job.ats_source,
        seniority: job.seniority,
        score: job.score,
        description: job.description || null,
        postedAt: new Date(job.found_at),
        createdAt: new Date(),
        indexed: false,
      });

      jobsForMatching.push({ id: jobRef.id, data: job });
    }

    await batch.commit();
    console.log(`Synced chunk ${Math.floor(i / FIRESTORE_BATCH_LIMIT) + 1}: ${chunk.length} jobs`);
  }

  return jobsForMatching;
}

async function updateBackgroundJob(jobId: string, payload: Record<string, any>) {
  await adminDb.collection('background_jobs').doc(jobId).set({
    ...payload,
    updatedAt: new Date(),
  }, { merge: true });
}

function runMatchingInBackground(jobsForMatching: JobForMatching[], backgroundJobId: string | null) {
  if (!jobsForMatching.length) return;

  const matcher = new JobMatchingEngine();
  void (async () => {
    try {
      if (backgroundJobId) {
        await updateBackgroundJob(backgroundJobId, {
          status: 'running',
          progress: 35,
          message: 'Matching jobs to user profiles...',
        });
      }

      await matcher.matchJobsWithUsers(jobsForMatching);

      if (backgroundJobId) {
        await updateBackgroundJob(backgroundJobId, {
          status: 'completed',
          progress: 100,
          message: 'Matching completed successfully',
          completedAt: new Date(),
          processedJobs: jobsForMatching.length,
        });
      }

      console.log(`Background matching complete for ${jobsForMatching.length} jobs`);
    } catch (error) {
      if (backgroundJobId) {
        await updateBackgroundJob(backgroundJobId, {
          status: 'failed',
          progress: 100,
          message: error instanceof Error ? error.message : 'Background matching failed',
          completedAt: new Date(),
        });
      }
      console.error('Background matching failed:', error);
    }
  })();
}

export async function POST(request: Request) {
  try {
    // Verify authentication: either Firebase token or cron secret
    const uid = await verifyAuthToken(request);
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!uid && token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Run Python scraper
    console.log('Running Python job scraper...');
    const { stdout } = await execAsync(
      'cd scripts && python job_scraper.py --no-email',
      { timeout: 600000 } // 10 min timeout
    );
    console.log('Scraper output:', stdout);

    // 2. Read jobs from SQLite
    const db = await open({
      filename: './data/job_intelligence.db',
      driver: sqlite3.Database
    });

    const newJobs = await db.all(`
      SELECT * FROM jobs
      WHERE found_at > datetime('now', '-1 hour')
      ORDER BY score DESC
    `);

    await db.close();

    console.log(`Found ${newJobs.length} new jobs from scraper`);

    // 3. Sync to Firebase in chunks (Firestore max 500 writes per batch)
    const jobsForMatching = await syncJobsToFirestore(newJobs);
    console.log(`Synced ${jobsForMatching.length} jobs to Firebase`);

    let backgroundJobId: string | null = null;
    if (jobsForMatching.length > 0) {
      const ref = adminDb.collection('background_jobs').doc();
      backgroundJobId = ref.id;
      await ref.set({
        type: 'job_matching',
        status: 'queued',
        progress: 20,
        message: 'Jobs synced. Queuing AI matching...',
        totalJobs: jobsForMatching.length,
        processedJobs: 0,
        startedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // 4. Trigger AI matching asynchronously to avoid request timeouts
    runMatchingInBackground(jobsForMatching, backgroundJobId);

    return NextResponse.json({
      success: true,
      jobsScraped: newJobs.length,
      jobsSynced: jobsForMatching.length,
      matching: jobsForMatching.length ? 'started' : 'skipped',
      backgroundJobId,
    });

  } catch (error) {
    console.error('Job sync failed:', error);
    return NextResponse.json({
      error: 'Job sync failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
