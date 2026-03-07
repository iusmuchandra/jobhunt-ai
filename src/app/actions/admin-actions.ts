// src/app/actions/admin-actions.ts - CORRECTED VERSION
'use server';

import { adminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_CANDIDATES } from '@/lib/session-cookie';

type CookieStoreLike = {
  get: (name: string) => { value?: string } | undefined;
};

export async function requireAdminWithCookieStore(cookieStore: CookieStoreLike) {
  const sessionCookie = SESSION_COOKIE_CANDIDATES
    .map((cookieName) => cookieStore.get(cookieName)?.value)
    .find(Boolean);

  if (!sessionCookie) {
    throw new Error('Not authenticated');
  }

  const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);

  if (!decodedClaims?.admin) {
    throw new Error('Not authorized');
  }

  return decodedClaims;
}

async function requireAdmin() {
  const cookieStore = cookies();
  return requireAdminWithCookieStore(cookieStore);
}

/**
 * Server action to trigger job scraper
 * This runs on the server, keeping CRON_SECRET secure
 */
export async function triggerJobScraper() {
  try {
    await requireAdmin();
    
    const CRON_SECRET = process.env.CRON_SECRET;
    
    if (!CRON_SECRET) {
      throw new Error('CRON_SECRET not configured');
    }

    // Call your trigger-scraper endpoint with the secret
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/trigger-scraper`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to trigger scraper: ${error}`);
    }

    const data = await response.json();
    return { success: true, data };
    
  } catch (error: any) {
    console.error('Trigger scraper error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to trigger scraper' 
    };
  }
}

/**
 * Server action to sync jobs
 */
export async function syncJobs() {
  try {
    await requireAdmin();
    
    const CRON_SECRET = process.env.CRON_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/sync-jobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to sync jobs');
    }

    const data = await response.json();
    return { success: true, data };
    
  } catch (error: any) {
    console.error('Sync jobs error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to sync jobs' 
    };
  }
}
