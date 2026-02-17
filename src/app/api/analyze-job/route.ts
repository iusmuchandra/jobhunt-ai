// src/app/api/analyze-job/route.ts - FIXED VERSION
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiter for job analysis
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '1 h'), // 20 analyses per hour
  analytics: true,
  prefix: '@upstash/ratelimit:analyze-job',
});

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function POST(request: Request) {
  // 1. Clone request before reading body (body can only be read once)
  const clonedRequest = request.clone();

  // 2. Verify token
  const uid = await verifyAuthToken(request);
  if (!uid) return unauthorizedResponse();

  // 3. Parse body from clone
  const body = await clonedRequest.json();

  // 4. Verify the userId in the body matches the token (where applicable)
  if (body.userId && body.userId !== uid) return forbiddenResponse();

  // Rate limiting
  const { success, reset, remaining } = await ratelimit.limit(uid);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Try again later.',
        retryAfter: `${retryAfter} seconds`
      },
      { status: 429 }
    );
  }

  const { jobId } = body;

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  // Fetch user profile
  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const userData = userDoc.data();

  // Fetch job details
  const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
  if (!jobDoc.exists) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const job = jobDoc.data();

  const prompt = `
Analyze this job posting and provide insights:

JOB DETAILS:
Title: ${job?.title}
Company: ${job?.company}
Location: ${job?.location}
Salary: ${job?.salary || 'Not specified'}
Description: ${job?.description}
Requirements: ${job?.requirements?.join(', ') || 'Not specified'}

USER PROFILE:
Skills: ${userData?.searchKeywords?.join(', ')}
Experience: ${userData?.yearsOfExperience || 'Not specified'} years
Current Title: ${userData?.currentTitle}

Provide a concise analysis (200 words max):
1. Key Requirements: Top 3 must-have skills
2. Match Assessment: How well the user's profile fits
3. Red Flags: Any concerning aspects of the job posting
4. Salary Insights: If salary info available, comment on market rate
5. Next Steps: Actionable advice for applying

Be honest and helpful.
    `;

    const aiResponse = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a career advisor analyzing job postings." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      return NextResponse.json({
        error: 'AI analysis failed'
      }, { status: 500 });
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices?.[0]?.message?.content;

    return NextResponse.json({
      success: true,
      analysis,
      job: {
        title: job?.title,
        company: job?.company
      }
    });
}