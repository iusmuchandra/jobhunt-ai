// src/lib/auth-middleware.ts - CORRECTED VERSION
import { adminAuth } from '@/lib/firebase-admin';
import { NextResponse } from 'next/server';

/**
 * Verify Firebase ID token from Authorization header
 * Returns the authenticated user's UID
 * Throws error if token is missing or invalid
 */
export async function verifyAuth(request: Request): Promise<string> {
  try {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      throw new Error('Missing token');
    }

    // Verify the Firebase ID token
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    return decodedToken.uid;
  } catch (error: any) {
    console.error('Auth verification failed:', error.message);
    throw new Error('Unauthorized');
  }
}

/**
 * Wrapper function for protected API routes
 * Automatically verifies auth and handles errors
 */
export async function withAuth(
  request: Request,
  handler: (userId: string, request: Request) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const userId = await verifyAuth(request);
    return await handler(userId, request);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }
    
    console.error('Auth middleware error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}