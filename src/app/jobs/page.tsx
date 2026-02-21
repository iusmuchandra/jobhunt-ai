"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/useToast';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  documentId,
  doc,
  getDoc
} from 'firebase/firestore';
import { JobProfile } from '@/lib/types';
import {
  Search, MapPin, Clock, Building2, Plus, DollarSign,
  ArrowRight, Target, ChevronLeft, ChevronRight, ChevronDown, Sparkles,
  X, Briefcase, Zap, Bookmark, Filter, Scale, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, isToday, isThisWeek } from 'date-fns';
import { migrateToProfiles } from '@/lib/migrate-to-profiles';

// --- Interfaces ---
interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  salary: string;
  postedAt: any;
  tags: string[];
  url?: string;
  description?: string;
  requirements?: string[];
  source?: string;
  seniority?: string; // NEW: written by scraper v4
}

interface MatchedJob extends Job {
  matchScore?: number;
  matchReasons?: string[];
  matchedKeywords?: string[];
  notifiedAt?: any;
  viewed?: boolean;
}

interface FirestoreMatchData {
  matchId: string;
  jobId: string;
  matchScore?: number;
  matchReasons?: string[];
  matchedKeywords?: string[];
  notifiedAt?: any;
  viewed?: boolean;
  [key: string]: any;
}

// --- Component: Circular Progress ---
const CircularProgress = ({ score, color }: { score: number; color: string }) => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg className="transform -rotate-90 w-12 h-12">
        <circle
          className="text-gray-800"
          strokeWidth="3"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="24"
          cy="24"
        />
        <circle
          className={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="24"
          cy="24"
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-white">{score}%</span>
    </div>
  );
};

// --- Component: Skeleton Loader ---
const JobCardSkeleton = () => (
  <div className="relative bg-gray-900/40 border border-gray-800 rounded-3xl p-6 overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
    <div className="flex gap-4">
      <div className="w-12 h-12 bg-gray-800 rounded-2xl" />
      <div className="flex-1 space-y-3">
        <div className="h-6 bg-gray-800 rounded w-3/4" />
        <div className="flex gap-2">
          <div className="h-4 bg-gray-800 rounded w-20" />
          <div className="h-4 bg-gray-800 rounded w-24" />
        </div>
      </div>
    </div>
  </div>
);

