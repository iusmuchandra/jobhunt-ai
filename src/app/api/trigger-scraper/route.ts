import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userEmail } = await request.json();

    // Verify GitHub token exists
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      console.error('❌ GITHUB_TOKEN not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Trigger GitHub Actions workflow
    const response = await fetch(
      'https://api.github.com/repos/iusmuchandra/jobhunt-ai/actions/workflows/scraper.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main', // or 'master' - check your default branch name
          inputs: {
            reason: `New user signup: ${userEmail || 'unknown'}`
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API Error:', errorText);
      return NextResponse.json(
        { error: 'Failed to trigger scraper', details: errorText },
        { status: response.status }
      );
    }

    console.log('✅ Scraper triggered for:', userEmail);
    return NextResponse.json({ 
      success: true, 
      message: 'Scraper triggered successfully' 
    });

  } catch (error: any) {
    console.error('❌ Error triggering scraper:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}