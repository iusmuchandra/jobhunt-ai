// app/api/chat/route.ts - FIXED VERSION
import { NextResponse } from 'next/server';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"; // ✅ FIXED: Added /v1

export async function POST(req: Request) {
  if (!DEEPSEEK_API_KEY) {
    return NextResponse.json({ 
      error: 'DeepSeek API key not configured. Please add DEEPSEEK_API_KEY to your .env.local file.' 
    }, { status: 500 });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ 
        error: 'Invalid request: messages array required' 
      }, { status: 400 });
    }

    // Call DeepSeek API with proper URL
    const response = await fetch(DEEPSEEK_API_URL, {
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
            content: "You are an expert AI Career Coach for JobHunt AI. You help users write compelling cover letters, optimize resumes for ATS systems, and prepare for technical interviews. Be professional, encouraging, and provide actionable advice. Use markdown formatting for better readability." 
          },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("DeepSeek API Error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      
      // More helpful error messages
      if (response.status === 401) {
        throw new Error('Invalid DeepSeek API key. Please check your .env.local file.');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      } else {
        throw new Error(errorData.error?.message || `API Error: ${response.statusText}`);
      }
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error('No response content from AI');
    }

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ 
      error: error.message || 'Failed to get AI response. Please try again.' 
    }, { status: 500 });
  }
}