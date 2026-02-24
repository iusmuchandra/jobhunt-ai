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
  doc,
  getDoc 
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
  RefreshCw 
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
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [stats, setStats] = useState<UserStats>({
    jobsFound: 0,
    jobsApplied: 0,
    interviews: 0,
  });

  const [totalJobsScanned, setTotalJobsScanned] = useState<number | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [showingGlobalJobs, setShowingGlobalJobs] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [isResetting, setIsResetting] = useState(false); 
  
  const hasTriggeredScraper = useRef(false);

  // UI State
  const [sortBy, setSortBy] = useState<'match' | 'latest'>('match');
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

  // --- RESET VIEWED STATUS ---
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
      console.log("✅ Reset complete. Updating local state...");
      // Update local state instead of reloading page
      setJobMatches(prev => prev.map(match => ({...match, viewed: false})));
      setIsResetting(false);
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

      try {
        const userProfileRef = doc(db, 'users', userId);
        const userProfileSnap = await getDoc(userProfileRef);
        const userData = userProfileSnap.exists() ? userProfileSnap.data() : null;
        
        const hasPreferences = userData?.jobTitles && userData.jobTitles.length > 0;

        if (userData?.excludeKeywords && Array.isArray(userData.excludeKeywords)) {
           setExcludeKeywords(userData.excludeKeywords);
        }

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

        if (matchCount === 0) {
          if (hasPreferences) {
            console.log('⏳ Preferences found, waiting for AI matches...');
            setJobMatches([]); 
            setShowingGlobalJobs(false); 
            triggerScraperForNewUser(user?.email || null);
          } else {
            console.log('🆕 No preferences found, showing global fallback');
            setIsNewUser(true);
            triggerScraperForNewUser(user?.email || null);
            await fetchGlobalJobs();
          }
          setLoadingData(false);
          return;
        }

        const matchesRef = collection(db, 'user_job_matches');
        const q = query(
          matchesRef,
          where('userId', '==', userId),
          orderBy('notifiedAt', 'desc'), 
          limit(50) 
        );

        const matchesSnapshot = await getDocs(q);
        
        if (matchesSnapshot.empty) {
            if (!hasPreferences) await fetchGlobalJobs();
            setLoadingData(false);
            return;
        }

        const jobIds = matchesSnapshot.docs
          .map(doc => doc.data().jobId)
          .filter(Boolean);

        if (jobIds.length === 0) {
           if (!hasPreferences) await fetchGlobalJobs();
           setLoadingData(false);
           return;
        }

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

        // Fetch latest scraper metrics for the jobs scanned count
        try {
          const metricsRef = collection(db, 'scraper_metrics');
          const metricsQuery = query(metricsRef, orderBy('timestamp', 'desc'), limit(1));
          const metricsSnap = await getDocs(metricsQuery);
          if (!metricsSnap.empty) {
            const latest = metricsSnap.docs[0].data();
            setTotalJobsScanned(latest.total_jobs_scraped || null);
          }
        } catch (e) {
          // Non-critical — scraper_metrics may be empty in development
        }

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoadingData(false);
      }
    }

    fetchData();
  }, [user]);

  // --- Poll for personalized matches ---
  useEffect(() => {
    if (!user) return;
    const shouldPoll = showingGlobalJobs || (jobMatches.length === 0 && !loadingData);
    if (!shouldPoll) return;

    const pollInterval = setInterval(async () => {
      try {
        const matchesRef = collection(db, 'user_job_matches');
        const q = query(
          matchesRef,
          where('userId', '==', user.uid),
          orderBy('notifiedAt', 'desc'),
          limit(50)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          console.log('✨ Personalized matches ready — updating state');

          // Fetch the actual job data for each match
          const jobIds = snapshot.docs.map(d => d.data().jobId).filter(Boolean);
          const chunks: string[][] = [];
          for (let i = 0; i < jobIds.length; i += 10) chunks.push(jobIds.slice(i, i + 10));

          const jobSnapshots = await Promise.all(
            chunks.map(chunk =>
              getDocs(query(collection(db, 'jobs'), where(documentId(), 'in', chunk)))
            )
          );

          const jobsMap = new Map<string, any>();
          jobSnapshots.forEach(snap => snap.docs.forEach(d => jobsMap.set(d.id, d.data())));

          const newMatches = snapshot.docs.map(doc => {
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
              job,
            };
          }).filter(Boolean);

          setJobMatches(newMatches as any);
          setShowingGlobalJobs(false);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling for matches:', error);
      }
    }, 10000);

    const timeout = setTimeout(() => clearInterval(pollInterval), 300000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [showingGlobalJobs, jobMatches.length, loadingData, user]);

  // --- Filtering & Sorting Logic ---
  const filteredAndSortedMatches = useMemo(() => {
    // 1. Filter Logic (Exclusions + Search)
    let results = jobMatches.filter(match => {
      // Exclusions
      if (excludeKeywords.length > 0) {
        const title = match.job.title.toLowerCase();
        const isExcluded = excludeKeywords.some(keyword => title.includes(keyword.toLowerCase()));
        if (isExcluded) return false;
      }

      // Search
      const queryStr = searchQuery.toLowerCase();
      if (!queryStr) return true;
      
      const matchesSearch = 
        match.job.title.toLowerCase().includes(queryStr) || 
        match.job.company.toLowerCase().includes(queryStr) ||
        (match.matchReasons?.some?.(r => r.toLowerCase().includes(queryStr)) ?? false);

      return matchesSearch;
    });

    // 2. Sorting Logic (Best Match vs Latest)
    return results.sort((a, b) => {
        if (sortBy === 'match') {
            // Sort by Match Score (High to Low)
            return (b.matchScore || 0) - (a.matchScore || 0);
        } else {
            // Sort by Date (Newest to Oldest)
            const getSafeDate = (d: any) => {
                if (!d) return 0;
                if (d.toDate) return d.toDate().getTime();
                if (d.seconds) return d.seconds * 1000;
                return new Date(d).getTime();
            };
            return getSafeDate(b.job?.postedAt) - getSafeDate(a.job?.postedAt);
        }
    });

  }, [sortBy, searchQuery, jobMatches, excludeKeywords]);

  const getTier = (score: number) => {
    if (score >= 95) return 'S';
    if (score >= 85) return 'A';
    if (score >= 75) return 'B';
    return 'C';
  };

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
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-blue-500/30 pb-20">
      
      {/* Background Decor (Neo-Glass Effect) */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] right-[-10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-10">
        
        {/* 1. HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pt-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold tracking-wider">SYSTEM ACTIVE</span>
            </div>
            <h1 className="text-5xl font-black tracking-tighter text-white">
              Hello, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 animate-gradient-x">{user?.displayName?.split(' ')[0] || 'Hunter'}</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-xl">
              Your AI agent has scanned {totalJobsScanned !== null ? <span className="text-white font-bold">{totalJobsScanned.toLocaleString()}+</span> : <span className="text-white font-bold">thousands of</span>} jobs today. Here is your briefing.
            </p>
          </div>
          
          <Link href="/pricing">
            <button className="group relative px-6 py-3 bg-white text-black rounded-xl font-bold hover:scale-105 transition-transform duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              <span className="relative flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                Upgrade Plan
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
                  🎯 Setting up your feed...
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                </h3>
                <p className="text-gray-300 mb-2">
                  We are scanning jobs for you. In the meantime, check out these trending roles!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. STATS GRID (NEO-GLASS) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Matches Card */}
          <Link href="/jobs" className="group">
            <div className="relative overflow-hidden bg-[#0A0A0A] rounded-[24px] p-1 h-full hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="relative h-full bg-[#0F0F10] rounded-[20px] p-6 border border-white/5 group-hover:border-blue-500/30 transition-colors">
                <div className="flex justify-between items-start mb-8">
                    <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400">
                        <Target className="w-6 h-6" />
                    </div>
                    <span className="bg-blue-500/10 text-blue-400 text-xs font-bold px-2 py-1 rounded-lg">LIVE</span>
                </div>
                <div>
                    <div className="text-5xl font-black text-white mb-1">{stats.jobsFound}</div>
                    <div className="text-gray-400 font-medium">New Matches</div>
                </div>
              </div>
            </div>
          </Link>

          {/* Applications Card */}
          <Link href="/applications" className="group">
            <div className="relative overflow-hidden bg-[#0A0A0A] rounded-[24px] p-1 h-full hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="relative h-full bg-[#0F0F10] rounded-[20px] p-6 border border-white/5 group-hover:border-purple-500/30 transition-colors">
                <div className="flex justify-between items-start mb-8">
                    <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400">
                        <Briefcase className="w-6 h-6" />
                    </div>
                </div>
                <div>
                    <div className="text-5xl font-black text-white mb-1">{stats.jobsApplied}</div>
                    <div className="text-gray-400 font-medium">Applications</div>
                </div>
              </div>
            </div>
          </Link>

          {/* Interviews Card */}
          <Link href="/applications?filter=interview" className="group">
            <div className="relative overflow-hidden bg-[#0A0A0A] rounded-[24px] p-1 h-full hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="relative h-full bg-[#0F0F10] rounded-[20px] p-6 border border-white/5 group-hover:border-amber-500/30 transition-colors">
                <div className="flex justify-between items-start mb-8">
                    <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                </div>
                <div>
                    <div className="text-5xl font-black text-white mb-1">{stats.interviews}</div>
                    <div className="text-gray-400 font-medium">Interviews</div>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* 3. MARKET INTELLIGENCE */}
        <section>
            <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-1 bg-blue-500 rounded-full" />
                <h2 className="text-2xl font-bold text-white">Market Intelligence</h2>
            </div>
            <AnalyticsDashboard />
        </section>

        {/* 4. JOB FEED */}
        <section>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-1 bg-purple-500 rounded-full" />
                    <h2 className="text-2xl font-bold text-white">
                        {showingGlobalJobs ? 'Trending Opportunities' : 'Your Feed'}
                    </h2>
                </div>

                {/* Fixed Sort Tabs */}
                {!showingGlobalJobs && jobMatches.length > 0 && (
                    <div className="bg-gray-900 p-1 rounded-xl border border-white/10 flex gap-1">
                        <button onClick={() => setSortBy('match')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${sortBy === 'match' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                            🔥 Best Match
                        </button>
                        <button onClick={() => setSortBy('latest')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${sortBy === 'latest' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                            📅 Latest
                        </button>
                    </div>
                )}
            </div>

            <div className="space-y-4">
                {/* DEBUGGING AID + RESET BUTTON */}
                {!loadingData && jobMatches.length > 0 && filteredAndSortedMatches.length === 0 && !showingGlobalJobs && (
                  <div className="p-4 bg-gray-800/50 rounded-xl border border-yellow-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-xs text-yellow-500 font-mono">
                        <Bug className="w-4 h-4 flex-shrink-0" />
                        <span>Debug: Loaded matches, but filters (including exclusions) hid them all.</span>
                    </div>
                    
                    <button 
                      onClick={handleResetViews}
                      disabled={isResetting}
                      className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 text-xs font-bold uppercase tracking-wider rounded-lg border border-yellow-500/20 transition-all disabled:opacity-50"
                    >
                      {isResetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {isResetting ? "Resetting..." : "Reset All to 'New'"}
                    </button>
                  </div>
                )}

                {/* LIST */}
                {loadingData ? (
                    [1,2,3].map(i => <div key={i} className="h-32 bg-gray-900/50 rounded-3xl animate-pulse" />)
                ) : filteredAndSortedMatches.length > 0 ? (
                    <>
                        {filteredAndSortedMatches.slice(0, 5).map(match => (
                            <Link key={match.id} href={`/jobs/${match.jobId}`}>
                                <div className="group relative bg-[#0F0F10] hover:bg-[#141415] rounded-3xl p-6 border border-white/5 hover:border-white/10 transition-all cursor-pointer">
                                    <div className="flex flex-col md:flex-row justify-between gap-6">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-2xl">
                                                {match.job.company.charAt(0)}
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors mb-1">{match.job.title}</h3>
                                                <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                                                    <span className="text-white font-medium">{match.job.company}</span>
                                                    <span>•</span>
                                                    <span>{match.job.location}</span>
                                                    <span>•</span>
                                                    <span>{formatJobDate(match.job.postedAt)}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    {match.job.salary && (
                                                        <span className="px-2 py-1 bg-green-900/20 text-green-400 text-xs font-bold rounded-lg border border-green-900/30">
                                                            {match.job.salary}
                                                        </span>
                                                    )}
                                                    {match.matchReasons.slice(0, 2).map(r => (
                                                        <span key={r} className="px-2 py-1 bg-white/5 text-gray-400 text-xs font-medium rounded-lg border border-white/5">
                                                            {r}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end justify-center min-w-[80px]">
                                            <div className={`text-2xl font-black ${getTier(match.matchScore) === 'S' ? 'text-yellow-400' : 'text-blue-400'}`}>
                                                {match.matchScore}%
                                            </div>
                                            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Match</div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                        
                        <div className="pt-4 flex justify-center">
                            <Link href="/jobs">
                                <button className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors">
                                    View All {stats.jobsFound} Jobs
                                </button>
                            </Link>
                        </div>
                    </>
                ) : (
                    // EMPTY STATE
                    <div className="p-12 text-center border border-dashed border-gray-800 rounded-3xl">
                        <div className="p-4 bg-gray-800/50 rounded-full mb-4 inline-block">
                            <AlertCircle className="w-8 h-8 text-gray-500" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-300 mb-2">No matches found</h3>
                        <p className="text-gray-500 mb-4 text-center max-w-sm mx-auto">
                            {excludeKeywords.length > 0 && jobMatches.length > 0 
                            ? `Hidden ${jobMatches.length - filteredAndSortedMatches.length} jobs matching your exclusions.`
                            : "We couldn't find any jobs matching your criteria right now."}
                        </p>
                        <button onClick={() => {setSearchQuery(''); setSortBy('match');}} className="text-blue-400 hover:underline">Clear Filters</button>
                    </div>
                )}
            </div>
        </section>

      </div>
    </div>
  );
}