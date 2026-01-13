import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function POST(req: Request) {
  try {
    const { userId, jobId, company, position } = await req.json();

    // Get user profile
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userProfile = userDoc.data();

    // Get job details
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    const job = jobDoc.data();

    // Use template or generate new
    let coverLetter = userProfile?.coverLetterTemplate || '';
    
    if (coverLetter) {
      // Replace variables
      coverLetter = coverLetter
        .replace(/{COMPANY}/g, company)
        .replace(/{POSITION}/g, position)
        .replace(/{YOUR_NAME}/g, userProfile?.displayName || 'Applicant');
    } else {
      // Generate using AI
      const prompt = `
Write a professional cover letter for this job application:

Applicant: ${userProfile?.displayName}
Current Title: ${userProfile?.currentTitle}
Experience: ${userProfile?.yearsOfExperience} years

Job: ${position} at ${company}
Requirements: ${job?.requirements?.slice(0, 5).join(', ')}

Write a compelling 200-word cover letter that:
1. Shows enthusiasm for the role
2. Highlights relevant experience
3. Explains why they're a great fit
4. Ends with a call to action

DO NOT use placeholders. Write the complete letter.
      `;

      const aiResponse = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        }),
      });

      const aiData = await aiResponse.json();
      coverLetter = aiData.choices[0].message.content;
    }

    return NextResponse.json({ coverLetter });

  } catch (error: any) {
    console.error("Cover letter generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}