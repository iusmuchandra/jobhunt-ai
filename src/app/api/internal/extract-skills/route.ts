import { NextResponse } from 'next/server';
import { deepseek } from '@/lib/deepseek';

function parseSkills(content: string): string[] {
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed.topSkills)) {
      return parsed.topSkills
        .map((skill: unknown) => String(skill).trim())
        .filter(Boolean)
        .slice(0, 3);
    }

    return [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const expectedToken = process.env.INTERNAL_API_TOKEN || process.env.CRON_SECRET;

    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const description = typeof body?.description === 'string' ? body.description.trim() : '';

    if (!description) {
      return NextResponse.json({ error: 'Missing description' }, { status: 400 });
    }

    const prompt = `Extract the top 3 required skills from this job description.
Return JSON only with this exact shape: {"topSkills": ["skill1", "skill2", "skill3"]}

Job description:
${description.slice(0, 5000)}`;

    const content = await deepseek.chat([
      { role: 'system', content: 'You extract hiring requirements from job descriptions and respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.2, max_tokens: 180 });

    const topSkills = parseSkills(content);

    return NextResponse.json({ topSkills });
  } catch (error: any) {
    return NextResponse.json({
      error: 'Failed to extract skills',
      details: error?.message || 'Unknown error',
    }, { status: 500 });
  }
}
