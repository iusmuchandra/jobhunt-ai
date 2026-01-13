// app/api/analyze-job/route.ts
import { NextResponse } from 'next/server';
import deepseek from '@/lib/deepseek';

export async function POST(req: Request) {
  try {
    const { userProfile, job } = await req.json();

    if (!userProfile || !job) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    // Run AI tasks in parallel
    const [matchResult, analysis] = await Promise.all([
      // 1. Get structured score
      deepseek.calculateMatchScore(userProfile, job),
      
      // 2. Get conversational advice
      deepseek.chat([
        {
          role: 'system',
          content: 'You are a career coach analyzing job matches. Provide detailed, actionable advice.'
        },
        {
          role: 'user',
          content: `Analyze this job match and provide 2-3 sentences of advice:

Job: ${job.title} at ${job.company}
User Skills: ${userProfile.skills?.join(', ') || 'Not specified'}
Job Requirements: ${job.requirements?.join(', ') || 'Not specified'}

Provide specific advice on how to improve their application.`
        }
      ], { temperature: 0.7, max_tokens: 200 })
    ]);

    return NextResponse.json({ matchResult, analysis });

  } catch (error: any) {
    console.error('AI API Error:', error);
    return NextResponse.json(
      { error: error.message || 'AI analysis failed' }, 
      { status: 500 }
    );
  }
}