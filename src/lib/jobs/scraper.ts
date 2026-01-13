// lib/jobs/scraper.ts
// Serverless job scraping and matching engine

import { adminDb } from '@/lib/firebase-admin';
import { deepseek } from '@/lib/deepseek';
import axios from 'axios';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';

interface JobListing {
  title: string;
  company: string;
  location: string;
  description: string;
  requirements: string[];
  url: string;
  salary?: string;
  remote: boolean;
  postedAt: Date;
  source: string;
}

/**
 * Multi-source job scraper
 * Fetches jobs from various APIs and websites
 */
export class JobScraper {
  private sources = [
    { name: 'GitHub Jobs', url: 'https://jobs.github.com/positions.json' },
    { name: 'RemoteOK', url: 'https://remoteok.com/api' },
    { name: 'Adzuna', url: 'https://api.adzuna.com/v1/api/jobs' },
  ];

  async scrapeAllSources(): Promise<JobListing[]> {
    const jobs: JobListing[] = [];

    for (const source of this.sources) {
      try {
        const sourceJobs = await this.scrapeSource(source);
        jobs.push(...sourceJobs);
      } catch (error) {
        console.error(`Failed to scrape ${source.name}:`, error);
      }
    }

    return this.deduplicateJobs(jobs);
  }

  private async scrapeSource(source: { name: string; url: string }): Promise<JobListing[]> {
    // Implementation varies by source
    // This is a template - you'd customize for each API
    
    if (source.name === 'RemoteOK') {
      return this.scrapeRemoteOK();
    }
    
    // Add more sources here
    return [];
  }

  private async scrapeRemoteOK(): Promise<JobListing[]> {
    try {
      const response = await axios.get('https://remoteok.com/api', {
        headers: { 'User-Agent': 'JobHuntAI/1.0' }
      });

      const jobs = response.data.slice(1); // First item is metadata

      return jobs
        .filter((job: any) => job.position && job.company)
        .map((job: any) => ({
          title: job.position,
          company: job.company,
          location: job.location || 'Remote',
          description: job.description || '',
          requirements: this.extractRequirements(job.description),
          url: `https://remoteok.com/remote-jobs/${job.slug}`,
          salary: job.salary_min ? `$${job.salary_min}-$${job.salary_max}` : undefined,
          remote: true,
          postedAt: new Date(job.date),
          source: 'RemoteOK',
        }));
    } catch (error) {
      console.error('RemoteOK scraping failed:', error);
      return [];
    }
  }

  private extractRequirements(description: string): string[] {
    // Use AI to extract requirements
    const keywords = [
      'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python',
      'AWS', 'Docker', 'Kubernetes', 'SQL', 'MongoDB',
      'REST API', 'GraphQL', 'CI/CD', 'Agile', 'Git'
    ];

    return keywords.filter(keyword => 
      description.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private deduplicateJobs(jobs: JobListing[]): JobListing[] {
    const seen = new Set<string>();
    return jobs.filter(job => {
      const key = `${job.company}-${job.title}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

/**
 * AI-powered job matching engine
 * Matches users with jobs based on their profile
 */
export class JobMatchingEngine {
  async processNewJobs(jobs: JobListing[]): Promise<void> {
    // 1. Save jobs to Firestore
    const batch = adminDb.batch();
    const savedJobs: { id: string; data: JobListing }[] = [];

    for (const job of jobs) {
      const jobRef = adminDb.collection('jobs').doc();
      batch.set(jobRef, {
        ...job,
        createdAt: new Date(),
        indexed: false,
      });
      savedJobs.push({ id: jobRef.id, data: job });
    }

    await batch.commit();

    // 2. Match with all active users
    await this.matchJobsWithUsers(savedJobs);
  }

  public async matchJobsWithUsers(jobs: { id: string; data: JobListing }[]): Promise<void> {
    // Get all active users
    const usersSnapshot = await adminDb
      .collection('users')
      .where('active', '==', true)
      .get();

    const matchBatch = adminDb.batch();
    let matchCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userProfile = userDoc.data();

      for (const job of jobs) {
        // Calculate match score using AI
        const matchResult = await deepseek.calculateMatchScore(userProfile, job.data);

        // Only save high-quality matches (70+)
        if (matchResult.score >= 70) {
          const matchRef = adminDb.collection('user_job_matches').doc();
          matchBatch.set(matchRef, {
            userId: userDoc.id,
            jobId: job.id,
            matchScore: matchResult.score,
            matchReasons: matchResult.reasons,
            weaknesses: matchResult.weaknesses,
            notifiedAt: new Date(),
            viewed: false,
            applied: false,
          });

          matchCount++;

          // Send notification if user has email notifications enabled
          if (userProfile.notifications?.email && matchResult.score >= 85) {
            await this.sendMatchNotification(userProfile.email, job.data, matchResult.score);
          }
        }
      }
    }

    await matchBatch.commit();
    console.log(`Created ${matchCount} job matches`);
  }

  private async sendMatchNotification(email: string, job: JobListing, score: number): Promise<void> {
    // Integrate with email service (SendGrid, Resend, etc.)
    console.log(`Sending notification to ${email} for ${job.title} at ${job.company} (${score}% match)`);
  }

  async updateUserMatchScores(userId: string): Promise<void> {
    // Recalculate all match scores when user updates profile
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userProfile = userDoc.data();

    const jobsSnapshot = await adminDb
      .collection('jobs')
      .where('postedAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // Last 30 days
      .limit(500)
      .get();

    const batch = adminDb.batch();

    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      const matchResult = await deepseek.calculateMatchScore(userProfile, job);

      if (matchResult.score >= 70) {
        const matchRef = adminDb.collection('user_job_matches').doc();
        batch.set(matchRef, {
          userId,
          jobId: jobDoc.id,
          matchScore: matchResult.score,
          matchReasons: matchResult.reasons,
          weaknesses: matchResult.weaknesses,
          notifiedAt: new Date(),
          viewed: false,
          applied: false,
        });
      }
    }

    await batch.commit();
  }
}

/**
 * Cron job handler - Run this every 6 hours
 */
export async function runJobScrapingCron(): Promise<void> {
  console.log('Starting job scraping cron...');

  const scraper = new JobScraper();
  const matcher = new JobMatchingEngine();

  // 1. Scrape new jobs
  const jobs = await scraper.scrapeAllSources();
  console.log(`Scraped ${jobs.length} jobs`);

  // 2. Match with users
  await matcher.processNewJobs(jobs);

  // 3. Clean up old jobs (90+ days)
  await cleanupOldJobs();

  console.log('Job scraping cron completed');
}

async function cleanupOldJobs(): Promise<void> {
  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const oldJobsSnapshot = await adminDb
    .collection('jobs')
    .where('postedAt', '<', cutoffDate)
    .limit(500)
    .get();

  const batch = adminDb.batch();
  
  // FIX: Explicitly type 'doc' to QueryDocumentSnapshot to avoid "implicit any" error
  oldJobsSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => batch.delete(doc.ref));
  
  await batch.commit();

  console.log(`Deleted ${oldJobsSnapshot.size} old jobs`);
}

// API Route: /api/cron/scrape-jobs
export async function POST(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    await runJobScrapingCron();

    return Response.json({ success: true });
  } catch (error) {
    console.error('Cron job failed:', error);
    return Response.json({ error: 'Cron job failed' }, { status: 500 });
  }
}