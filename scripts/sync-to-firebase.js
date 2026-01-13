#!/usr/bin/env node
/**
 * Sync scraped jobs from SQLite to Firebase
 * Run after Python scraper in GitHub Actions
 */

const admin = require('firebase-admin');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

async function syncJobs() {
  console.log('🚀 Starting Firebase sync...');
  
  try {
    // Open SQLite database
    const sqliteDb = await open({
      filename: './data/job_intelligence.db',
      driver: sqlite3.Database,
    });

    // Get new jobs from last 6 hours
    const jobs = await sqliteDb.all(`
      SELECT * FROM jobs 
      WHERE found_at > datetime('now', '-6 hours')
      ORDER BY score DESC
    `);

    console.log(`📊 Found ${jobs.length} new jobs`);

    if (jobs.length === 0) {
      console.log('✅ No new jobs to sync');
      await sqliteDb.close();
      return;
    }

    // Batch write to Firestore
    let batch = db.batch();
    let batchCount = 0;
    let syncedCount = 0;

    for (const job of jobs) {
      // Check if job already exists
      const existingJob = await db
        .collection('jobs')
        .where('url', '==', job.url)
        .limit(1)
        .get();

      if (!existingJob.empty) {
        console.log(`⏭️  Skipping duplicate: ${job.title}`);
        continue;
      }

      const jobRef = db.collection('jobs').doc();
      batch.set(jobRef, {
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        source: job.ats_source,
        seniority: job.seniority,
        scraperScore: job.score,
        postedAt: admin.firestore.Timestamp.fromDate(new Date(job.found_at)),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        indexed: false,
      });

      batchCount++;
      syncedCount++;

      // Firestore batch limit is 500
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`💾 Committed batch of ${batchCount} jobs`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
      console.log(`💾 Committed final batch of ${batchCount} jobs`);
    }

    await sqliteDb.close();

    console.log(`✅ Successfully synced ${syncedCount} jobs to Firebase`);

    // Trigger matching (optional - can be separate workflow)
    if (syncedCount > 0) {
      console.log('🎯 Triggering AI matching...');
      // Call your matching API endpoint
      // await triggerMatching();
    }

  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

syncJobs();