export default function JobsPage() {
  const { user } = useAuth();
  
  // Data State
  const [allJobs, setAllJobs] = useState<MatchedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  // NEW: surfaces Firestore query errors to the UI instead of silent empty state
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  // Comparison State
  const [compareList, setCompareList] = useState<string[]>([]);

  const JOBS_PER_PAGE = 50;

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter States
  const [salaryFilter, setSalaryFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [remoteFilter, setRemoteFilter] = useState<string>('all');
  const [matchScoreFilter, setMatchScoreFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('match');

  // --- Helper: Chunk Array ---
  const chunkArray = <T,>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  // --- Spotlight Effect Handler ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  };

  // --- Helper: Robust Date Parsing ---
  const getJobDate = (postedAt: any) => {
    if (!postedAt) return new Date();
    if (postedAt.toDate) return postedAt.toDate();
    if (postedAt.seconds) return new Date(postedAt.seconds * 1000);
    if (typeof postedAt === 'string') return new Date(postedAt);
    return new Date();
  };

  // --- Comparison Handler ---
  const toggleCompare = (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCompareList(prev => {
      if (prev.includes(jobId)) return prev.filter(id => id !== jobId);
      if (prev.length >= 4) {
        toast({ title: 'Limit reached', description: 'You can compare up to 4 jobs at a time.' });
        return prev;
      }
      return [...prev, jobId];
    });
  };

  // --- 1. Fetch User Profile & Job Profiles ---
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        setProfiles([]);
        setSelectedProfileId(null);
        setLoadingProfiles(false);
        setProfileLoaded(true); // FIX: mark loaded even with no user
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        let userData: any = {};
        if (userDoc.exists()) {
          userData = userDoc.data();
        }

        setLoadingProfiles(true);
        const profilesRef = collection(db, 'users', user.uid, 'job_profiles');
        const profilesSnap = await getDocs(profilesRef);
        let profilesList = profilesSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as JobProfile[];

        if (profilesList.length === 0 && userDoc.exists()) {
          const migrated = await migrateToProfiles(user.uid, userData);
          if (migrated) {
            const newProfilesSnap = await getDocs(profilesRef);
            profilesList = newProfilesSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
            })) as JobProfile[];
          }
        }

        setProfiles(profilesList);

        if (profilesList.length > 0) {
          const activeProfile = profilesList.find(p => p.isActive) || profilesList[0];
          setSelectedProfileId(activeProfile.id);
          // FIX: Set excludeKeywords immediately here from the active profile,
          // not in a separate effect, to avoid the race condition.
          setExcludeKeywords(activeProfile.excludeKeywords || []);
        } else {
          setSelectedProfileId(null);
          setExcludeKeywords([]);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      } finally {
        setProfileLoaded(true);
        setLoadingProfiles(false);
      }
    };
    fetchUserProfile();
  }, [user]);

  // Update excludeKeywords when user manually switches profiles
  useEffect(() => {
    if (selectedProfileId && profiles.length > 0) {
      const profile = profiles.find(p => p.id === selectedProfileId);
      if (profile) {
        setExcludeKeywords(profile.excludeKeywords || []);
      }
    }
    // NOTE: Don't clear to [] when no profile — that's handled in the main fetch above
  }, [selectedProfileId, profiles]);

  // --- 2. Main Fetch ---
  const fetchAllMatchedJobs = useCallback(async (profileId: string) => {
    if (!user || !profileId) return;
    setLoading(true);
    setFetchError(null);

    try {
      // FIX: Removed the second orderBy('notifiedAt') which requires a composite
      // Firestore index that likely doesn't exist → silent query failure.
      // Single orderBy('matchScore') only needs a simple index.
      // We do secondary sorting client-side below.
      const matchesQuery = query(
        collection(db, 'user_job_matches'),
        where('userId', '==', user.uid),
        where('profileId', '==', profileId),
        orderBy('matchScore', 'desc')
      );

      const matchesSnapshot = await getDocs(matchesQuery);

      if (matchesSnapshot.empty) {
        console.log(`[JobsPage] No matches found for profileId: ${profileId}, userId: ${user.uid}`);
        setAllJobs([]);
        setLoading(false);
        return;
      }

      console.log(`[JobsPage] Found ${matchesSnapshot.docs.length} match docs`);

      const matchesData: FirestoreMatchData[] = matchesSnapshot.docs.map(d => {
        const data = d.data();
        return { matchId: d.id, jobId: data.jobId, ...data } as FirestoreMatchData;
      });

      const jobIds = matchesData.map(m => m.jobId).filter(Boolean);
      if (jobIds.length === 0) {
        setAllJobs([]);
        setLoading(false);
        return;
      }

      console.log(`[JobsPage] Fetching ${jobIds.length} job docs`);

      // Batch in chunks of 10 (Firestore 'in' limit)
      const jobChunks = chunkArray(jobIds, 10);
      const jobsSnapshots = await Promise.all(
        jobChunks.map(chunk =>
          getDocs(query(collection(db, 'jobs'), where(documentId(), 'in', chunk)))
        )
      );

      const allJobDocs = jobsSnapshots.flatMap(snap => snap.docs);
      console.log(`[JobsPage] Got ${allJobDocs.length} job docs back`);

      const matchedJobs: MatchedJob[] = allJobDocs.map(jobDoc => {
        const jobData = jobDoc.data();
        const match = matchesData.find(m => m.jobId === jobDoc.id);
        return {
          ...jobData,
          id: jobDoc.id,
          title: jobData.title || '',
          company: jobData.company || '',
          location: jobData.location || '',
          type: jobData.type || '',
          salary: jobData.salary || '',
          postedAt: jobData.postedAt,
          tags: jobData.tags || [],
          url: jobData.url || jobData.link || '', // FIX: scraper writes 'url' field
          description: jobData.description || '',
          requirements: jobData.requirements || [],
          source: jobData.source || '',
          seniority: jobData.seniority || '',
          matchScore: match?.matchScore || 0,
          matchReasons: match?.matchReasons || [],
          matchedKeywords: match?.matchedKeywords || [],
          notifiedAt: match?.notifiedAt,
          viewed: match?.viewed || false
        } as MatchedJob;
      });

      // Primary: match score desc. Secondary: notifiedAt desc (client-side)
      matchedJobs.sort((a, b) => {
        const scoreDiff = (b.matchScore || 0) - (a.matchScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        const aTime = a.notifiedAt?.seconds || 0;
        const bTime = b.notifiedAt?.seconds || 0;
        return bTime - aTime;
      });

      setAllJobs(matchedJobs);

    } catch (error: any) {
      // FIX: Surface the error so user knows what's wrong instead of silent empty state
      console.error('[JobsPage] Error fetching jobs:', error);
      const msg = error?.message || 'Unknown error';
      // Detect the most common cause: missing Firestore composite index
      if (msg.includes('index') || msg.includes('FAILED_PRECONDITION')) {
        setFetchError('Missing Firestore index. Check browser console for the index creation link.');
      } else {
        setFetchError(`Failed to load jobs: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedProfileId) {
      setAllJobs([]);
      fetchAllMatchedJobs(selectedProfileId);
    } else if (profileLoaded) {
      // Only clear if we've finished loading — don't clear during initial mount
      setAllJobs([]);
    }
  }, [user, selectedProfileId]);

  // --- Client-side page handlers ---
  const handleNextPage = () => {
    setPage(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handlePrevPage = () => {
    setPage(prev => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addTestJob = async () => {
    try {
      await addDoc(collection(db, 'jobs'), {
        title: "Senior Product Manager",
        company: "TechFlow AI",
        location: "San Francisco, CA (Remote)",
        type: "Full-time",
        salary: "$160k - $220k",
        tags: ["Product Strategy", "AI", "B2B SaaS"],
        postedAt: serverTimestamp(),
      });
      if (selectedProfileId) fetchAllMatchedJobs(selectedProfileId);
    } catch (error) {
      console.error("Error adding job:", error);
    }
  };

  const uniqueCompanies = Array.from(
    new Set(allJobs.map(job => job.company).filter(Boolean))
  ).sort();

  // --- Filter + Sort ---
  const filteredJobs = allJobs.filter(job => {
    if (!job.id) return false;

    // FIX: Removed the broken gate:
    //   `if (!profileLoaded && excludeKeywords.length === 0) return false`
    // This was the primary cause of the empty screen. When excludeKeywords is []
    // (no exclusions set), the condition `excludeKeywords.length === 0` was true,
    // making the whole expression evaluate to `!profileLoaded && true` which gated
    // jobs incorrectly during the brief window before profileLoaded was set.
    // Now we just wait for profileLoaded before showing anything (handled in JSX).

    const jobDate = getJobDate(job.postedAt);

    // 1. Negative keyword filter (FIX: word-boundary match to match Python behavior)
    if (excludeKeywords.length > 0) {
      const titleLower = job.title.toLowerCase();
      const tagsLower = job.tags?.map(t => t.toLowerCase()) || [];
      const hasNegative = excludeKeywords.some(term => {
        const t = term.toLowerCase().trim();
        if (!t) return false;
        // Word-boundary regex so "engineer" doesn't block "Engineering Manager"
        try {
          const regex = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return regex.test(job.title) || tagsLower.some(tag => regex.test(tag));
        } catch {
          // Fallback to includes() if regex is invalid
          return titleLower.includes(t) || tagsLower.some(tag => tag.includes(t));
        }
      });
      if (hasNegative) return false;
    }

    // 2. Search
    const matchesSearch = searchTerm === '' || 
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company.toLowerCase().includes(searchTerm.toLowerCase());

    // 3. Company Filter
    const matchesCompany = companyFilter === 'all' || job.company === companyFilter;

    // 4. Status Filter
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'new' && !job.viewed) ||
      (statusFilter === 'today' && isToday(jobDate)) ||
      (statusFilter === 'week' && isThisWeek(jobDate));

    // 5. Remote/Location
    const jobLocation = (job.location || '').toLowerCase();
    const matchesRemote = remoteFilter === 'all' || 
      (remoteFilter === 'remote' && jobLocation.includes('remote')) ||
      (remoteFilter === 'hybrid' && jobLocation.includes('hybrid')) ||
      (remoteFilter === 'onsite' && !jobLocation.includes('remote') && !jobLocation.includes('hybrid'));

    // 6. Salary
    let matchesSalary = true;
    if (salaryFilter !== 'all' && job.salary) {
      const numbers = job.salary.match(/\d+/g);
      if (numbers?.[0]) {
        const jobNum = parseInt(numbers[0]);
        const filterNum = parseInt(salaryFilter.replace('k', ''));
        const normalized = (jobNum > 1000 && jobNum < 1000000) ? jobNum / 1000 : jobNum;
        matchesSalary = normalized >= filterNum;
      }
    }

    // 7. Score
    let matchesScore = true;
    if (matchScoreFilter !== 'all') {
      matchesScore = (job.matchScore || 0) >= parseInt(matchScoreFilter);
    }

    return matchesSearch && matchesCompany && matchesStatus && matchesRemote && matchesSalary && matchesScore;
  }).sort((a, b) => {
    if (sortBy === 'latest') {
      return getJobDate(b.postedAt).getTime() - getJobDate(a.postedAt).getTime();
    }
    if (sortBy === 'company') {
      return (a.company || '').localeCompare(b.company || '');
    }
    return (b.matchScore || 0) - (a.matchScore || 0);
  });

  const totalPages = Math.ceil(filteredJobs.length / JOBS_PER_PAGE);
  const hasMore = page < totalPages;
  const paginatedJobs = filteredJobs.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE);

  const getTierColor = (score: number) => {
    if (score >= 95) return 'text-yellow-400';
    if (score >= 85) return 'text-green-400';
    if (score >= 75) return 'text-blue-400';
    return 'text-gray-400';
  };

  const getSeniorityColor = (seniority: string) => {
    switch (seniority?.toLowerCase()) {
      case 'executive': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'principal': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'staff':     return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'senior':    return 'bg-green-500/10 text-green-400 border-green-500/20';
      default:          return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setSalaryFilter('all');
    setCompanyFilter('all');
    setRemoteFilter('all');
    setMatchScoreFilter('all');
    setStatusFilter('all');
    setSortBy('match');
    setPage(1);
  };

  useEffect(() => { setPage(1); }, [
    searchTerm, salaryFilter, companyFilter, remoteFilter,
    matchScoreFilter, statusFilter, sortBy
  ]);

  // --- Determine loading state ---
  // Show skeleton while: profiles haven't loaded, OR jobs are still fetching
  const isLoading = loading || !profileLoaded || loadingProfiles;

  return (
    <div className="min-h-screen bg-[#050505] text-white relative font-sans selection:bg-blue-500/30">
      
      {/* Background */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px] animate-pulse animation-delay-2000" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-white/5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-xs font-semibold text-blue-300 tracking-wide">AI AGENT ACTIVE</span>
            </div>
            <h1 className="text-5xl font-black tracking-tighter text-white">
              Job<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Hunt</span>
            </h1>
            <p className="text-gray-400 max-w-lg text-lg">Your personal AI recruiter has analyzed the market and found these top matches.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={addTestJob}
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-gray-800/50 hover:bg-gray-800 border border-white/10 rounded-xl text-sm font-medium transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4" /> Add Test
            </button>
            <Link href="/dashboard">
              <button className="group px-5 py-2.5 bg-white text-black hover:bg-gray-100 rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                Dashboard <ArrowRight className="w-4 h-4 inline ml-1 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </div>
        </div>

        {/* Profile Switcher */}
        <div className="flex items-center justify-between bg-gray-900/40 backdrop-blur-xl border border-gray-800 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Viewing matches for</p>
              {profiles.length === 0 ? (
                <p className="text-gray-400 text-sm">No profiles yet.</p>
              ) : loadingProfiles ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  <span className="text-gray-400 text-sm">Loading profiles...</span>
                </div>
              ) : (
                <select
                  value={selectedProfileId || ''}
                  onChange={(e) => {
                    setSelectedProfileId(e.target.value);
                    setAllJobs([]);
                  }}
                  className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.emoji} {profile.name}{!profile.isActive ? ' (Inactive)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <Link href="/settings/profiles">
            <Button variant="outline" className="border-gray-700 text-gray-300 hover:text-white text-sm">
              <Plus className="w-4 h-4 mr-1" />
              {profiles.length === 0 ? 'Create Profile' : 'Manage Profiles'}
            </Button>
          </Link>
        </div>

        {/* Sticky Glass Filter Bar */}
        <div className="sticky top-4 z-40 space-y-4">
          <div className="p-2 bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl ring-1 ring-white/5">
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Search */}
              <div className="flex-1 relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur transition-opacity opacity-0 group-hover:opacity-100" />
                <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-4 focus-within:border-blue-500/50 transition-colors">
                  <Search className="w-5 h-5 text-gray-500 mr-3" />
                  <input 
                    type="text"
                    placeholder="Search roles, companies, or keywords..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-transparent border-none focus:outline-none text-white placeholder-gray-500 font-medium"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="text-gray-500 hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Filters */}
              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-hide">
                {[
                  { 
                    icon: Sparkles, 
                    val: statusFilter, 
                    set: setStatusFilter, 
                    opts: [['all', 'All Status'], ['new', '✨ New Only'], ['today', '🔥 Today'], ['week', '📅 This Week']] 
                  },
                  { 
                    icon: Building2, 
                    val: companyFilter, 
                    set: setCompanyFilter, 
                    opts: [['all', 'All Companies'], ...uniqueCompanies.map(c => [c, c])] 
                  },
                  { 
                    icon: Target, 
                    val: matchScoreFilter, 
                    set: setMatchScoreFilter, 
                    opts: [['all','All Scores'], ['95','95%+ S-Tier'], ['85','85%+ A-Tier'], ['75','75%+ B-Tier']] 
                  },
                  { 
                    icon: DollarSign, 
                    val: salaryFilter, 
                    set: setSalaryFilter, 
                    opts: [['all','Any Salary'], ['100k','$100k+'], ['150k','$150k+'], ['200k','$200k+']] 
                  },
                  { 
                    icon: MapPin, 
                    val: remoteFilter, 
                    set: setRemoteFilter, 
                    opts: [['all','Any Location'], ['remote','Remote'], ['hybrid','Hybrid'], ['onsite','On-site']] 
                  },
                ].map((f, i) => (
                  <div key={i} className="relative min-w-[160px]">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <f.icon className="w-4 h-4" />
                    </div>
                    <select 
                      value={f.val}
                      onChange={(e) => f.set(e.target.value)}
                      className="w-full appearance-none bg-black/40 hover:bg-white/5 border border-white/10 rounded-xl h-12 pl-10 pr-8 text-sm font-medium text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer"
                    >
                      {f.opts.map(([v, l]) => <option key={String(v)} value={String(v)} className="bg-gray-900">{l}</option>)}
                    </select>
                  </div>
                ))}

                {/* Sort By */}
                <div className="relative min-w-[160px]">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full appearance-none bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl h-12 pl-10 pr-8 text-sm font-medium text-blue-300 focus:outline-none focus:border-blue-500/60 transition-colors cursor-pointer"
                  >
                    <option value="match" className="bg-gray-900 text-white">⚡ Best Match</option>
                    <option value="latest" className="bg-gray-900 text-white">🕐 Latest Posted</option>
                    <option value="company" className="bg-gray-900 text-white">🏢 Company A–Z</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="min-h-[400px]">
          {/* FIX: Show error banner if Firestore query failed (e.g. missing index) */}
          {fetchError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-3">
              <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 font-semibold text-sm">Error loading jobs</p>
                <p className="text-red-400/70 text-xs mt-1">{fetchError}</p>
                <button
                  onClick={() => selectedProfileId && fetchAllMatchedJobs(selectedProfileId)}
                  className="mt-2 text-xs text-red-300 underline hover:text-red-200"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* FIX: Use unified isLoading flag — was: `loading || !profileLoaded` which
               could be true independently causing the skeleton to vanish too early */}
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {[1, 2, 3].map((i) => <JobCardSkeleton key={i} />)}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-gray-900/20 border border-dashed border-gray-800 rounded-3xl">
              <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mb-4 animate-bounce">
                <Filter className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">No matches found</h3>
              <p className="text-gray-500 mb-6 text-center max-w-md">
                {/* FIX: More helpful empty state messages */}
                {allJobs.length === 0
                  ? "The scraper hasn't found any matches for this profile yet. Run job_scraper.py to populate matches."
                  : statusFilter === 'new'
                  ? "You're all caught up! No new unviewed matches."
                  : "Try clearing some filters to see more results."}
              </p>
              {allJobs.length > 0 && (
                <button onClick={clearAllFilters} className="px-6 py-2 bg-white text-black rounded-lg font-bold hover:bg-gray-200 transition-colors">
                  Reset Filters
                </button>
              )}
              {/* NEW: Debug info for developers */}
              {allJobs.length === 0 && !fetchError && (
                <p className="text-gray-700 text-xs mt-4 font-mono">
                  profileId: {selectedProfileId || 'none'} · userId: {user?.uid?.slice(0, 8)}...
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between px-2 gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <p className="text-gray-400 text-sm font-medium">
                    Found <span className="text-white font-bold">{filteredJobs.length}</span> matches
                    {allJobs.length !== filteredJobs.length && (
                      <span className="text-gray-600 ml-1 text-xs">({allJobs.length} total)</span>
                    )}
                    {totalPages > 1 && (
                      <span className="text-gray-600 ml-2 text-xs">· page {page} of {totalPages}</span>
                    )}
                  </p>
                  {statusFilter === 'new' && (
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-bold rounded-full border border-blue-500/30">
                      New Only
                    </span>
                  )}
                  <span className="px-3 py-1 bg-white/5 text-gray-400 text-xs font-semibold rounded-full border border-white/10 flex items-center gap-1.5">
                    {sortBy === 'latest' && <><Clock className="w-3 h-3 text-amber-400" /> Latest Posted</>}
                    {sortBy === 'company' && <><Building2 className="w-3 h-3 text-blue-400" /> Company A–Z</>}
                    {sortBy === 'match' && <><Zap className="w-3 h-3 text-purple-400" /> Best Match</>}
                  </span>
                  {companyFilter !== 'all' && (
                    <button
                      onClick={() => setCompanyFilter('all')}
                      className="px-3 py-1 bg-blue-500/15 text-blue-300 text-xs font-bold rounded-full border border-blue-500/30 flex items-center gap-1.5 hover:bg-blue-500/25 transition-colors"
                    >
                      <Building2 className="w-3 h-3" /> {companyFilter} <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* TOP PAGINATION */}
                <div className="flex items-center gap-3">
                  <button onClick={handlePrevPage} disabled={page <= 1 || loading} className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-gray-800 transition-colors">Prev</button>
                  <div className="text-gray-500 font-mono text-xs">Page <span className="text-white">{page}</span></div>
                  <button onClick={handleNextPage} disabled={!hasMore || loading} className="px-3 py-1.5 bg-white text-black hover:bg-gray-200 rounded-lg text-xs font-bold disabled:opacity-30 transition-colors">Next</button>
                </div>
              </div>

              {/* Company Quick-Filter Pills */}
              {uniqueCompanies.length > 0 && uniqueCompanies.length <= 20 && (
                <div className="flex flex-wrap gap-2 px-2 pb-1">
                  <button
                    onClick={() => setCompanyFilter('all')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                      companyFilter === 'all'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  {uniqueCompanies.map(company => (
                    <button
                      key={company}
                      onClick={() => setCompanyFilter(companyFilter === company ? 'all' : company)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        companyFilter === company
                          ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                          : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {company}
                    </button>
                  ))}
                </div>
              )}

              {/* Job Cards */}
              <div className="grid grid-cols-1 gap-5">
                {paginatedJobs.map((job) => (
                  <Link key={job.id} href={`/jobs/${job.id}`} prefetch={false}>
                    <div 
                      onMouseMove={handleMouseMove}
                      className="group relative rounded-3xl p-[1px] overflow-hidden cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99]"
                    >
                      {/* Spotlight Effect */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: `radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(59, 130, 246, 0.4), transparent 40%)`
                        }}
                      />
                      
                      <div className="relative h-full bg-[#0F0F10] rounded-[23px] p-6 border border-white/5 overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px] group-hover:bg-blue-500/10 transition-colors" />

                        <div className="relative flex flex-col md:flex-row gap-6">
                          {/* Score Visual */}
                          <div className="shrink-0 flex flex-col items-center gap-2">
                            <CircularProgress score={job.matchScore || 0} color={getTierColor(job.matchScore || 0)} />
                            <div className="px-2 py-0.5 rounded-md bg-gray-800 border border-gray-700 text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                              Match
                            </div>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <h3 className="text-xl md:text-2xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors truncate">
                                  {job.title}
                                </h3>
                                <div className="flex items-center gap-2 text-gray-400 text-sm mb-4 flex-wrap">
                                  <span className="font-semibold text-white flex items-center gap-1">
                                    <Briefcase className="w-3 h-3" /> {job.company}
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {job.location || 'Remote'}
                                  </span>
                                  <span>•</span>
                                  <span className="text-gray-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> 
                                    {formatDistanceToNow(getJobDate(job.postedAt), { addSuffix: true })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Tags */}
                            <div className="flex flex-wrap gap-2 items-center">
                              {job.salary && (
                                <span className="px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-xs font-bold flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" /> {job.salary}
                                </span>
                              )}

                              {/* NEW: Seniority badge from scraper v4 */}
                              {job.seniority && (
                                <span className={`px-2.5 py-1 border rounded-lg text-xs font-bold uppercase tracking-wider ${getSeniorityColor(job.seniority)}`}>
                                  {job.seniority}
                                </span>
                              )}

                              {isToday(getJobDate(job.postedAt)) && (
                                <span className="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                  🔥 Fresh
                                </span>
                              )}

                              {job.tags?.slice(0, 4).map((tag, idx) => (
                                <span key={idx} className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 rounded-lg text-xs transition-colors">
                                  {tag}
                                </span>
                              ))}
                              {!job.viewed && (
                                <span className="ml-auto px-2 py-1 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-md animate-pulse">
                                  New
                                </span>
                              )}
                            </div>
                          </div>

                          {/* CTA */}
                          <div className="flex items-end justify-end md:justify-center md:flex-col md:items-center md:border-l border-white/5 md:pl-6 gap-2">
                            <button
                              onClick={(e) => toggleCompare(e, job.id)}
                              className={`mt-2 md:mt-0 mb-0 md:mb-3 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all z-20 relative ${
                                compareList.includes(job.id)
                                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                  : 'bg-white/5 hover:bg-white/10 text-gray-400 border border-white/5'
                              }`}
                            >
                              <Scale className="w-3 h-3" />
                              {compareList.includes(job.id) ? 'Remove' : 'Compare'}
                            </button>

                            <div className="flex items-center text-sm font-bold text-blue-400 group-hover:translate-x-1 transition-transform">
                              View <ArrowRight className="w-4 h-4 ml-1" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Bottom Pagination */}
              <div className="flex items-center justify-center pt-8 pb-12 gap-4">
                <button onClick={handlePrevPage} disabled={page <= 1 || loading} className="px-6 py-3 bg-gray-900 border border-gray-800 rounded-xl text-sm font-bold disabled:opacity-30">Previous</button>
                <div className="px-4 text-gray-500 font-mono text-sm">Page <span className="text-white">{page}</span></div>
                <button onClick={handleNextPage} disabled={!hasMore || loading} className="px-6 py-3 bg-white text-black hover:bg-gray-200 rounded-xl text-sm font-bold disabled:opacity-30">Next Page</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FLOATING COMPARE BUTTON */}
      {compareList.length >= 2 && (
        <div className="fixed bottom-8 right-8 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Link href={`/compare?jobs=${compareList.join(',')}`}>
            <button className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-white shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:scale-105 transition-transform">
              <Scale className="w-5 h-5" />
              Compare {compareList.length} Jobs
            </button>
          </Link>
        </div>
      )}
      
      <style jsx global>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .animate-shimmer { animation: shimmer 2s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}