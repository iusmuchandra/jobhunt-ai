// lib/types.ts
export interface UserProfile {
  // Basic Info
  email: string;
  displayName: string;
  phone?: string;
  location?: string;
  
  // Professional Info
  currentTitle?: string;
  yearsOfExperience?: number;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  
  // Job Search Preferences
  searchKeywords: string[];
  seniorityLevels: string[];
  preferredLocations: string[];
  minMatchScore: number;
  
  // Auto-Apply Data
  resumeUrl?: string;
  resumeName?: string;
  coverLetterTemplate?: string;
  
  // Work History (for forms)
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
  
  // Additional Info
  eligibleToWorkInUS?: boolean;
  requiresSponsorship?: boolean;
  veteranStatus?: string;
  ethnicity?: string;
  gender?: string;
  disability?: string;
}