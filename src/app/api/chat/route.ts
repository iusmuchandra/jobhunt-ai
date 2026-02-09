// src/app/api/chat/route.ts - FIXED VERSION
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-middleware';
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

export async function POST(req: Request) {
  try {
    // 🔒 SECURITY FIX: Verify authentication
    const userId = await verifyAuth(req);
    
    // Rate limiting
    const { success, reset } = await ratelimit.limit(userId);
    
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

    const { messages, context } = await req.json();

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

  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ 
        error: 'Unauthorized. Please sign in to chat.' 
      }, { status: 401 });
    }
    
    console.error("Chat Error:", error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}