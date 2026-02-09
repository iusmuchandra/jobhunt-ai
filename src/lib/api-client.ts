// src/lib/api-client.ts - Helper for making authenticated API calls

import { auth } from '@/lib/firebase';

/**
 * Make an authenticated API call
 * Automatically adds Firebase ID token to Authorization header
 */
export async function authenticatedFetch(
  url: string, 
  options: RequestInit = {}
): Promise<Response> {
  // Get current user's ID token
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const token = await user.getIdToken();

  // Merge headers with Authorization
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
  };

  // Make the request
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * POST helper with authentication and JSON
 */
export async function authenticatedPost(
  url: string,
  data: any
): Promise<Response> {
  return authenticatedFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

/**
 * Example usage in your components:
 * 
 * // Old way (INSECURE - sends userId in body):
 * const response = await fetch('/api/tailor', {
 *   method: 'POST',
 *   body: JSON.stringify({ userId: user.uid, jobId })
 * });
 * 
 * // New way (SECURE - sends token in header):
 * const response = await authenticatedPost('/api/tailor', { 
 *   jobId 
 * });
 * 
 * // Or with custom options:
 * const response = await authenticatedFetch('/api/custom', {
 *   method: 'GET',
 *   // token is added automatically
 * });
 */