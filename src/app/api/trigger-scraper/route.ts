// src/app/api/trigger-scraper/route.ts - FIXED VERSION
import { NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/api-auth';

// Use server-only secret (NOT NEXT_PUBLIC_*)
const SCRAPER_SECRET = process.env.SCRAPER_SECRET || process.env.CRON_SECRET;

export async function POST(request: Request) {
  try {
    // 🔒 SECURITY FIX: Verify authentication - either Firebase token or scraper secret
    const uid = await verifyAuthToken(request);
    const authHeader = request.headers.get('Authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!uid && (!providedSecret || providedSecret !== SCRAPER_SECRET)) {
      console.error('❌ Unauthorized scraper trigger attempt');
      return NextResponse.json({
        error: 'Unauthorized'
      }, { status: 401 });
    }

    console.log('✅ Authorized scraper trigger');

    // Get GitHub token
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO || 'iusmuchandra/jobhunt-ai';

    if (!GITHUB_TOKEN) {
      return NextResponse.json({
        error: 'GitHub token not configured'
      }, { status: 500 });
    }

    // Trigger GitHub Actions workflow
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/scraper.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main', // or your default branch
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub Actions trigger failed:', errorText);
      return NextResponse.json({
        error: 'Failed to trigger scraper',
        details: errorText
      }, { status: response.status });
    }

    console.log('✅ Scraper workflow triggered successfully');

    return NextResponse.json({
      success: true,
      message: 'Job scraper triggered successfully'
    });

  } catch (error: any) {
    console.error('Trigger Scraper Error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

// Optional: Add GET endpoint for health check
export async function GET() {
  return NextResponse.json({ 
    status: 'Scraper trigger endpoint active',
    method: 'POST with Authorization header required'
  });
}