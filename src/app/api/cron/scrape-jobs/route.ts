import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🚀 Starting job scraper...');
    
    // Get the absolute path to the script
    const scriptPath = process.cwd() + '/scripts/job_scraper.py';
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    
    const { stdout, stderr } = await execAsync(
      `${pythonCommand} "${scriptPath}"`,
      { 
        timeout: 600000, // 10 min
        cwd: process.cwd() + '/scripts',
        env: { ...process.env }
      }
    );

    console.log('📊 Scraper output:', stdout);
    if (stderr) console.error('⚠️ Scraper warnings:', stderr);

    // Parse the output to get stats
    const jobsMatch = stdout.match(/Total Jobs Found: (\d+)/);
    const matchesMatch = stdout.match(/Total Matches Created: (\d+)/);

    return NextResponse.json({ 
      success: true,
      message: 'Job scraper completed successfully',
      jobsScraped: jobsMatch ? parseInt(jobsMatch[1]) : 0,
      matchesCreated: matchesMatch ? parseInt(matchesMatch[1]) : 0,
      output: stdout.slice(-500) // Last 500 chars
    });

  } catch (error: any) {
    console.error('❌ Scraper failed:', error);
    
    return NextResponse.json({ 
      error: 'Job scraper failed',
      message: error.message,
      stderr: error.stderr?.slice(-500),
      stdout: error.stdout?.slice(-500)
    }, { status: 500 });
  }
}

// Also support GET for testing
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    message: 'Cron endpoint is active. Use POST to trigger scraper.',
    timestamp: new Date().toISOString()
  });
}