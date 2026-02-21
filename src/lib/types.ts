// src/lib/types.ts — Single canonical UserProfile interface

export interface UserProfile {
  // Auth & Identity
  uid: string;
  email: string;
  displayName: string | null;
  photoURL?: string | null;
  phone?: string;

  // Subscription
  tier: 'free' | 'pro' | 'premium' | 'enterprise';
  subscriptionStatus?: string;
  subscriptionId?: string;
  stripeCustomerId?: string;
  currentPeriodEnd?: any;

  // Onboarding
  onboarding_completed: boolean;
  profile_completed: boolean;
  active: boolean;

  // Professional Info
  currentTitle?: string;
  yearsOfExperience?: number;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  skills?: string[];
  experience_level?: 'entry' | 'mid' | 'senior' | 'staff';

  // Job Search Preferences
  searchKeywords: string[];
  excludeKeywords: string[];  // CANONICAL — use this everywhere, not excludedKeywords
  seniorityLevels: string[];
  preferredLocations: string[];
  minMatchScore: number;

  // Resume & Application
  resumeUrl?: string;
  resumeName?: string;
  coverLetterTemplate?: string;

  // Work History
  workHistory?: {
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
  }[];

  // Education
  education?: {
    school: string;
    degree: string;
    field: string;
    graduationYear: string;
  }[];

  // EEO / Additional
  eligibleToWorkInUS?: boolean;
  requiresSponsorship?: boolean;
  veteranStatus?: string;
  ethnicity?: string;
  gender?: string;
  disability?: string;

  // Stats
  stats?: {
    jobsFound: number;
    jobsApplied: number;
    interviews: number;
  };

  // Notifications
  notifications?: {
    email: boolean;
    sms: boolean;
    push: boolean;
    in_app: boolean;
  };

  // AI Settings
  aiSettings?: {
    matchThreshold?: number;
    resumeAnalyzed?: boolean;
    lastResumeUpdate?: any;
  };
  resumeAnalysis?: any;

  // Timestamps
  createdAt?: any;
  updatedAt?: any;
  preferencesUpdatedAt?: any;
  desiredSalary?: string;
}

export interface JobProfile {
  id: string;
  name: string;
  emoji: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
  jobTitles: string[];
  keywords: string[];
  excludeKeywords: string[];
  location: string;
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryMin: number;
  experienceLevel: string;
  jobTypes: string[];
  industries: string[];
}