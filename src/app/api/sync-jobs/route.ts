import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { adminDb } from '@/lib/firebase-admin';
import { JobMatchingEngine } from '@/lib/jobs/scraper';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/api-auth';

const execAsync = promisify(exec);

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
    const { stdout, stderr } = await execAsync(
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

    // 3. Sync to Firebase
    const batch = adminDb.batch();
    const jobsForMatching: { id: string; data: any }[] = [];

    for (const job of newJobs) {
      const jobRef = adminDb.collection('jobs').doc();
      batch.set(jobRef, {
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        source: job.ats_source,
        seniority: job.seniority,
        score: job.score,
        postedAt: new Date(job.found_at),
        createdAt: new Date(),
        indexed: false,
      });
      jobsForMatching.push({ id: jobRef.id, data: job });
    }

    await batch.commit();
    console.log(`Synced ${jobsForMatching.length} jobs to Firebase`);

    // 4. Trigger AI matching
    const matcher = new JobMatchingEngine();
    await matcher.matchJobsWithUsers(jobsForMatching);

    return NextResponse.json({
      success: true,
      jobsScraped: newJobs.length,
      jobsSynced: jobsForMatching.length
    });

  } catch (error) {
    console.error('Job sync failed:', error);
    return NextResponse.json({
      error: 'Job sync failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}