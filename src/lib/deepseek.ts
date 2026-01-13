import axios from 'axios';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class DeepSeekClient {
  private apiKey: string;
  private baseURL: string;
  private lastCallTime: number = 0;
  private minDelay: number = 1000; // 1 second between calls
  private rateLimitQueue: Array<() => Promise<any>> = [];
  private processingQueue: boolean = false;

  constructor() {
    // Only check for key when actually instantiating
    if (!DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }
    this.apiKey = DEEPSEEK_API_KEY;
    this.baseURL = DEEPSEEK_BASE_URL;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.minDelay) {
      const delay = this.minDelay - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastCallTime = Date.now();
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.rateLimitQueue.length === 0) return;
    
    this.processingQueue = true;
    
    while (this.rateLimitQueue.length > 0) {
      const task = this.rateLimitQueue.shift();
      if (task) {
        await this.enforceRateLimit();
        try {
          await task();
        } catch (error) {
          console.error('Error in rate-limited task:', error);
        }
      }
    }
    
    this.processingQueue = false;
  }

  private queueRequest<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.rateLimitQueue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.processingQueue) {
        this.processQueue();
      }
    });
  }

  async chat(messages: DeepSeekMessage[], options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  } = {}): Promise<string> {
    return this.queueRequest(async () => {
      try {
        const response = await axios.post<DeepSeekResponse>(
          `${this.baseURL}/v1/chat/completions`,
          {
            model: options.model || 'deepseek-chat',
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens || 2000,
            stream: options.stream || false,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout
          }
        );

        if (!response.data.choices || response.data.choices.length === 0) {
          throw new Error('No response from AI');
        }

        return response.data.choices[0].message.content;
      } catch (error: any) {
        console.error('DeepSeek API Error:', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        });
        
        if (error.response?.status === 429) {
          // Rate limited, increase delay and retry
          this.minDelay = Math.min(this.minDelay * 2, 10000); // Max 10 seconds
          throw new Error('Rate limited. Please try again in a moment.');
        } else if (error.response?.status === 401) {
          throw new Error('Invalid API key');
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('Request timeout. Please try again.');
        }
        
        throw new Error('Failed to get AI response');
      }
    });
  }

  // Analyze resume and extract structured data
  async analyzeResume(resumeText: string): Promise<{
    skills: string[];
    experience_level: 'entry' | 'mid' | 'senior' | 'staff' | 'executive';
    industries: string[];
    preferred_roles: string[];
    key_achievements: string[];
    years_of_experience: number;
    education?: string[];
    certifications?: string[];
  }> {
    const prompt = `Analyze this resume and extract structured information. Return ONLY valid JSON, no markdown or code blocks.

Resume:
${resumeText.substring(0, 5000)}  // Limit text length

Instructions:
1. Extract technical and soft skills
2. Determine experience level: entry (0-3 years), mid (3-7 years), senior (7-10 years), staff (10-15 years), executive (15+ years)
3. Identify industries (tech, finance, healthcare, etc.)
4. Identify preferred roles based on experience
5. Extract key achievements with metrics
6. Calculate total years of professional experience
7. Extract education degrees
8. Extract certifications if any

Return JSON with this exact structure:
{
  "skills": ["skill1", "skill2"],
  "experience_level": "entry|mid|senior|staff|executive",
  "industries": ["industry1", "industry2"],
  "preferred_roles": ["role1", "role2"],
  "key_achievements": ["achievement1", "achievement2"],
  "years_of_experience": number,
  "education": ["degree1", "degree2"],
  "certifications": ["cert1", "cert2"]
}`;

    const response = await this.chat([
      {
        role: 'system',
        content: 'You are an expert resume analyzer. Extract accurate, structured data. Always respond with valid JSON only, no additional text.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], { temperature: 0.3 }); 

    try {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (!Array.isArray(parsed.skills) || !parsed.experience_level || typeof parsed.years_of_experience !== 'number') {
        throw new Error('Invalid response structure');
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to parse resume analysis:', error, 'Response:', response);
      throw new Error('Failed to parse AI response. Please try again.');
    }
  }

  // Calculate job match score
  async calculateMatchScore(userProfile: any, job: any): Promise<{
    score: number;
    reasons: string[];
    weaknesses: string[];
    suggestions: string[];
  }> {
    const prompt = `Calculate a job match score (0-100) for this candidate and job. Return ONLY valid JSON.

Candidate Profile:
- Skills: ${JSON.stringify(userProfile.skills || [])}
- Experience Level: ${userProfile.experience_level}
- Years of Experience: ${userProfile.years_of_experience || 0}
- Preferred Roles: ${JSON.stringify(userProfile.preferred_roles || [])}
- Industries: ${JSON.stringify(userProfile.industries || [])}

Job:
- Title: ${job.title}
- Company: ${job.company}
- Requirements: ${JSON.stringify(job.requirements || [])}
- Skills Required: ${JSON.stringify(job.skills || [])}
- Experience Required: ${job.experience_required || 'Not specified'}

Scoring Weights:
1. Skills overlap (40%)
2. Experience match (30%)
3. Industry relevance (15%)
4. Role alignment (15%)

Return JSON:
{
  "score": number (0-100),
  "reasons": ["reason1", "reason2", "reason3"],
  "weaknesses": ["weakness1", "weakness2"],
  "suggestions": ["suggestion1", "suggestion2"]
}`;

    const response = await this.chat([
      {
        role: 'system',
        content: 'You are an expert job matching AI. Calculate accurate scores and provide actionable feedback. Always respond with valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], { temperature: 0.2 });

    try {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (parsed.score < 0 || parsed.score > 100) {
        parsed.score = Math.max(0, Math.min(100, parsed.score));
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to parse match score:', error, 'Response:', response);
      throw new Error('Failed to calculate match score');
    }
  }

  // Generate personalized cover letter
  async generateCoverLetter(
    userProfile: any,
    job: any,
    tone: 'professional' | 'casual' | 'enthusiastic' = 'professional'
  ): Promise<string> {
    const toneDescriptions = {
      professional: 'formal, polished, and business-like',
      casual: 'friendly, approachable, yet professional',
      enthusiastic: 'energetic, passionate, and excited',
    };

    const prompt = `Write a compelling cover letter for this job application.

Job Details:
- Title: ${job.title}
- Company: ${job.company}
- Requirements: ${JSON.stringify(job.requirements || [])}
- Description: ${job.description?.substring(0, 300) || 'Not provided'}

Candidate Background:
- Name: ${userProfile.name || 'Candidate'}
- Skills: ${JSON.stringify(userProfile.skills || [])}
- Experience Level: ${userProfile.experience_level}
- Years of Experience: ${userProfile.years_of_experience || 0}
- Key Achievements: ${JSON.stringify(userProfile.key_achievements || []).substring(0, 300)}

Tone: ${toneDescriptions[tone]}
Length: 250-300 words

Structure:
1. Personalized opening - mention the company/role specifically
2. 2-3 most relevant achievements with metrics
3. Skills that directly match job requirements
4. Enthusiasm for the role and company
5. Professional closing with call to action

Write a complete, ready-to-use cover letter with proper formatting.`;

    const response = await this.chat([
      {
        role: 'system',
        content: 'You are an expert career coach who writes compelling, personalized cover letters that get interviews. Generate professional, well-formatted letters.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], { temperature: 0.8, max_tokens: 1000 });

    return response.trim();
  }

  // Tailor resume for specific job
  async tailorResume(resumeText: string, jobDescription: string): Promise<{
    suggestions: string[];
    keywords_to_add: string[];
    sections_to_emphasize: string[];
    sample_bullet_points: string[];
  }> {
    const prompt = `Analyze how to optimize this resume for the target job. Return ONLY valid JSON.

Current Resume (first 2000 chars):
${resumeText.substring(0, 2000)}

Target Job Description (first 1000 chars):
${jobDescription.substring(0, 1000)}

Provide actionable suggestions to improve match. Focus on:
1. Adding missing keywords from job description
2. Emphasizing relevant sections
3. Rewriting bullet points to match job requirements
4. Quantifying achievements

Return JSON:
{
  "suggestions": ["suggestion1", "suggestion2"],
  "keywords_to_add": ["keyword1", "keyword2"],
  "sections_to_emphasize": ["section1", "section2"],
  "sample_bullet_points": ["bullet1", "bullet2"]
}`;

    const response = await this.chat([
      {
        role: 'system',
        content: 'You are an expert resume optimization advisor. Provide specific, actionable advice. Always respond with valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], { temperature: 0.5 });

    try {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Failed to parse resume suggestions:', error, 'Response:', response);
      throw new Error('Failed to parse AI response');
    }
  }

  // Generate interview prep questions
  async generateInterviewQuestions(job: any, userProfile: any): Promise<{
    technical: string[];
    behavioral: string[];
    company_specific: string[];
    salary_negotiation: string[];
  }> {
    const prompt = `Generate interview preparation questions for this job. Return ONLY valid JSON.

Job:
- Title: ${job.title}
- Company: ${job.company}
- Requirements: ${JSON.stringify(job.requirements || [])}
- Skills Required: ${JSON.stringify(job.skills || [])}

Candidate Level: ${userProfile.experience_level}
Candidate Skills: ${JSON.stringify(userProfile.skills || [])}

Generate 3-5 questions in each category:
1. Technical questions specific to the role and skills
2. Behavioral questions based on experience level
3. Company-specific questions (culture, products, industry)
4. Salary negotiation questions

Return JSON:
{
  "technical": ["question1", "question2"],
  "behavioral": ["question1", "question2"],
  "company_specific": ["question1", "question2"],
  "salary_negotiation": ["question1", "question2"]
}`;

    const response = await this.chat([
      {
        role: 'system',
        content: 'You are an expert interview coach. Generate relevant, challenging questions. Always respond with valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    try {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Failed to parse interview questions:', error, 'Response:', response);
      throw new Error('Failed to parse AI response');
    }
  }

  // Generate follow-up email after interview
  async generateFollowUpEmail(
    interviewDetails: any,
    userProfile: any,
    tone: 'professional' | 'grateful' | 'enthusiastic' = 'professional'
  ): Promise<string> {
    const prompt = `Write a follow-up email after a job interview.

Interview Details:
- Position: ${interviewDetails.position}
- Company: ${interviewDetails.company}
- Interviewers: ${interviewDetails.interviewers?.join(', ') || 'The interview team'}
- Key Discussion Points: ${interviewDetails.discussionPoints?.join('; ') || 'Various role-related topics'}
- Date: ${interviewDetails.date || 'Recently'}

Candidate:
- Name: ${userProfile.name || 'Candidate'}

Tone: ${tone}
Length: 150-200 words

Include:
1. Thank the interviewer(s)
2. Mention something specific from the conversation
3. Reiterate enthusiasm for the role
4. Professional closing

Write a complete, ready-to-use email with subject line.`;

    return await this.chat([
      {
        role: 'system',
        content: 'You are an expert at writing professional follow-up emails that leave a positive impression.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], { temperature: 0.7, max_tokens: 500 });
  }
}

// Singleton Pattern for Lazy Loading
class DeepSeekClientSingleton {
  private static instance: DeepSeekClient | null = null;
  
  static getInstance(): DeepSeekClient {
    if (!DeepSeekClientSingleton.instance) {
      DeepSeekClientSingleton.instance = new DeepSeekClient();
    }
    return DeepSeekClientSingleton.instance;
  }
}

export const deepseek = DeepSeekClientSingleton.getInstance();
export default deepseek;