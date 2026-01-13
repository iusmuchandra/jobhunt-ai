'use client';

import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  getCountFromServer, 
  documentId 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Target, 
  Briefcase, 
  TrendingUp, 
  Sparkles, 
  ExternalLink, 
  Building2, 
  MapPin, 
  Calendar, 
  Zap, 
  Filter, 
  Search,
  Loader2,
  ArrowRight
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

  // UI State
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Auth Protection ---
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/signin');
    }
  }, [user, loading, router]);

  // --- Data Loading ---
  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      setLoadingData(true);

      try {
        // 1. Load Stats
        let currentStats = stats;
        if (stats.jobsFound === 0) {
            const [matchesCount, appsCount, interviewsCount] = await Promise.all([
            getCountFromServer(
                query(collection(db, 'user_job_matches'), where('userId', '==', user.uid))
            ),
            getCountFromServer(
                query(collection(db, 'applications'), where('userId', '==', user.uid))
            ),
            getCountFromServer(
                query(
                collection(db, 'applications'),
                where('userId', '==', user.uid),
                where('status', '==', 'interview')
                )
            )
            ]);

            currentStats = {
                jobsFound: matchesCount.data().count,
                jobsApplied: appsCount.data().count,
                interviews: interviewsCount.data().count
            };
            setStats(currentStats);
        }

        // 2. Load Top Matches (Buffer of 20)
        const matchesRef = collection(db, 'user_job_matches');
        const q = query(
          matchesRef,
          where('userId', '==', user.uid),
          orderBy('matchScore', 'desc'),
          orderBy('notifiedAt', 'desc'),
          limit(20) // INCREASED LIMIT: Fetch 20 to have a buffer for filtering
        );

        const matchesSnapshot = await getDocs(q);
        
        if (matchesSnapshot.empty) {
          setJobMatches([]);
          setLoadingData(false);
          return;
        }

        // Collect all job IDs
        const jobIds = matchesSnapshot.docs
          .map(doc => doc.data().jobId)
          .filter(Boolean);

        if (jobIds.length === 0) {
          setJobMatches([]);
          setLoadingData(false);
          return;
        }

        // Fetch jobs (Chunking logic maintained for safety)
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
            ...data, 
            job 
          } as JobMatch;
        }).filter(match => match !== null);

        setJobMatches(matches);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoadingData(false);
      }
    }

    fetchData();
  }, [user]);

  // --- Filtering Logic ---
  const filteredMatches = useMemo(() => {
    return jobMatches.filter(match => {
      let matchesTab = true;
      if (activeFilter === 'new') matchesTab = !match.viewed;

      const query = searchQuery.toLowerCase();
      if (!query) return matchesTab;
      
      const matchesSearch = 
        match.job.title.toLowerCase().includes(query) || 
        match.job.company.toLowerCase().includes(query) ||
        (match.matchReasons?.some?.(r => r.toLowerCase().includes(query)) ?? false);

      return matchesTab && matchesSearch;
    });
  }, [activeFilter, searchQuery, jobMatches]);

  const getTier = (score: number) => {
    if (score >= 95) return 'S';
    if (score >= 85) return 'A';
    if (score >= 75) return 'B';
    return 'C';
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/jobs">
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
                    <div className="px-2 py-1 bg-green-500/20 text-green-400 rounded-lg font-medium">Active Now</div>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/applications">
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

          <Link href="/applications?filter=interview">
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

        {/* Market Intelligence Section - INSERTED HERE */}
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
            <h2 className="text-2xl font-bold">Top Picks for You</h2>
            {/* Filter Tabs */}
            <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-xl border border-gray-800">
              {['all', 'new'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    activeFilter === filter ? 'bg-gray-700 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {loadingData ? (
              [1, 2, 3].map((i) => <div key={i} className="h-40 bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl animate-pulse" />)
            ) : filteredMatches.length > 0 ? (
              <>
                {/* SLICE TO SHOW ONLY TOP 5 AFTER FILTERING */}
                {filteredMatches.slice(0, 5).map(match => (
                  <Link key={match.id} href={`/jobs/${match.jobId}`}>
                    <div className="group relative cursor-pointer mb-4">
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
                                  <h3 className="text-lg md:text-xl font-bold">{match.job.title}</h3>
                                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${getTier(match.matchScore) === 'S' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>Tier {getTier(match.matchScore)}</span>
                                  {!match.viewed && (<span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-500/20 text-blue-400 flex items-center gap-1"><Sparkles className="w-3 h-3" />New Match</span>)}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm text-gray-400">
                                  <span className="font-medium text-white">{match.job.company}</span>
                                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{match.job.location}</span>
                                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{match.job.postedAt ? formatDistanceToNow(match.job.postedAt.toDate(), { addSuffix: true }) : 'Recently'}</span>
                                  {match.job.salary && <span className="font-semibold text-green-400">{match.job.salary}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 ml-0 md:ml-[60px]">
                              {match.matchReasons?.slice(0, 3).map((tag, idx) => (
                                <span key={idx} className="px-3 py-1 bg-gray-800 rounded-lg text-xs text-gray-300">{tag}</span>
                              ))}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                            <div className="text-left md:text-right">
                              <div className="text-3xl font-black bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">{match.matchScore}</div>
                              <div className="text-xs text-gray-500 font-medium">MATCH</div>
                            </div>
                            <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-semibold hover:scale-105 transition-transform duration-300 flex items-center gap-2">
                              <Zap className="w-4 h-4" /> Apply
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}

                {/* VIEW ALL MATCHES BUTTON */}
                <div className="flex justify-center pt-6 pb-8">
                  <Link href="/jobs">
                    <button className="flex items-center gap-2 px-8 py-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-2xl transition-all group shadow-lg shadow-blue-900/10">
                      <span className="font-bold text-gray-300 group-hover:text-white text-lg">
                        View All {stats.jobsFound.toLocaleString()} Matches
                      </span>
                      <ArrowRight className="w-5 h-5 text-blue-500 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </Link>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-500 bg-gray-900/30 rounded-3xl border border-gray-800">
                <Target className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p>No matches found.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <style jsx global>{`@keyframes pulse { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } } .animation-delay-2000 { animation-delay: 2s; } .animation-delay-4000 { animation-delay: 4s; }`}</style>
    </div>
  );
}