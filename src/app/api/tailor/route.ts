// src/app/api/tailor/route.ts - FIXED VERSION
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize rate limiter
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 h'), // 10 requests per hour
  analytics: true,
  prefix: '@upstash/ratelimit:tailor',
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

  console.log('✅ Authenticated user:', uid);

  // Rate limiting - now rate limit by authenticated userId instead of IP
  const { success, limit, reset, remaining } = await ratelimit.limit(uid);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: `${retryAfter} seconds`,
        limit: 10,
        window: '1 hour'
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': retryAfter.toString()
        }
      }
    );
  }

  // 🔒 SECURITY FIX: Get jobId from body, but userId comes from verified token
  const { jobId, generatePDF } = body;

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  console.log('🔥 Fetching data for userId:', uid, 'jobId:', jobId);

  // 1. Fetch User's Profile Data (using VERIFIED userId)
  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const userData = userDoc.data();
  console.log('✅ User data fetched');

  // Check if user has uploaded a resume for PDF generation
  if (generatePDF && !userData?.resumeUrl) {
    return NextResponse.json({
      error: 'No resume found. Please upload your master resume in Settings → Resume first.'
    }, { status: 400 });
  }

  // 2. Fetch Job Details
  const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
  if (!jobDoc.exists) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const job = jobDoc.data();
  console.log('✅ Job data fetched:', job?.title);

  // 3. Build user profile from structured data
  const userProfile = `
Name: ${userData?.displayName || 'Not provided'}
Email: ${userData?.email || 'Not provided'}
Phone: ${userData?.phone || 'Not provided'}
Current Title: ${userData?.currentTitle || 'Not provided'}
Location: ${userData?.location || 'Not provided'}
Years of Experience: ${userData?.yearsOfExperience || 'Not specified'}
LinkedIn: ${userData?.linkedinUrl || 'Not provided'}
Portfolio: ${userData?.portfolioUrl || 'Not provided'}
GitHub: ${userData?.githubUrl || 'Not provided'}

Work History:
${userData?.workHistory?.map((work: any, idx: number) =>
  `${idx + 1}. ${work.title} at ${work.company}
   Duration: ${work.startDate} - ${work.current ? 'Present' : work.endDate}
   Key Achievements:
   ${work.description}`
).join('\n\n') || 'No work history provided'}

Education:
${userData?.education?.map((edu: any) =>
  `- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.graduationYear})`
).join('\n') || 'No education provided'}

Current Skills/Keywords: ${userData?.searchKeywords?.join(', ') || 'Not specified'}
    `.trim();

  // 4. Determine prompt type based on request
  const prompt = generatePDF ? `
You are an expert ATS Resume Writer. Your task is to tailor this person's EXISTING resume for THIS SPECIFIC JOB.

CRITICAL: Use the candidate's ACTUAL experience from their profile. Do NOT invent or change their job titles, companies, dates, or core accomplishments. Only reframe and re-emphasize what already exists.

CANDIDATE'S CURRENT PROFILE:
${userProfile}

TARGET JOB DETAILS:
Title: ${job?.title}
Company: ${job?.company}
Location: ${job?.location}
Description: ${job?.description || 'Not provided'}
Requirements: ${job?.requirements?.join(', ') || 'Not specified'}
Key Tags/Skills: ${job?.tags?.join(', ') || 'Not specified'}

YOUR TASK - GENERATE A TAILORED RESUME JSON:

Analyze the candidate's profile and rewrite it to highlight the most relevant experience for this specific job. Keep all facts accurate - only change the emphasis, ordering, and framing.

Return a JSON object with this EXACT structure:
{
  "professionalSummary": "A powerful 3-4 sentence summary that positions the candidate perfectly for this role. Use keywords from the job description naturally. Highlight their ACTUAL relevant achievements.",

  "skills": ["skill1", "skill2", "skill3", ...], // 15-20 skills that match the job requirements, prioritized by relevance to this role

  "workHistory": [
    {
      "company": "Actual Company Name from Profile",
      "title": "Actual Job Title from Profile",
      "startDate": "Actual Start Date",
      "endDate": "Present" or "Actual End Date",
      "current": true or false,
      "description": "• Rewrite achievements to emphasize relevance to target role\\n• Use metrics and impact from their actual experience\\n• Highlight technical skills that match job requirements\\n• Keep 4-6 bullets per role, focus on most relevant achievements"
    }
  ], // Include ALL work experiences, rewritten to emphasize relevance. Keep dates and titles EXACTLY as shown.

  "education": [
    {
      "school": "Actual School Name",
      "degree": "Actual Degree",
      "field": "Actual Field",
      "graduationYear": "Actual Year"
    }
  ] // Use EXACT education from profile
}

CRITICAL RULES:
1. Use ONLY information from the candidate's actual profile - do NOT invent experience
2. Keep company names, job titles, dates, and education EXACTLY as they appear
3. Rewrite bullet points to emphasize skills/experience relevant to the target job
4. Use POWERFUL ACTION VERBS: Architected, Led, Delivered, Optimized, Engineered, etc.
5. Include SPECIFIC METRICS where available (percentages, dollar amounts, scale, numbers)
6. Naturally incorporate JOB KEYWORDS from the job description into the bullets
7. Reorder experiences to put most relevant first if needed
8. Professional summary should connect their ACTUAL background to THIS specific role
9. Return ONLY valid JSON, no markdown formatting, no explanations, no extra text

Generate the tailored resume JSON now:
    ` : `
You are an expert ATS Resume Optimizer and Career Coach.

CANDIDATE'S CURRENT PROFILE:
${userProfile}

TARGET JOB DETAILS:
Title: ${job?.title}
Company: ${job?.company}
Location: ${job?.location}
Description: ${job?.description || 'Not provided'}
Requirements: ${job?.requirements?.join(', ') || 'Not specified'}
Key Tags/Skills: ${job?.tags?.join(', ') || 'Not specified'}

YOUR TASK:
Analyze their ACTUAL profile and provide specific suggestions for tailoring their resume to this role.

Provide:
1. **Match Analysis**: How their actual experience aligns with this role (2-3 sentences)
2. **Professional Summary Rewrite**: A 2-3 sentence summary emphasizing their relevant experience
3. **Keywords to Emphasize**: Critical ATS keywords from job description to naturally incorporate
4. **Experience Reframing**: How to rephrase their ACTUAL work experience to better match
5. **Skills to Highlight**: Top 8-10 skills most relevant to this job
6. **Recommended Changes**: Specific improvements while keeping their real experience

IMPORTANT:
- Base suggestions ONLY on their actual profile content
- Do NOT suggest inventing experiences
- Focus on reframing and repositioning their real skills
- Use markdown formatting for readability
- Keep response under 500 words

Output your suggestions now:
    `.trim();

  console.log('🤖 Calling DeepSeek API...');

  // 5. Call DeepSeek API
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
          content: generatePDF
            ? "You are an expert resume writer who tailors resumes based on candidates' ACTUAL experience. You never invent or falsify information. Return ONLY valid JSON, no markdown formatting."
            : "You are an expert resume writer and ATS optimization specialist who provides honest, practical advice based on candidates' real experience."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: generatePDF ? 4000 : 1000,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error("❌ DeepSeek API Error:", errorText);
    return NextResponse.json({
      error: `AI API Error: ${aiResponse.status}`
    }, { status: 500 });
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content;

  if (!content) {
    return NextResponse.json({
      error: 'No content generated from AI'
    }, { status: 500 });
  }

  if (generatePDF) {
    // Parse JSON response and prepare for PDF generation
    try {
      // Clean JSON response (remove markdown code blocks if present)
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/```\n?/g, '');
      }

      const resumeData = JSON.parse(cleanedContent);

      // Add user contact info
      const completeResumeData = {
        name: userData?.displayName || 'Your Name',
        email: userData?.email || '',
        phone: userData?.phone || '',
        location: userData?.location || '',
        linkedin: userData?.linkedinUrl,
        portfolio: userData?.portfolioUrl,
        github: userData?.githubUrl,
        targetJob: {
          title: job?.title || '',
          company: job?.company || ''
        },
        ...resumeData
      };

      console.log('✅ Resume data parsed and ready for PDF generation');

      return NextResponse.json({
        success: true,
        resumeData: completeResumeData,
        type: 'pdf'
      });

    } catch (parseError: any) {
      console.error('❌ JSON Parse Error:', parseError);
      console.error('Raw content:', content);
      return NextResponse.json({
        error: 'Failed to parse AI response. Please try again.',
        details: parseError.message
      }, { status: 500 });
    }
  } else {
    // Return suggestions text
    console.log('✅ Resume suggestions generated successfully');
    return NextResponse.json({
      success: true,
      tailoredContent: content,
      type: 'suggestions'
    });
  }
}