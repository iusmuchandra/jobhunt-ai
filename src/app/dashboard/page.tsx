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
  AlertCircle,
  Bug,
  RefreshCw,
  LayoutDashboard
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow, isToday, isThisWeek } from 'date-fns';

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
  const [isResetting, setIsResetting] = useState(false);
  
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
      }
    } catch (error) {
      console.error('❌ Error triggering scraper:', error);
    }
  }

  // --- DEBUG TOOL: RESET VIEWED STATUS ---
  const handleResetViews = async () => {
    if (!user || jobMatches.length === 0) return;
    setIsResetting(true);
    try {
      console.log("🔄 Resetting 'viewed' status for displayed jobs...");
      const batch = writeBatch(db);
      
      jobMatches.forEach(match => {
        if (!showingGlobalJobs) {
            const ref = doc(db, 'user_job_matches', match.id);
            batch.update(ref, { viewed: false });
        }
      });

      await batch.commit();
      console.log("✅ Reset complete. Reloading...");
      window.location.reload();
    } catch (error) {
      console.error("❌ Error resetting views:", error);
      setIsResetting(false);
    }
  };

  // --- Data Loading ---
  useEffect(() => {
    if (!user) return;
    const userId = user.uid;

    async function fetchGlobalJobs() {
      try {
        console.log('📊 No user matches found, showing global jobs');
        setShowingGlobalJobs(true);
        
        const jobsRef = collection(db, 'jobs');
        const globalQuery = query(jobsRef, orderBy('postedAt', 'desc'), limit(20));
        const globalJobsSnapshot = await getDocs(globalQuery);
        
        const globalJobs = globalJobsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            jobId: doc.id,
            matchScore: 88, // Slightly higher visual score for global demo
            matchReasons: ['Recently posted', 'Top company'],
            notifiedAt: data.postedAt, 
            viewed: false,
            job: {
              title: data.title,
              company: data.company,
              location: data.location,
              url: data.url,
              postedAt: data.postedAt,
              salary: data.salary || "$140,000 - $190,000"
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
      try {
        // Get counts
        const [matchesCount, appsCount, interviewsCount] = await Promise.all([
          getCountFromServer(query(collection(db, 'user_job_matches'), where('userId', '==', userId))),
          getCountFromServer(query(collection(db, 'applications'), where('userId', '==', userId))),
          getCountFromServer(query(collection(db, 'applications'), where('userId', '==', userId), where('status', '==', 'interview')))
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
          triggerScraperForNewUser(user?.email || null);
          await fetchGlobalJobs();
          setLoadingData(false);
          return;
        }

        // Fetch user-specific matches
        const matchesRef = collection(db, 'user_job_matches');
        const q = query(
          matchesRef,
          where('userId', '==', userId),
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
        const jobIds = matchesSnapshot.docs.map(doc => doc.data().jobId).filter(Boolean);

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
        const q = query(matchesRef, where('userId', '==', user.uid), limit(1));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          console.log('✨ Personalized matches are ready!');
          window.location.reload();
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling for matches:', error);
      }
    }, 15000); 
    
    const timeout = setTimeout(() => clearInterval(pollInterval), 300000);
    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [showingGlobalJobs, isNewUser, user]);

  // --- Filtering Logic ---
  const filteredMatches = useMemo(() => {
    return jobMatches.filter(match => {
      if (activeFilter === 'new') return !match.viewed;
      if (activeFilter === 'today') return isToday(match.notifiedAt?.toDate ? match.notifiedAt.toDate() : new Date());
      if (activeFilter === 'week') return isThisWeek(match.notifiedAt?.toDate ? match.notifiedAt.toDate() : new Date());
      
      const queryStr = searchQuery.toLowerCase();
      if (!queryStr) return true;
      
      return (
        match.job.title.toLowerCase().includes(queryStr) || 
        match.job.company.toLowerCase().includes(queryStr) ||
        (match.matchReasons?.some?.(r => r.toLowerCase().includes(queryStr)) ?? false)
      );
    });
  }, [activeFilter, searchQuery, jobMatches]);

  const formatJobDate = (postedAt: any) => {
    if (!postedAt) return 'Recently';
    try {
      let date;
      if (postedAt.toDate) date = postedAt.toDate();
      else if (postedAt.seconds) date = new Date(postedAt.seconds * 1000);
      else date = new Date(postedAt);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Recently';
    }
  };

  // --- Render ---
  if (loading || (!user && !loading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#050505]">
        <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-blue-500/30">
      
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-10">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#22c55e]"></div>
              <span className="text-sm text-gray-400 font-mono tracking-wider">LIVE TRACKING</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">
              <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                Welcome back, {user?.displayName?.split(' ')[0] || 'Hunter'}
              </span>
            </h1>
            <p className="text-gray-400 text-lg">Your AI-powered job search command center</p>
          </div>
          
          <Link href="/pricing">
            <button className="group relative px-6 py-3 bg-[#3B82F6] hover:bg-blue-600 rounded-xl font-semibold transition-all duration-300 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
              <span className="relative flex items-center justify-center gap-2 text-white">
                <Sparkles className="w-4 h-4" />
                Upgrade to Pro
              </span>
            </button>
          </Link>
        </div>

        {/* New User Scanning Banner */}
        {showingGlobalJobs && isNewUser && (
          <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/5 animate-pulse"></div>
            <div className="flex items-start gap-4 relative z-10">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-1 text-white">Personalizing your job feed...</h3>
                <p className="text-gray-400 text-sm">
                  Our AI is currently scanning thousands of jobs to find your perfect match. In the meantime, browse these trending opportunities.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/jobs" className="block h-full">
            <div className="group relative cursor-pointer h-full">
              <div className="absolute inset-0 bg-blue-500/5 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500 opacity-0 group-hover:opacity-100"></div>
              <div className="relative bg-[#0B0C0E] border border-gray-800/60 rounded-3xl p-8 h-full hover:border-blue-500/30 transition-all duration-300">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 bg-[#16181D] rounded-2xl border border-gray-800">
                    <Target className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-400 font-medium">Total Matches</div>
                  <div className="text-4xl font-bold text-white tracking-tight">
                    {stats.jobsFound.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/applications" className="block h-full">
            <div className="group relative cursor-pointer h-full">
              <div className="relative bg-[#0B0C0E] border border-gray-800/60 rounded-3xl p-8 h-full hover:border-green-500/30 transition-all duration-300">
                <div className="flex items-start justify-between mb-6">
                   <div className="p-3 bg-[#16181D] rounded-2xl border border-gray-800">
                    <Briefcase className="w-6 h-6 text-green-500" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-400 font-medium">Applications</div>
                  <div className="text-4xl font-bold text-white tracking-tight">{stats.jobsApplied.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/applications?filter=interview" className="block h-full">
            <div className="group relative cursor-pointer h-full">
              <div className="relative bg-[#0B0C0E] border border-gray-800/60 rounded-3xl p-8 h-full hover:border-purple-500/30 transition-all duration-300">
                 <div className="flex items-start justify-between mb-6">
                   <div className="p-3 bg-[#16181D] rounded-2xl border border-gray-800">
                    <TrendingUp className="w-6 h-6 text-purple-500" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-400 font-medium">Interviews</div>
                  <div className="text-4xl font-bold text-white tracking-tight">{stats.interviews.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Market Intelligence Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Market Intelligence
          </h2>
          
          {/* Using Empty State to match screenshot */}
          <div className="w-full h-48 flex items-center justify-center border border-dashed border-gray-800 rounded-2xl bg-[#0B0C0E]">
             <p className="text-gray-500 text-sm">
                No market data available yet. Run the scraper to generate insights.
             </p>
          </div>
          {/* Note: If you have data, uncomment below: */}
          {/* <AnalyticsDashboard /> */}
        </div>

        {/* Top Picks Section */}
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-white">
              {showingGlobalJobs ? 'Top Opportunities' : 'Top Picks for You'}
            </h2>
            
            {/* Filter Buttons */}
            {!showingGlobalJobs && (
                <div className="flex items-center bg-[#111214] p-1 rounded-lg border border-gray-800 w-fit">
                {['All', 'New', 'Today', 'Week'].map((filter) => {
                    const slug = filter.toLowerCase();
                    const isActive = activeFilter === slug;
                    
                    return (
                    <button
                        key={filter}
                        onClick={() => setActiveFilter(slug)}
                        className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                        isActive 
                            ? 'bg-[#2A2D35] text-white shadow-sm' 
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {isActive && filter === 'Today' && <span className="mr-1">🔥</span>}
                        {filter}
                    </button>
                    )
                })}
                </div>
            )}
          </div>

          <div className="space-y-4">
            {/* DEBUGGING AID */}
            {!loadingData && jobMatches.length > 0 && filteredMatches.length === 0 && (
              <div className="p-4 bg-gray-900 rounded-xl border border-yellow-500/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-yellow-500">
                    <Bug className="w-4 h-4" />
                    <span>Debug: Matches hidden by filter.</span>
                </div>
                <button 
                  onClick={handleResetViews}
                  disabled={isResetting}
                  className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 text-yellow-500 text-xs font-bold rounded-lg transition-all"
                >
                  {isResetting ? "Resetting..." : "Reset All to 'New'"}
                </button>
              </div>
            )}

            {loadingData ? (
               [1, 2, 3].map((i) => <div key={i} className="h-48 bg-[#0B0C0E] border border-gray-800 rounded-2xl animate-pulse" />)
            ) : filteredMatches.length > 0 ? (
                filteredMatches.slice(0, 10).map((match) => (
                <Link key={match.id} href={`/jobs/${match.jobId}`} className="block">
                    <div className="group relative bg-[#0B0C0E] border border-gray-800 rounded-2xl p-6 transition-all duration-200 hover:border-gray-700 hover:shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                    
                    <div className="flex flex-col md:flex-row items-start gap-5">
                        
                        {/* Company Logo Placeholder */}
                        <div className="w-12 h-12 rounded-xl bg-[#1C1F26] flex items-center justify-center flex-shrink-0 border border-gray-800 text-gray-400">
                            <Building2 className="w-6 h-6" />
                        </div>

                        <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-lg font-bold text-white truncate group-hover:text-blue-400 transition-colors">
                            {match.job.title}
                            </h3>
                            {/* Blue Pill "NEW" Badge */}
                            {!match.viewed && !showingGlobalJobs && (
                                <span className="px-2 py-0.5 rounded-full bg-[#3B82F6] text-white text-[10px] font-bold uppercase tracking-wider">
                                New
                                </span>
                            )}
                        </div>

                        <div className="text-gray-400 text-sm font-medium mb-3">
                            {match.job.company}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-gray-500 mb-4 font-medium">
                            <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" />
                            {match.job.location}
                            </div>
                            <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatJobDate(match.job.postedAt)}
                            </div>
                            {match.job.salary && (
                            <div className="flex items-center gap-1.5 text-green-500">
                                <Zap className="w-3.5 h-3.5" />
                                {match.job.salary}
                            </div>
                            )}
                        </div>

                        {/* Keyword Pills */}
                        <div className="flex flex-wrap gap-2">
                             {/* Mocking match reason display to look like tags */}
                             {match.matchReasons?.slice(0, 3).map((reason, idx) => (
                                <span key={idx} className="px-3 py-1.5 rounded-lg bg-[#15171B] border border-gray-800 text-gray-400 text-xs font-medium">
                                    {reason}
                                </span>
                             ))}
                            {match.job.salary && (
                                <span className="px-3 py-1.5 rounded-lg bg-[#15171B] border border-gray-800 text-green-400 text-xs font-medium">
                                    High Salary
                                </span>
                            )}
                        </div>
                        </div>

                        {/* Right Side: Score Circle */}
                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto mt-4 md:mt-0 gap-4 pl-0 md:pl-6 md:border-l border-gray-800/50">
                        
                        <div className="relative w-14 h-14 flex items-center justify-center">
                            {/* SVG Ring Chart */}
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <path
                                className="text-gray-800"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                            />
                            <path
                                className="text-blue-600"
                                strokeDasharray={`${match.matchScore}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                            />
                            </svg>
                            <div className="absolute flex flex-col items-center">
                            <span className="text-[11px] font-bold text-white">{match.matchScore}%</span>
                            <span className="text-[7px] font-bold text-gray-500 uppercase tracking-wide">MATCH</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 text-blue-500 hover:text-blue-400 transition-colors text-xs font-semibold cursor-pointer group/link">
                            View Job <ArrowRight className="w-3 h-3 group-hover/link:translate-x-1 transition-transform" />
                        </div>
                        </div>

                    </div>
                    </div>
                </Link>
                ))
            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-[#0B0C0E] rounded-3xl border border-gray-800 border-dashed">
                <div className="p-4 bg-gray-800/50 rounded-full mb-4">
                    <AlertCircle className="w-8 h-8 text-gray-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-300 mb-2">No matches found</h3>
                <button 
                    onClick={() => { setActiveFilter('all'); setSearchQuery(''); }}
                    className="mt-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
                >
                    Clear Filters
                </button>
                </div>
            )}
            
            {!loadingData && filteredMatches.length > 0 && (
                <div className="flex justify-center mt-8">
                    <Link href="/jobs">
                    <button className="px-6 py-3 bg-[#111214] hover:bg-[#1A1D21] rounded-xl text-sm font-medium transition-colors border border-gray-800 text-gray-300">
                        View All Matches
                    </button>
                    </Link>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}