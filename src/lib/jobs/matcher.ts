// lib/jobs/matcher.ts

import { adminDb } from '@/lib/firebase-admin';
import { deepseek } from '@/lib/deepseek';
import { NotificationService } from '@/lib/notifications';

export class JobMatchingEngine {
  async matchJobsWithUsers(jobIds: string[]): Promise<void> {
    // Get all active users
    const usersSnapshot = await adminDb
      .collection('users')
      .where('active', '==', true)
      .get();

    const matchBatch = adminDb.batch();
    let matchCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userProfile = userDoc.data();

      // Fetch job details
      const jobsSnapshot = await adminDb
        .collection('jobs')
        .where('__name__', 'in', jobIds.slice(0, 10)) // Firestore limit
        .get();

      for (const jobDoc of jobsSnapshot.docs) {
        const job = jobDoc.data();

        // Quick filter before AI scoring
        if (!this.quickMatch(userProfile, job)) continue;

        // AI-powered match scoring
        const matchResult = await deepseek.calculateMatchScore(
          userProfile, 
          job
        );

        // Only save high-quality matches (70+)
        if (matchResult.score >= 70) {
          const matchRef = adminDb.collection('user_job_matches').doc();
          matchBatch.set(matchRef, {
            userId: userDoc.id,
            jobId: jobDoc.id,
            matchScore: matchResult.score,
            matchReasons: matchResult.reasons,
            weaknesses: matchResult.weaknesses,
            notifiedAt: new Date(),
            viewed: false,
            applied: false,
          });

          matchCount++;

          // Send notification for 85+ matches
          if (matchResult.score >= 85 && userProfile.notifications?.email) {
            await this.sendMatchNotification(
              userProfile, 
              job, 
              matchResult
            );
          }
        }
      }
    }

    await matchBatch.commit();
    console.log(`Created ${matchCount} job matches`);
  }

  private quickMatch(profile: any, job: any): boolean {
    // Fast pre-filtering before expensive AI call
    const titleLower = job.title.toLowerCase();
    const keywords = profile.keywords || [];
    
    // Must match at least one keyword
    const hasKeyword = keywords.some((kw: string) => 
      titleLower.includes(kw.toLowerCase())
    );

    // Exclude unwanted terms
    const excludeTerms = ['intern', 'internship', 'entry-level'];
    const hasExcluded = excludeTerms.some((term: string) => 
      titleLower.includes(term)
    );

    return hasKeyword && !hasExcluded;
  }

  private async sendMatchNotification(
    user: any, 
    job: any, 
    matchResult: any
  ): Promise<void> {
    const notificationService = new NotificationService();
    await notificationService.send({
      userId: user.id,
      type: 'job_match',
      title: `New ${matchResult.score}% Match: ${job.title}`,
      body: `${job.company} is hiring!`,
      data: { job, matchScore: matchResult.score, reasons: matchResult.reasons },
      channels: ['email', 'in_app', 'push'],
    });
  }
}