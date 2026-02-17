"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  limit, 
  increment
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Building2, MapPin, Clock, ExternalLink, CheckCircle, Bookmark, Check, Loader2, Zap, Download, DollarSign, Users, Layers, Target, AlertCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import ApplicationStatusTracker from '@/components/ApplicationStatusTracker';

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  postedAt: any;
  tags: string[];
  description?: string;
  requirements?: string[];
  salary?: string;
  jobType?: string;
  experienceLevel?: string;
  skills?: string[];
}


export default function JobDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [autoApplying, setAutoApplying] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [matchScore, setMatchScore] = useState<number>(0);
  const [matchDetails, setMatchDetails] = useState<{
    reasons: string[];
    weaknesses: string[];
    suggestions: string[];
  }>({ reasons: [], weaknesses: [], suggestions: [] });
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [showApplicationStatus, setShowApplicationStatus] = useState(false);
  
  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false); // Changed to false initially
  const [aiError, setAiError] = useState<string | null>(null);
  
  // Navigation state - track where user came from
  const [referrer, setReferrer] = useState<string>('/dashboard');
  
  // Ref to prevent duplicate AI calls
  const aiCallMadeRef = useRef(false);

  // Store referrer on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && document.referrer) {
      const ref = new URL(document.referrer).pathname;
      if (ref.includes('/jobs')) {
        setReferrer('/jobs');
      } else if (ref.includes('/dashboard')) {
        setReferrer('/dashboard');
      }
    }
  }, []);

  const parseSalary = useCallback((salaryStr: string): number | null => {
    if (!salaryStr) return null;
    
    try {
      const numbers = salaryStr.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        let salary = parseInt(numbers[0]);
        
        if (salaryStr.toLowerCase().includes('k')) {
          salary *= 1000;
        }
        
        if (salaryStr.toLowerCase().includes('hour') || salaryStr.includes('/hr')) {
          salary *= 2000;
        }
        
        return salary;
      }
    } catch (error) {
      console.error('Error parsing salary:', error);
    }
    
    return null;
  }, []);

  // IMPROVED: More robust match score calculation with fallbacks
  const calculateMatchScore = useCallback((job: Job, userProfile: UserProfile): number => {
    if (!job || !userProfile) return 0;
    
    
    // If no user skills, provide a basic score
    if (!userProfile.skills || userProfile.skills.length === 0) {
      return 50; // Base score when profile is incomplete
    }
    
    let score = 0;
    const userSkills = userProfile.skills || [];
    const jobTags = job.tags || [];
    const jobSkills = job.skills || [];
    
    const weights = {
      skills: 0.40,
      experience: 0.25,
      location: 0.15,
      salary: 0.10,
      roleFit: 0.10
    };
    
    // 1. Skill Match
    const allJobKeywords = [...new Set([...jobTags, ...jobSkills])];
    if (allJobKeywords.length > 0) {
      const matchedSkills = userSkills.filter((skill: string) => 
        allJobKeywords.some(keyword => 
          keyword.toLowerCase().includes(skill.toLowerCase()) || 
          skill.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      score += (matchedSkills.length / allJobKeywords.length) * 100 * weights.skills;
    }
    
    // 2. Experience Level Match
    const userExperience = userProfile.yearsOfExperience || 0;
    if (job.experienceLevel) {
      const level = job.experienceLevel.toLowerCase();
      if (level.includes('senior') && userExperience >= 5) {
        score += 100 * weights.experience;
      } else if (level.includes('mid') && userExperience >= 2 && userExperience < 5) {
        score += 75 * weights.experience;
      } else if (level.includes('entry') && userExperience <= 2) {
        score += 100 * weights.experience;
      } else if (userExperience >= 3) {
        score += Math.min(userExperience / 10, 1) * 100 * weights.experience;
      }
    }
    
    // 3. Location Match
    const userLocation = (userProfile.location || '').toLowerCase();
    const jobLocation = (job.location || '').toLowerCase();
    const isRemote = jobLocation.includes('remote') || jobLocation.includes('anywhere');
    const isHybrid = jobLocation.includes('hybrid');
    
    if (isRemote) {
      score += 100 * weights.location;
    } else if (isHybrid) {
      score += 50 * weights.location;
    } else if (userLocation) {
      const userCity = userLocation.split(',')[0]?.trim();
      const jobCity = jobLocation.split(',')[0]?.trim();
      if (userCity && jobCity && (jobLocation.includes(userCity) || userLocation.includes(jobCity))) {
        score += 100 * weights.location;
      }
    }
    
    // 4. Salary Match
    if (job.salary && userProfile.desiredSalary) {
      const jobSalary = parseSalary(job.salary);
      const userSalary = parseSalary(userProfile.desiredSalary);
      if (jobSalary && userSalary) {
        const salaryRatio = jobSalary / userSalary;
        if (salaryRatio >= 1) {
          score += 100 * weights.salary;
        } else if (salaryRatio >= 0.8) {
          score += 80 * weights.salary;
        } else if (salaryRatio >= 0.6) {
          score += 50 * weights.salary;
        }
      }
    }
    
    // 5. Role Fit
    const titleKeywords = job.title.toLowerCase().split(/[\s\-]+/);
    const commonRoles = ['engineer', 'developer', 'manager', 'analyst', 'designer', 'specialist'];
    const userRoleMatch = commonRoles.some(role => 
      userSkills.some(skill => skill.toLowerCase().includes(role)) ||
      titleKeywords.some(keyword => keyword.includes(role))
    );
    if (userRoleMatch) {
      score += 100 * weights.roleFit;
    }
    
    const finalScore = Math.min(Math.round(score), 100);
    return finalScore;
  }, [parseSalary]);

  const handleApplyAndTrack = async (applicationData: {
    jobId: string;
    jobTitle: string;
    company: string;
    jobUrl: string;
    matchScore?: number;
    salary?: string;
    location?: string;
    method?: string;
    status?: string;
  }) => {
    if (!user) return null;

    try {
      const docRef = await addDoc(collection(db, 'applications'), {
        userId: user.uid,
        ...applicationData,
        status: applicationData.status || 'applied',
        appliedAt: serverTimestamp(),
        source: 'jobhunt-ai',
        notes: applicationData.method === 'auto-apply' ? 'AI auto-apply' : 'Applied via company website',
        progress: 0,
        progressMessage: 'Application submitted',
        matchDetails: matchDetails,
        aiAnalysis: aiAnalysis
      });

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        'stats.applications': increment(1),
        'stats.lastAppliedAt': serverTimestamp()
      });

      return docRef.id;
    } catch (error) {
      console.error('Error tracking application:', error);
      return null;
    }
  };

  // OPTIMIZED: Load job and profile data FIRST, AI analysis in background
  useEffect(() => {
    if (!id || !user) return;
    const currentUser = user; // narrowed: guaranteed non-null from here down
    
    let isMounted = true;
    
    async function loadJobAndProfile() {
      setLoading(true);
      try {
        // Parallel load of job and profile
        const [jobSnapshot, userSnapshot] = await Promise.all([
          getDoc(doc(db, 'jobs', id as string)),
          getDoc(doc(db, 'users', currentUser.uid))
        ]);
        
        if (!isMounted) return;
        
        if (jobSnapshot.exists()) {
          const jobData = { id: jobSnapshot.id, ...jobSnapshot.data() } as Job;
          setJob(jobData);
          
          let calculatedScore = 0;
          
          if (userSnapshot.exists()) {
            const userData = { uid: userSnapshot.id, ...userSnapshot.data() } as UserProfile;
            setUserProfile(userData);
            
            // Calculate score immediately for instant display
            calculatedScore = calculateMatchScore(jobData, userData);
            setMatchScore(calculatedScore);
            
            // Provide basic match details immediately
            const basicReasons = [];
            if (calculatedScore >= 70) {
              basicReasons.push(`Strong ${calculatedScore}% match based on your profile`);
              if (userData.skills?.length > 0) {
                basicReasons.push(`Your skills align with ${jobData.tags?.length || 0} required technologies`);
              }
            } else if (calculatedScore >= 50) {
              basicReasons.push(`Good ${calculatedScore}% match - some skills align`);
            } else {
              basicReasons.push(`${calculatedScore}% match - consider developing relevant skills`);
            }
            
            setMatchDetails({
              reasons: basicReasons,
              weaknesses: ['AI analysis loading...'],
              suggestions: ['Detailed suggestions coming soon...']
            });
          }

          // Mark as viewed (non-blocking)
          const markAsViewed = async () => {
            try {
              const matchQuery = query(
                collection(db, 'user_job_matches'), 
                where('userId', '==', currentUser.uid), 
                where('jobId', '==', id), 
                limit(1)
              );
              const snapshot = await getDocs(matchQuery);
              if (!snapshot.empty) {
                await updateDoc(snapshot.docs[0].ref, { 
                  viewed: true, 
                  viewedAt: serverTimestamp() 
                });
              }
            } catch (err) {
              console.error("Error marking as viewed:", err);
            }
          };
          markAsViewed();
          
          // Check if saved (non-blocking)
          const checkSaved = async () => {
            try {
              const savedQuery = query(
                collection(db, 'saved_jobs'),
                where('userId', '==', currentUser.uid),
                where('jobId', '==', id)
              );
              const savedSnapshot = await getDocs(savedQuery);
              if (isMounted) setIsSaved(!savedSnapshot.empty);
            } catch (err) {
              console.error("Error checking saved status:", err);
            }
          };
          checkSaved();
        }
        
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    
    loadJobAndProfile();
    
    return () => {
      isMounted = false;
    };
  }, [id, user, calculateMatchScore]);

  // SEPARATE EFFECT: Load AI analysis in background (non-blocking)
  useEffect(() => {
    if (!job || !userProfile || aiCallMadeRef.current) return;
    
    let isMounted = true;
    const aiController = new AbortController();
    
    async function loadAIAnalysis() {
      aiCallMadeRef.current = true;
      setAiLoading(true);
      setAiError(null);
      
      try {
        const response = await fetch('/api/analyze-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userProfile, job }),
          signal: aiController.signal
        });
        
        if (!isMounted) return;
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.matchResult) {
          setMatchDetails({
            reasons: data.matchResult.reasons || [],
            weaknesses: data.matchResult.weaknesses || [],
            suggestions: data.matchResult.suggestions || []
          });
          
          // Update score if AI provides a better one
          if (data.matchResult.score && data.matchResult.score !== matchScore) {
            setMatchScore(data.matchResult.score);
          }
        }
        
        if (data.analysis) {
          setAiAnalysis(data.analysis);
        }
        
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        
        if (!isMounted) return;
        
        console.error('AI API error:', err);
        setAiError('AI analysis unavailable');
        
        // Keep the basic analysis we set earlier
        
      } finally {
        if (isMounted) setAiLoading(false);
      }
    }
    
    // Small delay to let page render first
    const timer = setTimeout(loadAIAnalysis, 300);
    
    return () => {
      clearTimeout(timer);
      isMounted = false;
      aiController.abort();
    };
  }, [job, userProfile, matchScore]);

  const handleTrackApplication = async () => {
    if (!user || !job) return;
    
    setApplying(true);
    
    try {
      await handleApplyAndTrack({
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        jobUrl: job.url,
        location: job.location || 'Location not specified',
        salary: job.salary || 'Salary not specified',
        matchScore: matchScore,
        method: 'manual',
        status: 'applied'
      });

      window.open(job.url, '_blank', 'noopener,noreferrer');
      
      setTimeout(() => {
        router.push('/applications');
      }, 2000);
      
    } catch (error) {
      console.error("Error in application flow:", error);
      toast({ title: 'Error', description: 'Failed to track application. Please try again.', variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const handleAutoApply = async () => {
    if (!user || !job) return;
    
    setAutoApplying(true);
    
    try {
      if (!userProfile?.resumeUrl) {
        toast({ title: 'Warning', description: 'Please upload your master resume in Settings → Resume first!', variant: 'destructive' });
        router.push('/settings/resume');
        setAutoApplying(false);
        return;
      }

      const applicationId = await handleApplyAndTrack({
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        jobUrl: job.url,
        location: job.location || 'Location not specified',
        salary: job.salary || 'Salary not specified',
        matchScore: matchScore,
        method: 'auto-apply',
        status: 'queued'
      });

      if (applicationId) {
        setApplicationId(applicationId);
        setShowApplicationStatus(true);
      } else {
        throw new Error('Failed to create application record');
      }
      
    } catch (error) {
      console.error("Auto-apply error:", error);
      toast({ title: 'Error', description: 'Failed to start auto-apply. Please try again.', variant: 'destructive' });
    } finally {
      setAutoApplying(false);
    }
  };

  const handleApplicationComplete = (finalStatus: string) => {
    if (finalStatus === 'applied') {
      setTimeout(() => {
        router.push('/applications');
      }, 3000);
    }
  };

  const handleSaveJob = async () => {
    if (!user || !job || isSaved) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'saved_jobs'), {
        userId: user.uid,
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        location: job.location || 'Location not specified',
        salary: job.salary || 'Salary not specified',
        matchScore: matchScore,
        matchDetails: matchDetails,
        savedAt: serverTimestamp()
      });
      setIsSaved(true);
    } catch (error) {
      console.error("Error saving job:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-slate-600">Loading job details...</p>
      </div>
    </div>
  );
  
  if (!job) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
      <div className="text-center p-12 max-w-md">
        <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Job not found</h2>
        <p className="text-slate-600 mb-8">The job you're looking for may have been removed or doesn't exist.</p>
        <Link href="/dashboard" className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* IMPROVED: Dual Navigation */}
        <div className="flex items-center justify-between mb-8">
          <Link href={referrer} className="inline-flex items-center text-slate-600 hover:text-slate-900 group">
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to {referrer === '/jobs' ? 'Jobs' : 'Dashboard'}
          </Link>
          
          {referrer !== '/dashboard' && (
            <Link href="/dashboard" className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium">
              Dashboard
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden mb-8">
          <div className="p-8 border-b border-slate-100">
            <div className="flex flex-col gap-8">
              {/* Job Header */}
              <div>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                  <div className="flex-1">
                    <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium mb-4">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      {job.source}
                    </div>
                    
                    <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">{job.title}</h1>
                    
                    <div className="flex flex-wrap items-center gap-4 text-slate-600 mb-6">
                      <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <span className="font-medium">{job.company}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        <span>{job.location || 'Location not specified'}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span>
                          {job.postedAt?.seconds 
                            ? formatDistanceToNow(new Date(job.postedAt.seconds * 1000), { addSuffix: true }) 
                            : 'Recently'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Match Score Card - Shows immediately */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4 rounded-xl border border-blue-100 min-w-[180px]">
                    <div className="flex items-center gap-3 mb-2">
                      <Target className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium text-blue-600">AI Match Score</span>
                    </div>
                    <div className={`text-3xl font-bold mb-1 ${
                      matchScore >= 85 ? 'text-green-600' :
                      matchScore >= 70 ? 'text-blue-600' :
                      matchScore >= 50 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {matchScore}%
                    </div>
                    <div className="text-xs text-blue-800">
                      {matchScore >= 85 ? 'Excellent Match' :
                       matchScore >= 70 ? 'Strong Match' :
                       matchScore >= 50 ? 'Good Match' : 'Low Match'}
                    </div>
                  </div>
                </div>

                {/* Job Tags and Details */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-wrap gap-2">
                    {job.tags?.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {/* Additional Job Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {job.salary && (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <DollarSign className="w-5 h-5 text-green-600" />
                          <span className="font-medium text-green-700">Salary</span>
                        </div>
                        <p className="text-green-900 font-semibold">{job.salary}</p>
                      </div>
                    )}
                    
                    {job.jobType && (
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <Layers className="w-5 h-5 text-purple-600" />
                          <span className="font-medium text-purple-700">Job Type</span>
                        </div>
                        <p className="text-purple-900 font-semibold">{job.jobType}</p>
                      </div>
                    )}
                    
                    {job.experienceLevel && (
                      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <Users className="w-5 h-5 text-amber-600" />
                          <span className="font-medium text-amber-700">Experience Level</span>
                        </div>
                        <p className="text-amber-900 font-semibold">{job.experienceLevel}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Analysis Section - Loads in background */}
              {aiLoading ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  <span className="text-blue-700 font-medium">Loading AI analysis...</span>
                </div>
              ) : aiError ? (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="w-5 h-5" />
                  <AlertDescription className="text-amber-800">
                    <strong>{aiError}</strong>. Basic match analysis is shown instead.
                  </AlertDescription>
                </Alert>
              ) : aiAnalysis && (
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-6">
                  <h3 className="flex items-center gap-2 font-semibold text-blue-900 mb-3">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    AI Career Coach Analysis
                  </h3>
                  <p className="text-blue-800 leading-relaxed">{aiAnalysis}</p>
                  
                  {matchDetails.suggestions.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-blue-700 mb-2">Suggestions to improve match:</h4>
                      <ul className="space-y-1.5">
                        {matchDetails.suggestions.map((suggestion, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-blue-800">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Resume Warning */}
              {!userProfile?.resumeUrl && (
                <Alert className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
                  <AlertDescription className="text-amber-800 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <strong>No master resume uploaded.</strong> Upload your resume in Settings → Resume to enable PDF generation and Auto-Apply.
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Application Status Tracker */}
              {showApplicationStatus && applicationId && (
                <div className="mt-4">
                  <ApplicationStatusTracker 
                    applicationId={applicationId}
                    onComplete={handleApplicationComplete}
                  />
                </div>
              )}

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Auto-Apply Button */}
                {userProfile?.resumeUrl ? (
                  <Button 
                    size="lg" 
                    onClick={handleAutoApply} 
                    disabled={autoApplying || showApplicationStatus}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg h-14"
                  >
                    {autoApplying ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Starting Auto-Apply...
                      </>
                    ) : showApplicationStatus ? (
                      <>
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Auto-Apply Started
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5 mr-2" />
                        Auto-Apply Now
                      </>
                    )}
                  </Button>
                ) : (
                  <Button 
                    size="lg" 
                    onClick={() => router.push('/settings/resume')}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg h-14"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Upload Resume to Auto-Apply
                  </Button>
                )}
                
                {/* Manual Apply Button */}
                <Button 
                  size="lg" 
                  onClick={handleTrackApplication} 
                  disabled={applying}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-lg h-14"
                >
                  {applying ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Redirecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-5 h-5 mr-2" />
                      Apply Manually
                    </>
                  )}
                </Button>
                
                {/* Save Job Button */}
                <Button 
                  variant={isSaved ? "secondary" : "outline"} 
                  size="lg" 
                  onClick={handleSaveJob} 
                  disabled={saving || isSaved} 
                  className={`h-14 ${isSaved ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border-green-200 hover:bg-green-100' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  {isSaved ? (
                    <>
                      <Check className="w-5 h-5 mr-2" />
                      Saved to Library
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-5 h-5 mr-2" />
                      {saving ? 'Saving...' : 'Save for Later'}
                    </>
                  )}
                </Button>

                {/* View Job Page Button */}
                <Button 
                  variant="outline" 
                  size="lg" 
                  onClick={() => window.open(job.url, '_blank', 'noopener,noreferrer')}
                  className="border-slate-200 hover:bg-slate-50 h-14"
                >
                  <ExternalLink className="w-5 h-5 mr-2" />
                  View Job Page
                </Button>
              </div>
            </div>
          </div>

          {/* Job Description Section */}
          <div className="p-8 border-b border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              Job Description
            </h3>
            <div className="prose max-w-none">
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 whitespace-pre-wrap text-slate-700 leading-relaxed">
                {job.description || 'No description available for this job.'}
              </div>
              
              {/* Match Analysis Details */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-xl p-6 my-8">
                <h4 className="flex items-center gap-2 font-semibold text-blue-900 mb-4 text-lg">
                  <Target className="w-5 h-5 text-blue-600" />
                  Your Match Analysis
                </h4>
                <div className="mb-6">
                  <div className="flex items-center justify-between text-sm font-medium text-blue-800 mb-2">
                    <span>AI Match Score</span>
                    <span className={`font-bold ${
                      matchScore >= 85 ? 'text-green-600' :
                      matchScore >= 70 ? 'text-blue-600' :
                      matchScore >= 50 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {matchScore}%
                    </span>
                  </div>
                  <Progress 
                    value={matchScore} 
                    className={`h-2.5 ${
                      matchScore >= 85 ? 'bg-green-100' :
                      matchScore >= 70 ? 'bg-blue-100' :
                      matchScore >= 50 ? 'bg-amber-100' : 'bg-red-100'
                    }`}
                  />
                </div>
                
                {/* Match Reasons */}
                {matchDetails.reasons.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-green-700 mb-2">Strengths</h5>
                    <ul className="space-y-2">
                      {matchDetails.reasons.slice(0, 3).map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-green-800">
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Weaknesses */}
                {matchDetails.weaknesses.length > 0 && !matchDetails.weaknesses[0].includes('loading') && (
                  <div>
                    <h5 className="text-sm font-medium text-amber-700 mb-2">Areas to Improve</h5>
                    <ul className="space-y-2">
                      {matchDetails.weaknesses.slice(0, 2).map((weakness, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-amber-800">
                          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          <span>{weakness}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Requirements Section */}
          {job.requirements && job.requirements.length > 0 && (
            <div className="p-8">
              <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Requirements
              </h3>
              <ul className="space-y-3">
                {job.requirements.map((req, index) => (
                  <li key={index} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-bold text-sm">{index + 1}</span>
                    </div>
                    <span className="text-slate-700 pt-0.5">{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 border-t border-slate-200">
          <Link 
            href="/jobs" 
            className="inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Browse more jobs
          </Link>
          <Link 
            href="/applications" 
            className="inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline font-medium"
          >
            View your applications
            <ExternalLink className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </div>
    </div>
  );
}