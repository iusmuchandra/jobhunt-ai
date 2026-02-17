// src/app/api/chat/route.ts - FIXED VERSION
import { NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiter for chat
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, '1 h'), // 30 messages per hour
  analytics: true,
  prefix: '@upstash/ratelimit:chat',
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
  const { success, reset } = await ratelimit.limit(uid);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please wait before sending more messages.',
        retryAfter: `${retryAfter} seconds`
      },
      { status: 429 }
    );
  }

  const { messages, context } = body;

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
  }

  // Prepare system prompt with context
  const systemPrompt = `You are a helpful career assistant for JobHunt AI.
You help users with job search, resume writing, interview prep, and career advice.

${context ? `\nCurrent Context:\n${JSON.stringify(context, null, 2)}` : ''}

Be concise, practical, and encouraging. Provide specific, actionable advice.`;

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
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 800,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error("DeepSeek API Error:", errorText);
    return NextResponse.json({
      error: 'AI chat failed'
    }, { status: 500 });
  }

  const aiData = await aiResponse.json();
  const reply = aiData.choices?.[0]?.message?.content;

  if (!reply) {
    return NextResponse.json({
      error: 'No response generated'
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: reply
  });
}