"use client";

import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  getCountFromServer, 
  documentId,
  writeBatch,
  doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Target, 
  Briefcase, 
  TrendingUp, 
  Sparkles, 
  Building2, 
  MapPin, 
  Calendar, 
  Zap, 
  Loader2,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

// --- Interfaces ---
interface JobMatch {
  id: string;
  jobId: string;
  matchScore: number;
  matchReasons: string[];
  job: {
    title: string;
    company: string;
    location: string;
    url: string;
    postedAt: any;
    salary?: string;
  };
  notifiedAt: any;
  viewed: boolean;
}

interface UserStats {
  jobsFound: number;
  jobsApplied: number;
  interviews: number;
}

export default function DashboardPage() {
  // --- Hooks & State ---
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Real Data State
  const [jobMatches, setJobMatches] = useState<JobMatch[]>([]);
  const [stats, setStats] = useState<UserStats>({
    jobsFound: 0,
    jobsApplied: 0,
    interviews: 0,
  });
  
  const [loadingData, setLoadingData] = useState(true);
  const [showingGlobalJobs, setShowingGlobalJobs] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  
  // Ref to ensure we only mark as viewed once per load
  const hasMarkedViewed = useRef(false);
  const hasTriggeredScraper = useRef(false);

  // UI State
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Auth Protection ---
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/signin');
    }
  }, [user, loading, router]);

  // --- Helper: Trigger Scraper ---
  async function triggerScraperForNewUser(email: string | null) {
    if (hasTriggeredScraper.current) return;
    
    try {
      console.log('🎯 Triggering scraper for new user:', email);
      hasTriggeredScraper.current = true;
      
      const response = await fetch('/api/trigger-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: email })
      });
      
      if (response.ok) {
        console.log('✅ Scraper triggered successfully');
      } else {
        console.error('❌ Failed to trigger scraper:', await response.text());
      }
    } catch (error) {
      console.error('❌ Error triggering scraper:', error);
    }
  }

  // --- Data Loading ---
  useEffect(() => {
    if (!user) return;
    const userId = user.uid;

    async function fetchGlobalJobs() {
      try {
        console.log('📊 No user matches found, showing global jobs');
        setShowingGlobalJobs(true);
        
        const jobsRef = collection(db, 'jobs');
        const globalQuery = query(
          jobsRef,
          orderBy('postedAt', 'desc'),
          limit(20)
        );
        
        const globalJobsSnapshot = await getDocs(globalQuery);
        
        const globalJobs = globalJobsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            jobId: doc.id,
            matchScore: 75,
            matchReasons: ['Recently posted', 'Top company'],
            notifiedAt: data.postedAt,
            viewed: false,
            job: {
              title: data.title,
              company: data.company,
              location: data.location,
              url: data.url,
              postedAt: data.postedAt,
              salary: data.salary
            }
          } as JobMatch;
        });
        
        setJobMatches(globalJobs);
      } catch (error) {
        console.error('Error fetching global jobs:', error);
      }
    }

    async function fetchData() {
      setLoadingData(true);
      hasMarkedViewed.current = false;

      try {
        // Get counts
        const [matchesCount, appsCount, interviewsCount] = await Promise.all([
          getCountFromServer(
              query(collection(db, 'user_job_matches'), where('userId', '==', userId))
          ),
          getCountFromServer(
              query(collection(db, 'applications'), where('userId', '==', userId))
          ),
          getCountFromServer(
              query(
              collection(db, 'applications'),
              where('userId', '==', userId),
              where('status', '==', 'interview')
              )
          )
        ]);

        const matchCount = matchesCount.data().count;

        setStats({
            jobsFound: matchCount,
            jobsApplied: appsCount.data().count,
            interviews: interviewsCount.data().count
        });

        // Check if new user (no matches)
        if (matchCount === 0) {
          setIsNewUser(true);
          
          // Trigger scraper - FIXED: Added optional chaining and null fallback
          triggerScraperForNewUser(user?.email || null);
          
          // Fetch global jobs as fallback
          await fetchGlobalJobs();
          setLoadingData(false);
          return;
        }

        // Fetch user-specific matches
        const matchesRef = collection(db, 'user_job_matches');
        const q = query(
          matchesRef,
          where('userId', '==', userId),
          orderBy('matchScore', 'desc'),
          orderBy('notifiedAt', 'desc'),
          limit(20)
        );

        const matchesSnapshot = await getDocs(q);
        
        if (matchesSnapshot.empty) {
          await fetchGlobalJobs();
          setLoadingData(false);
          return;
        }

        // Collect all job IDs
        const jobIds = matchesSnapshot.docs
          .map(doc => doc.data().jobId)
          .filter(Boolean);

        if (jobIds.length === 0) {
          await fetchGlobalJobs();
          setLoadingData(false);
          return;
        }

        // Fetch jobs (Chunking logic)
        const chunks = [];
        for (let i = 0; i < jobIds.length; i += 10) {
            chunks.push(jobIds.slice(i, i + 10));
        }

        const jobsPromises = chunks.map(chunk => 
            getDocs(query(collection(db, 'jobs'), where(documentId(), 'in', chunk)))
        );
        
        const jobsSnapshots = await Promise.all(jobsPromises);
        
        const jobsMap = new Map();
        jobsSnapshots.forEach(snap => {
            snap.docs.forEach(doc => {
                jobsMap.set(doc.id, doc.data());
            });
        });

        const matches = matchesSnapshot.docs.map(doc => {
          const data = doc.data();
          const job = jobsMap.get(data.jobId);
          
          if (!job) return null;
          
          return { 
            id: doc.id, 
            jobId: data.jobId,
            matchScore: data.matchScore || 0,
            matchReasons: data.matchReasons || [],
            notifiedAt: data.notifiedAt,
            viewed: data.viewed || false,
            job 
          } as JobMatch;
        }).filter(match => match !== null) as JobMatch[];

        setJobMatches(matches);
        setShowingGlobalJobs(false);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoadingData(false);
      }
    }

    fetchData();
  }, [user]);

  // --- Poll for personalized matches (for new users) ---
  useEffect(() => {
    if (!showingGlobalJobs || !isNewUser || !user) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const matchesRef = collection(db, 'user_job_matches');
        const q = query(
          matchesRef,
          where('userId', '==', user.uid),
          limit(1)
        );
        
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          console.log('✨ Personalized matches are ready!');
          // Trigger full data refresh
          window.location.reload();
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling for matches:', error);
      }
    }, 15000); // Poll every 15 seconds
    
    // Stop polling after 5 minutes
    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
    }, 300000);
    
    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [showingGlobalJobs, isNewUser, user]);

  // --- Mark as viewed effect ---
  useEffect(() => {
    if (!loadingData && jobMatches.length > 0 && !hasMarkedViewed.current && !showingGlobalJobs) {
      const markTopMatchesAsViewed = async () => {
        const unviewedMatches = jobMatches
          .filter(m => !m.viewed)
          .slice(0, 5);

        if (unviewedMatches.length > 0) {
          try {
            const batch = writeBatch(db);
            unviewedMatches.forEach(match => {
              const docRef = doc(db, 'user_job_matches', match.id);
              batch.update(docRef, { viewed: true });
            });
            await batch.commit();
            
            setJobMatches(prevMatches => 
              prevMatches.map(match => {
                if (unviewedMatches.find(um => um.id === match.id)) {
                  return { ...match, viewed: true };
                }
                return match;
              })
            );
            
            hasMarkedViewed.current = true;
          } catch (error) {
            console.error("Error updating viewed status:", error);
          }
        } else {
          hasMarkedViewed.current = true;
        }
      };

      const timer = setTimeout(markTopMatchesAsViewed, 500);
      return () => clearTimeout(timer);
    }
  }, [loadingData, jobMatches, showingGlobalJobs]);

  // --- Filtering Logic ---
  const filteredMatches = useMemo(() => {
    return jobMatches.filter(match => {
      let matchesTab = true;
      if (activeFilter === 'new') matchesTab = !match.viewed;

      const queryStr = searchQuery.toLowerCase();
      if (!queryStr) return matchesTab;
      
      const matchesSearch = 
        match.job.title.toLowerCase().includes(queryStr) || 
        match.job.company.toLowerCase().includes(queryStr) ||
        (match.matchReasons?.some?.(r => r.toLowerCase().includes(queryStr)) ?? false);

      return matchesTab && matchesSearch;
    });
  }, [activeFilter, searchQuery, jobMatches]);

  const getTier = (score: number) => {
    if (score >= 95) return 'S';
    if (score >= 85) return 'A';
    if (score >= 75) return 'B';
    return 'C';
  };

  const formatJobDate = (postedAt: any) => {
    if (!postedAt) return 'Recently';
    
    try {
      if (postedAt.toDate) {
        return formatDistanceToNow(postedAt.toDate(), { addSuffix: true });
      } else if (postedAt.seconds) {
        return formatDistanceToNow(new Date(postedAt.seconds * 1000), { addSuffix: true });
      }
    } catch (error) {
      console.error('Error formatting date:', error);
    }
    
    return 'Recently';
  };

  // --- Render ---
  if (loading || (!user && !loading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A]">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-pink-500/20 rounded-full blur-[120px] animate-pulse animation-delay-4000"></div>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-400 font-mono">LIVE TRACKING</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">
              <span className="bg-gradient-to-r from-white via-blue-200 to-purple-300 bg-clip-text text-transparent">
                Welcome back, {user?.displayName?.split(' ')[0] || 'Hunter'}
              </span>
            </h1>
            <p className="text-gray-400 text-lg">Your AI-powered job search command center</p>
          </div>
          
          <Link href="/pricing">
            <button className="group relative px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-semibold hover:scale-105 transition-transform duration-300 overflow-hidden w-full md:w-auto">
              <span className="relative flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5" />
                Upgrade to Pro
              </span>
            </button>
          </Link>
        </div>

        {/* New User Banner */}
        {showingGlobalJobs && isNewUser && (
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Sparkles className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                  🎯 Personalizing your job feed...
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                </h3>
                <p className="text-gray-300 mb-2">
                  Our AI is scanning <span className="font-bold text-white">2,400+ jobs</span> across top tech companies to find your perfect matches.
                </p>
                <p className="text-gray-400 text-sm">
                  This usually takes 1-2 minutes. Meanwhile, here are some trending opportunities from companies like OpenAI, Stripe, and Airbnb!
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm text-blue-400">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span>Checking for personalized matches...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/jobs" className="block h-full">
            <div className="group relative cursor-pointer h-full">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-8 h-full hover:border-blue-400/40 transition-all duration-300 hover:scale-[1.02]">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 bg-blue-500/20 rounded-2xl">
                    <Target className="w-6 h-6 text-blue-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-gray-400 font-medium">Total Matches</div>
                  <div className="text-5xl font-black tracking-tight">
                    {stats.jobsFound.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="px-2 py-1 bg-green-500/20 text-green-400 rounded-lg font-medium">
                      {showingGlobalJobs ? 'Scanning...' : 'Active Now'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/applications" className="block h-full">
            <div className="group relative cursor-pointer h-full">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-xl border border-green-500/20 rounded-3xl p-8 h-full hover:border-green-400/40 transition-all duration-300 hover:scale-[1.02]">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 bg-green-500/20 rounded-2xl"><Briefcase className="w-6 h-6 text-green-400" /></div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-gray-400 font-medium">Applications</div>
                  <div className="text-5xl font-black tracking-tight">{stats.jobsApplied.toLocaleString()}</div>
                  <div className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg font-medium w-fit">Track Status</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/applications?filter=interview" className="block h-full">
            <div className="group relative cursor-pointer h-full">
               <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-8 h-full hover:border-purple-400/40 transition-all duration-300 hover:scale-[1.02]">
                 <div className="flex items-start justify-between mb-6">
                  <div className="p-3 bg-purple-500/20 rounded-2xl"><TrendingUp className="w-6 h-6 text-purple-400" /></div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-gray-400 font-medium">Interviews</div>
                  <div className="text-5xl font-black tracking-tight">{stats.interviews.toLocaleString()}</div>
                   <div className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded-lg font-medium w-fit">Scheduled</div>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Market Intelligence Section */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-400" />
            Market Intelligence
          </h2>
          <AnalyticsDashboard />
        </div>

        {/* Matches List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {showingGlobalJobs ? 'Top Opportunities' : 'Top Picks for You'}
            </h2>
            {/* Filter Tabs */}
            {!showingGlobalJobs && (
              <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-xl border border-gray-800">
                {['all', 'new'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                      activeFilter === filter ? 'bg-gray-700 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {filter === 'all' ? 'All' : 'New'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {loadingData ? (
              [1, 2, 3].map((i) => <div key={i} className="h-40 bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl animate-pulse" />)
            ) : filteredMatches.length > 0 ? (
              <>
                {filteredMatches.slice(0, 5).map(match => (
                  <Link key={match.id} href={`/jobs/${match.jobId}`} className="block mb-4">
                    <div className="group relative cursor-pointer">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/5 to-pink-500/0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="relative bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 hover:border-gray-700 transition-all duration-300">
                        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl">
                                <Building2 className="w-6 h-6 text-blue-400" />
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <h3 className="text-lg md:text-xl font-bold text-white group-hover:text-blue-400 transition-colors">
                                    {match.job.title}
                                  </h3>
                                  {!match.viewed && !showingGlobalJobs && (
                                    <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider animate-pulse">
                                      New
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-400 text-sm font-medium mb-3">
                                  {match.job.company}
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-gray-500 mb-4">
                                  <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {match.job.location}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {formatJobDate(match.job.postedAt)}
                                  </div>
                                  {match.job.salary && (
                                    <div className="flex items-center gap-1.5 text-green-400/80">
                                      <Zap className="w-3.5 h-3.5" />
                                      {match.job.salary}
                                    </div>
                                  )}
                                </div>

                                {/* Match Reasons Badges */}
                                <div className="flex flex-wrap gap-2">
                                  {match.matchReasons?.slice(0, 3).map((reason, idx) => (
                                    <span 
                                      key={idx} 
                                      className="px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-gray-400 text-xs"
                                    >
                                      {reason}
                                    </span>
                                  ))}
                                  {(match.matchReasons?.length || 0) > 3 && (
                                    <span className="px-2 py-1 rounded-md bg-gray-800/50 text-gray-500 text-xs">
                                      +{match.matchReasons.length - 3} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right Side: Score & Action */}
                          <div className="flex md:flex-col items-center md:items-end justify-between gap-4 pl-0 md:pl-6 md:border-l border-gray-800 min-w-[100px]">
                            <div className="flex flex-col items-center md:items-end">
                              <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 text-sm font-bold shadow-[0_0_15px_rgba(0,0,0,0.3)] ${
                                getTier(match.matchScore) === 'S' ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10 shadow-yellow-500/20' :
                                getTier(match.matchScore) === 'A' ? 'border-green-500 text-green-400 bg-green-500/10 shadow-green-500/20' :
                                'border-blue-500 text-blue-400 bg-blue-500/10 shadow-blue-500/20'
                              }`}>
                                {match.matchScore}%
                              </div>
                              <span className={`text-[10px] font-bold mt-1 ${
                                  getTier(match.matchScore) === 'S' ? 'text-yellow-500' : 'text-gray-500'
                              }`}>
                                MATCH
                              </span>
                            </div>

                            <button className="hidden md:flex items-center gap-2 text-sm font-medium text-blue-400 group-hover:text-blue-300 transition-colors">
                              View Job <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                
                <div className="flex justify-center mt-8">
                    <Link href="/jobs">
                      <button className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium transition-colors border border-gray-700">
                          View All {stats.jobsFound} Matches
                      </button>
                    </Link>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 bg-gray-900/30 rounded-3xl border border-gray-800 border-dashed">
                <div className="p-4 bg-gray-800/50 rounded-full mb-4">
                  <AlertCircle className="w-8 h-8 text-gray-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-300 mb-2">No matches found</h3>
                <p className="text-gray-500 text-center max-w-sm">
                  {activeFilter !== 'all' 
                    ? "Try switching your filter to 'All' to see more results." 
                    : "We couldn't find any jobs matching your criteria right now."}
                </p>
                <button 
                  onClick={() => { setActiveFilter('all'); setSearchQuery(''); }}
                  className="mt-6 px-4 py-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}