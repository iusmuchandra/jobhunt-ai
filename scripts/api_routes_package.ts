// ============================================================================
// FILE 1: app/api/sync-jobs/route.ts
// Main job scraping and sync endpoint
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { adminDb } from '@/lib/firebase-admin';
import { deepseek } from '@/lib/deepseek';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🚀 Starting job sync pipeline...');

    // 1. Run Python scraper
    console.log('📡 Running Python job scraper...');
    try {
      const { stdout } = await execAsync(
        'cd scripts && python3 job_scraper.py --no-email',
        { timeout: 600000 } // 10 minutes
      );
      console.log('Scraper output:', stdout);
    } catch (error) {
      console.error('Scraper error:', error);
      // Continue anyway - we might have cached data
    }

    // 2. Read jobs from SQLite
    const db = await open({
      filename: './data/job_intelligence.db',
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY
    });

    const jobs = await db.all(`
      SELECT * FROM jobs 
      WHERE found_at > datetime('now', '-2 hours')
      ORDER BY score DESC
      LIMIT 500
    `);

    await db.close();

    if (jobs.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No new jobs to sync',
        stats: { jobsScraped: 0, jobsSynced: 0, matchesCreated: 0 }
      });
    }

    // 3. Sync to Firestore
    const jobIds: string[] = [];
    const batch = adminDb.batch();

    for (const job of jobs) {
      const jobRef = adminDb.collection('jobs').doc();
      batch.set(jobRef, {
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        source: job.ats_source,
        seniority: job.seniority,
        scraperScore: job.score,
        postedAt: new Date(job.found_at),
        createdAt: new Date(),
        indexed: false,
      });
      jobIds.push(jobRef.id);
    }

    await batch.commit();

    // 4. Match with users (simplified for demo)
    let matchCount = 0;
    const usersSnapshot = await adminDb
      .collection('users')
      .where('active', '==', true)
      .limit(10)
      .get();

    for (const userDoc of usersSnapshot.docs) {
      for (const jobId of jobIds.slice(0, 5)) {
        const matchRef = adminDb.collection('user_job_matches').doc();
        await matchRef.set({
          userId: userDoc.id,
          jobId: jobId,
          matchScore: 85, // Would be calculated by AI
          matchReasons: ['Strong skills match', 'Experience level fits'],
          viewed: false,
          applied: false,
          notifiedAt: new Date(),
        });
        matchCount++;
      }
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({ 
      success: true,
      stats: {
        jobsScraped: jobs.length,
        jobsSynced: jobIds.length,
        matchesCreated: matchCount,
        duration
      }
    });

  } catch (error: any) {
    console.error('Job sync failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

// ============================================================================
// FILE 2: app/api/test-email/route.ts
// Test email sending functionality
// ============================================================================

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function GET() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SENDER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: `"JobHunt AI" <${process.env.SENDER_EMAIL}>`,
      to: process.env.SENDER_EMAIL, // Send to yourself for testing
      subject: '✅ Email Test - JobHunt AI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Configuration Test</h2>
          <p>If you're reading this, your email configuration is working correctly! 🎉</p>
          <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Test Details:</strong></p>
            <ul>
              <li>SMTP Host: ${process.env.SMTP_HOST}</li>
              <li>From: ${process.env.SENDER_EMAIL}</li>
              <li>Time: ${new Date().toLocaleString()}</li>
            </ul>
          </div>
          <p>You're ready to send job notifications!</p>
        </div>
      `,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Email sent successfully!',
      messageId: info.messageId 
    });
  } catch (error: any) {
    console.error('Email test failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

// ============================================================================
// FILE 3: app/api/user/profile/route.ts
// Get and update user profile
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { adminAuth } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, profile: userDoc.data() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const updates = await request.json();

    await adminDb.collection('users').doc(userId).update({
      ...updates,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// FILE 4: app/api/matches/route.ts
// Get user's job matches
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { adminAuth } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const matchesSnapshot = await adminDb
      .collection('user_job_matches')
      .where('userId', '==', userId)
      .orderBy('matchScore', 'desc')
      .limit(50)
      .get();

    const matches = await Promise.all(
      matchesSnapshot.docs.map(async (doc) => {
        const matchData = doc.data();
        const jobDoc = await adminDb.collection('jobs').doc(matchData.jobId).get();
        
        return {
          id: doc.id,
          ...matchData,
          job: jobDoc.exists ? jobDoc.data() : null,
        };
      })
    );

    return NextResponse.json({ success: true, matches });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// FILE 5: app/api/webhooks/stripe/route.ts
// Stripe webhook handler (for subscription management)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { stripe, constructWebhookEvent } from '@/lib/stripe';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    const event = await constructWebhookEvent(body, signature);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const tier = session.metadata?.tier;

        if (userId && tier) {
          await adminDb.collection('users').doc(userId).update({
            tier,
            stripeCustomerId: session.customer,
            subscriptionId: session.subscription,
            subscriptionStatus: 'active',
            updatedAt: new Date(),
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await adminDb.collection('users').doc(userId).update({
            tier: 'free',
            subscriptionStatus: 'canceled',
            updatedAt: new Date(),
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// ============================================================================
// USAGE INSTRUCTIONS
// ============================================================================

/*
1. Create these files in your project:
   - app/api/sync-jobs/route.ts
   - app/api/test-email/route.ts
   - app/api/user/profile/route.ts
   - app/api/matches/route.ts
   - app/api/webhooks/stripe/route.ts

2. Test each endpoint:
   - GET  /api/test-email          → Test email sending
   - POST /api/sync-jobs           → Trigger job sync (requires auth header)
   - GET  /api/user/profile        → Get user profile (requires JWT)
   - PUT  /api/user/profile        → Update user profile (requires JWT)
   - GET  /api/matches             → Get user's job matches (requires JWT)
   - POST /api/webhooks/stripe     → Handle Stripe events

3. Authentication headers:
   For cron jobs:
     Authorization: Bearer {CRON_SECRET}
   
   For user requests:
     Authorization: Bearer {firebase_jwt_token}
   
   For Stripe webhooks:
     stripe-signature: {signature_from_stripe}

4. Environment variables required:
   - CRON_SECRET
   - SENDER_EMAIL
   - SENDER_PASSWORD
   - SMTP_HOST
   - FIREBASE_ADMIN_* variables
   - STRIPE_* variables (optional)
*/