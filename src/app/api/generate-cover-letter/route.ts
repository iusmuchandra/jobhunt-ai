// src/app/api/generate-cover-letter/route.ts - FIXED VERSION
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiter for cover letter generation
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 h'), // 5 cover letters per hour
  analytics: true,
  prefix: '@upstash/ratelimit:cover-letter',
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

  // Rate limiting by authenticated user
  const { success, reset, remaining } = await ratelimit.limit(uid);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. You can generate 5 cover letters per hour.',
        retryAfter: `${retryAfter} seconds`
      },
      { status: 429 }
    );
  }

  // 🔒 SECURITY FIX: Only get jobId from body - userId comes from token
  const { jobId } = body;

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  // Fetch user's profile (using VERIFIED userId)
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

  // Build user profile
  const userProfile = `
Name: ${userData?.displayName || 'Not provided'}
Email: ${userData?.email || 'Not provided'}
Current Title: ${userData?.currentTitle || 'Not provided'}
Years of Experience: ${userData?.yearsOfExperience || 'Not specified'}

Work History:
${userData?.workHistory?.map((work: any, idx: number) =>
  `${idx + 1}. ${work.title} at ${work.company} (${work.startDate} - ${work.current ? 'Present' : work.endDate})`
).join('\n') || 'No work history provided'}

Skills: ${userData?.searchKeywords?.join(', ') || 'Not specified'}
    `.trim();

  const prompt = `
You are an expert cover letter writer. Create a professional, compelling cover letter for this job application.

CANDIDATE'S PROFILE:
${userProfile}

TARGET JOB:
Title: ${job?.title}
Company: ${job?.company}
Description: ${job?.description || 'Not provided'}

Write a professional cover letter (250-350 words) that:
1. Opens with enthusiasm for the specific role
2. Highlights 2-3 relevant experiences from their profile
3. Shows understanding of the company/role
4. Closes with a strong call to action

Use professional but authentic tone. DO NOT use generic templates.
    `;

  // Call DeepSeek API
  const aiResponse = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are an expert cover letter writer who creates authentic, compelling cover letters."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 1000,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error("DeepSeek API Error:", errorText);
    return NextResponse.json({
      error: `AI API Error: ${aiResponse.status}`
    }, { status: 500 });
  }

  const aiData = await aiResponse.json();
  const coverLetter = aiData.choices?.[0]?.message?.content;

  if (!coverLetter) {
    return NextResponse.json({
      error: 'Failed to generate cover letter'
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    coverLetter,
    job: {
      title: job?.title,
      company: job?.company
    }
  });
}