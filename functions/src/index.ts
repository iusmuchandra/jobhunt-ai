import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { stripe, constructWebhookEvent, getTierFromPriceId, isSubscriptionActive } from './lib/stripe';
import { deepseek } from './lib/deepseek';
import { sendEmail } from './lib/email';
import Stripe from 'stripe';

admin.initializeApp();

const db = admin.firestore();

// ==================== STRIPE WEBHOOKS ====================

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  try {
    const event = await constructWebhookEvent(req.rawBody, signature);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error}`);
  }
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier;

  if (!userId || !tier) {
    console.error('Missing metadata in checkout session');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

  await db.collection('users').doc(userId).update({
    tier,
    stripeCustomerId: session.customer as string,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: admin.firestore.Timestamp.fromDate(
      new Date(subscription.current_period_end * 1000)
    ),
  });

  // Send welcome email
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (userData?.email) {
    await sendEmail({
      to: userData.email,
      subject: 'Welcome to JobHunt AI Pro! 🎉',
      html: `
        <h1>Welcome to JobHunt AI ${tier.charAt(0).toUpperCase() + tier.slice(1)}!</h1>
        <p>Thank you for subscribing. Your account is now active with ${tier} features.</p>
        <p>Here's what you can do now:</p>
        <ul>
          <li>Track up to ${tier === 'pro' ? '50' : tier === 'premium' ? 'unlimited' : '500+'} companies</li>
          <li>Get AI-powered job matching</li>
          <li>Generate personalized cover letters</li>
          <li>Receive instant job alerts</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">Go to Dashboard →</a></p>
      `,
    });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) return;

  const tier = getTierFromPriceId(subscription.items.data[0].price.id);

  await db.collection('users').doc(userId).update({
    tier: tier || 'free',
    subscriptionStatus: subscription.status,
    currentPeriodEnd: admin.firestore.Timestamp.fromDate(
      new Date(subscription.current_period_end * 1000)
    ),
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) return;

  await db.collection('users').doc(userId).update({
    tier: 'free',
    subscriptionStatus: 'canceled',
    subscriptionId: admin.firestore.FieldValue.delete(),
    currentPeriodEnd: admin.firestore.FieldValue.delete(),
  });

  // Send cancellation email
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (userData?.email) {
    await sendEmail({
      to: userData.email,
      subject: 'Subscription Canceled',
      html: `
        <h2>Sorry to see you go!</h2>
        <p>Your subscription has been canceled. You'll retain access until the end of your billing period.</p>
        <p>We'd love to hear your feedback on how we can improve.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings">Reactivate Subscription →</a></p>
      `,
    });
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Payment succeeded:', invoice.id);
  // Additional logging or analytics can go here
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscription = invoice.subscription;
  if (!subscription) return;

  const subObj = await stripe.subscriptions.retrieve(subscription as string);
  const userId = subObj.metadata?.userId;

  if (!userId) return;

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (userData?.email) {
    await sendEmail({
      to: userData.email,
      subject: 'Payment Failed - Action Required',
      html: `
        <h2>Payment Failed</h2>
        <p>We couldn't process your payment. Please update your payment method to continue using JobHunt AI.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/billing">Update Payment Method →</a></p>
      `,
    });
  }
}

// ==================== AI MATCHING ====================

export const analyzeResume = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { resumeText } = data;

  if (!resumeText) {
    throw new functions.https.HttpsError('invalid-argument', 'Resume text is required');
  }

  try {
    const analysis = await deepseek.analyzeResume(resumeText);

    // Store analysis in user document
    await db.collection('users').doc(context.auth.uid).update({
      resumeAnalysis: analysis,
      'aiSettings.resumeAnalyzed': true,
      'aiSettings.lastResumeUpdate': admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, analysis };
  } catch (error) {
    console.error('Resume analysis error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to analyze resume');
  }
});

export const matchJobToUser = functions.firestore
  .document('jobs/{jobId}')
  .onCreate(async (snap, context) => {
    const job = snap.data();
    const jobId = context.params.jobId;

    // Get all active users
    const usersSnapshot = await db
      .collection('users')
      .where('subscriptionStatus', '==', 'active')
      .get();

    const matchPromises = usersSnapshot.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      const userId = userDoc.id;

      // Quick filter - check basic criteria
      if (!matchesBasicCriteria(job, userData.preferences)) {
        return null;
      }

      try {
        // Calculate AI match score
        const matchResult = await deepseek.calculateMatchScore(
          userData.resumeAnalysis || {},
          job
        );

        const matchThreshold = userData.aiSettings?.matchThreshold || 70;

        // Only create match if score is above threshold
        if (matchResult.score >= matchThreshold) {
          const matchRef = db.collection('user_job_matches').doc();

          await matchRef.set({
            userId,
            jobId,
            matchScore: matchResult.score,
            matchReasons: matchResult.reasons,
            weaknesses: matchResult.weaknesses,
            notified: false,
            viewed: false,
            applied: false,
            saved: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Send notification
          await notifyUserAboutJob(userId, jobId, matchResult.score);

          return matchRef.id;
        }

        return null;
      } catch (error) {
        console.error(`Error matching job to user ${userId}:`, error);
        return null;
      }
    });

    await Promise.all(matchPromises);
  });

function matchesBasicCriteria(job: any, preferences: any): boolean {
  if (!preferences) return true;

  // Check keywords
  if (preferences.keywords && preferences.keywords.length > 0) {
    const titleLower = job.title.toLowerCase();
    const hasKeyword = preferences.keywords.some((kw: string) =>
      titleLower.includes(kw.toLowerCase())
    );
    if (!hasKeyword) return false;
  }

  // Check exclude keywords
  if (preferences.excludeKeywords && preferences.excludeKeywords.length > 0) {
    const titleLower = job.title.toLowerCase();
    const hasExclude = preferences.excludeKeywords.some((kw: string) =>
      titleLower.includes(kw.toLowerCase())
    );
    if (hasExclude) return false;
  }

  // Check location
  if (preferences.locations && preferences.locations.length > 0) {
    const hasLocation = preferences.locations.some((loc: string) =>
      job.location?.toLowerCase().includes(loc.toLowerCase())
    );
    if (!hasLocation && !job.remote) return false;
  }

  return true;
}

async function notifyUserAboutJob(userId: string, jobId: string, matchScore: number) {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (!userData?.email) return;

  const jobDoc = await db.collection('jobs').doc(jobId).get();
  const jobData = jobDoc.data();

  if (!jobData) return;

  await sendEmail({
    to: userData.email,
    subject: `New Job Match: ${jobData.title} at ${jobData.company} (${matchScore}% match)`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0;">🎯 ${matchScore}% Match!</h1>
          <p style="margin: 10px 0 0 0; font-size: 18px;">New job opportunity for you</p>
        </div>
        
        <div style="padding: 30px; background: #f8fafc;">
          <h2 style="color: #1e293b; margin-top: 0;">${jobData.title}</h2>
          <p style="color: #64748b; font-size: 16px; margin: 10px 0;">
            <strong>${jobData.company}</strong> • ${jobData.location}
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2563eb; margin-top: 0;">Why this is a great match:</h3>
            <ul style="color: #475569; line-height: 1.8;">
              ${(jobData.matchReasons || ['Strong skills alignment', 'Experience level fits']).map((reason: string) => 
                `<li>${reason}</li>`
              ).join('')}
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/jobs/${jobId}" 
               style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Full Job Details →
            </a>
          </div>
          
          <p style="color: #94a3b8; font-size: 14px; text-align: center; margin-top: 30px;">
            Apply within 24 hours for the best chance of getting noticed!
          </p>
        </div>
      </div>
    `,
  });

  // Mark as notified
  await db.collection('user_job_matches')
    .where('userId', '==', userId)
    .where('jobId', '==', jobId)
    .limit(1)
    .get()
    .then(snapshot => {
      if (!snapshot.empty) {
        snapshot.docs[0].ref.update({
          notified: true,
          notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
}

// ==================== COVER LETTER GENERATION ====================

export const generateCoverLetter = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { jobId, tone = 'professional' } = data;

  // Check subscription
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData || !['pro', 'premium', 'enterprise'].includes(userData.tier)) {
    throw new functions.https.HttpsError('permission-denied', 'Pro subscription required');
  }

  try {
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    const jobData = jobDoc.data();

    if (!jobData) {
      throw new functions.https.HttpsError('not-found', 'Job not found');
    }

    const coverLetter = await deepseek.generateCoverLetter(
      userData.resumeAnalysis || {},
      jobData,
      tone
    );

    // Store generation
    await db.collection('ai_generations').add({
      userId: context.auth.uid,
      jobId,
      type: 'cover_letter',
      content: coverLetter,
      tone,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, coverLetter };
  } catch (error) {
    console.error('Cover letter generation error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate cover letter');
  }
});

// ==================== INTERVIEW PREP ====================

export const generateInterviewQuestions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { jobId } = data;

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData || !['premium', 'enterprise'].includes(userData.tier)) {
    throw new functions.https.HttpsError('permission-denied', 'Premium subscription required');
  }

  try {
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    const jobData = jobDoc.data();

    if (!jobData) {
      throw new functions.https.HttpsError('not-found', 'Job not found');
    }

    const questions = await deepseek.generateInterviewQuestions(
      jobData,
      userData.resumeAnalysis || {}
    );

    return { success: true, questions };
  } catch (error) {
    console.error('Interview questions generation error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate questions');
  }
});

// ==================== USER STATS ====================

export const updateUserStats = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const usersSnapshot = await db.collection('users').get();

    const updatePromises = usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;

      const matchesSnapshot = await db
        .collection('user_job_matches')
        .where('userId', '==', userId)
        .get();

      const applicationsSnapshot = await db
        .collection('applications')
        .where('userId', '==', userId)
        .get();

      const interviewsCount = applicationsSnapshot.docs.filter(
        doc => doc.data().status === 'interviewing'
      ).length;

      await userDoc.ref.update({
        'stats.jobsFound': matchesSnapshot.size,
        'stats.jobsApplied': applicationsSnapshot.size,
        'stats.interviews': interviewsCount,
      });
    });

    await Promise.all(updatePromises);
  });