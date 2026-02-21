"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/useToast';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, where, getDocs,
  documentId, doc, getDoc, updateDoc
} from 'firebase/firestore';
import { JobProfile } from '@/lib/types';
import {
  Search, MapPin, Clock, Building2, Plus, DollarSign,
  ArrowRight, Target, Sparkles, X, Briefcase, Zap,
  Filter, Scale, Loader2, AlertTriangle, RefreshCw,
  ExternalLink, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, isToday, isThisWeek } from 'date-fns';
import { migrateToProfiles } from '@/lib/migrate-to-profiles';

// ─── Types ─────────────────────────────────────────────────────────────────

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
  source?: string;
  seniority?: string;
}

interface MatchedJob extends Job {
  matchScore?: number;
  matchReasons?: string[];
  matchedKeywords?: string[];
  notifiedAt?: any;
  viewed?: boolean;
  matchId?: string; // the user_job_matches doc ID, for marking viewed
}

interface FirestoreMatchData {
  matchId: string;
  jobId: string;
  matchScore?: number;
  matchReasons?: string[];
  matchedKeywords?: string[];
  notifiedAt?: any;
  viewed?: boolean;
  profileId?: string;
  [key: string]: any;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const JOBS_PER_PAGE = 50;

// ─── Helpers ───────────────────────────────────────────────────────────────

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

function getJobDate(postedAt: any): Date {
  if (!postedAt) return new Date();
  if (postedAt.toDate) return postedAt.toDate();
  if (postedAt.seconds) return new Date(postedAt.seconds * 1000);
  if (typeof postedAt === 'string') return new Date(postedAt);
  return new Date();
}

function wordBoundaryMatch(text: string, term: string): boolean {
  try {
    return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  } catch {
    return text.toLowerCase().includes(term.toLowerCase());
  }
}

function getTierColor(score: number): string {
  if (score >= 95) return 'text-yellow-400';
  if (score >= 85) return 'text-green-400';
  if (score >= 75) return 'text-blue-400';
  return 'text-gray-400';
}

function getSeniorityStyle(seniority: string): string {
  const s = seniority?.toLowerCase();
  if (s === 'executive' || s === 'director') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  if (s === 'principal') return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  if (s === 'staff') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (s === 'senior') return 'bg-green-500/10 text-green-400 border-green-500/20';
  return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
}

// ─── Sub-components ────────────────────────────────────────────────────────

const CircularProgress = ({ score, color }: { score: number; color: string }) => {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg className="transform -rotate-90 w-12 h-12">
        <circle className="text-gray-800" strokeWidth="3" stroke="currentColor" fill="transparent" r={r} cx="24" cy="24" />
        <circle
          className={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" stroke="currentColor" fill="transparent" r={r} cx="24" cy="24"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-white">{score}%</span>
    </div>
  );
};

const SkeletonCard = () => (
  <div className="relative bg-gray-900/40 border border-gray-800 rounded-3xl p-6 overflow-hidden">
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    <div className="flex gap-4">
      <div className="w-12 h-12 bg-gray-800 rounded-2xl shrink-0" />
      <div className="flex-1 space-y-3">
        <div className="h-6 bg-gray-800 rounded w-3/4" />
        <div className="flex gap-2">
          <div className="h-4 bg-gray-800 rounded w-24" />
          <div className="h-4 bg-gray-800 rounded w-32" />
        </div>
        <div className="flex gap-2">
          <div className="h-6 bg-gray-800 rounded-full w-16" />
          <div className="h-6 bg-gray-800 rounded-full w-20" />
          <div className="h-6 bg-gray-800 rounded-full w-14" />
        </div>
      </div>
    </div>
  </div>
);

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { user } = useAuth();

  // ── Data state
  const [allJobs, setAllJobs] = useState<MatchedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  // ── Profile state
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);

  // ── UI state
  const [page, setPage] = useState(1);
  const [compareList, setCompareList] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [salaryFilter, setSalaryFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [remoteFilter, setRemoteFilter] = useState('all');
  const [matchScoreFilter, setMatchScoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('match');
  const [showScrollTop, setShowScrollTop] = useState(false);

  const topRef = useRef<HTMLDivElement>(null);

  // ── Scroll-to-top button
  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // ── Step 1: Load profiles
  useEffect(() => {
    if (!user) {
      setProfiles([]);
      setSelectedProfileId(null);
      setProfileLoaded(true);
      setLoadingProfiles(false);
      return;
    }

    (async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData: any = userDoc.exists() ? userDoc.data() : {};

        const profilesRef = collection(db, 'users', user.uid, 'job_profiles');
        const profilesSnap = await getDocs(profilesRef);
        let profilesList = profilesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as JobProfile[];

        // Auto-migrate legacy prefs to a profile
        if (profilesList.length === 0 && userDoc.exists()) {
          const migrated = await migrateToProfiles(user.uid, userData);
          if (migrated) {
            const newSnap = await getDocs(profilesRef);
            profilesList = newSnap.docs.map(d => ({ id: d.id, ...d.data() })) as JobProfile[];
          }
        }

        setProfiles(profilesList);

        if (profilesList.length > 0) {
          const active = profilesList.find(p => p.isActive) || profilesList[0];
          setSelectedProfileId(active.id);
          setExcludeKeywords(active.excludeKeywords || []);
        }
      } catch (err) {
        console.error('[JobsPage] Profile load error:', err);
      } finally {
        setProfileLoaded(true);
        setLoadingProfiles(false);
      }
    })();
  }, [user]);

  // ── Update excludeKeywords when profile is switched manually
  useEffect(() => {
    if (!selectedProfileId) return;
    const p = profiles.find(p => p.id === selectedProfileId);
    if (p) setExcludeKeywords(p.excludeKeywords || []);
  }, [selectedProfileId, profiles]);

  // ── Step 2: Fetch matches
  const fetchMatches = useCallback(async (profileId: string) => {
    if (!user) return;
    setLoading(true);
    setFetchError(null);
    setDebugInfo(null);

    try {
      // ─────────────────────────────────────────────────────────────────────
      // ROOT CAUSE FIX:
      //
      // The Python scraper writes user_job_matches WITHOUT a profileId field.
      // The previous query used: where('profileId', '==', profileId)
      // This returned ZERO results because none of the scraped match docs
      // have that field set.
      //
      // Fix: Query by userId only (no profileId filter), which matches all
      // documents the scraper creates. We still scope to the user correctly.
      //
      // When the scraper is updated to write profileId, re-add the filter.
      // ─────────────────────────────────────────────────────────────────────
      const matchesQuery = query(
        collection(db, 'user_job_matches'),
        where('userId', '==', user.uid),
        orderBy('matchScore', 'desc')
        // NOTE: profileId filter removed — scraper doesn't write this field.
        // See firestore.indexes.json for the composite index on userId+matchScore.
      );

      const matchesSnap = await getDocs(matchesQuery);

      if (matchesSnap.empty) {
        console.log(`[JobsPage] No matches found for userId: ${user.uid}`);
        setDebugInfo(`No matches in Firestore for userId=${user.uid.slice(0, 8)}… | profileId=${profileId.slice(0, 8)}…`);
        setAllJobs([]);
        setLoading(false);
        return;
      }

      console.log(`[JobsPage] Found ${matchesSnap.docs.length} match docs`);

      const matchesData: FirestoreMatchData[] = matchesSnap.docs.map(d => ({
        matchId: d.id,
        jobId: d.data().jobId,
        ...d.data()
      }));

      const jobIds = [...new Set(matchesData.map(m => m.jobId).filter(Boolean))];
      if (!jobIds.length) { setAllJobs([]); setLoading(false); return; }

      console.log(`[JobsPage] Fetching ${jobIds.length} jobs`);

      // Firestore 'in' max 10 — batch
      const chunks = chunkArray(jobIds, 10);
      const jobSnaps = await Promise.all(
        chunks.map(chunk =>
          getDocs(query(collection(db, 'jobs'), where(documentId(), 'in', chunk)))
        )
      );
      const allJobDocs = jobSnaps.flatMap(s => s.docs);
      console.log(`[JobsPage] Resolved ${allJobDocs.length} job docs`);

      const matched: MatchedJob[] = allJobDocs.map(jobDoc => {
        const jd = jobDoc.data();
        const m = matchesData.find(m => m.jobId === jobDoc.id);
        return {
          id: jobDoc.id,
          matchId: m?.matchId,
          title: jd.title || '',
          company: jd.company || '',
          location: jd.location || '',
          type: jd.type || '',
          salary: jd.salary || '',
          postedAt: jd.postedAt,
          tags: jd.tags || [],
          url: jd.url || jd.link || '',
          description: jd.description || '',
          source: jd.source || '',
          seniority: jd.seniority || '',
          matchScore: m?.matchScore ?? 0,
          matchReasons: m?.matchReasons || [],
          matchedKeywords: m?.matchedKeywords || [],
          notifiedAt: m?.notifiedAt,
          viewed: m?.viewed ?? false,
        } as MatchedJob;
      });

      // Client-side sort: matchScore desc, then notifiedAt desc
      matched.sort((a, b) => {
        const sd = (b.matchScore ?? 0) - (a.matchScore ?? 0);
        if (sd !== 0) return sd;
        return (b.notifiedAt?.seconds ?? 0) - (a.notifiedAt?.seconds ?? 0);
      });

      setAllJobs(matched);

    } catch (err: any) {
      console.error('[JobsPage] Fetch error:', err);
      const msg: string = err?.message ?? '';
      if (msg.includes('index') || msg.includes('FAILED_PRECONDITION')) {
        setFetchError('Missing Firestore index. Open the browser console — there will be a link to create it with one click.');
      } else {
        setFetchError(`Failed to load jobs: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!profileLoaded) return;
    if (user && selectedProfileId) {
      setAllJobs([]);
      fetchMatches(selectedProfileId);
    } else if (user && profiles.length === 0 && profileLoaded) {
      // User has no profiles yet — still try fetching all their matches
      setLoading(false);
    }
  }, [user, selectedProfileId, profileLoaded]);

  // ── Mark as viewed when scrolled into view (passive, fire-and-forget)
  const markViewed = useCallback(async (job: MatchedJob) => {
    if (job.viewed || !job.matchId) return;
    try {
      await updateDoc(doc(db, 'user_job_matches', job.matchId), { viewed: true });
    } catch { /* non-critical */ }
  }, []);

  // ── Pagination helpers
  const handleNextPage = () => { setPage(p => p + 1); topRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const handlePrevPage = () => { setPage(p => Math.max(1, p - 1)); topRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  // ── Compare
  const toggleCompare = (e: React.MouseEvent, jobId: string) => {
    e.preventDefault(); e.stopPropagation();
    setCompareList(prev => {
      if (prev.includes(jobId)) return prev.filter(id => id !== jobId);
      if (prev.length >= 4) { toast({ title: 'Limit reached', description: 'Compare up to 4 jobs.' }); return prev; }
      return [...prev, jobId];
    });
  };

  // ── Unique companies for pills
  const uniqueCompanies = Array.from(new Set(allJobs.map(j => j.company).filter(Boolean))).sort();

  // ── Filter + Sort
  const filteredJobs = allJobs.filter(job => {
    if (!job.id) return false;

    // Negative keyword filter — word-boundary aware
    if (excludeKeywords.length > 0) {
      const blocked = excludeKeywords.some(term => {
        const t = term.trim();
        return t && (wordBoundaryMatch(job.title, t) || job.tags?.some(tag => wordBoundaryMatch(tag, t)));
      });
      if (blocked) return false;
    }

    const jobDate = getJobDate(job.postedAt);

    const matchesSearch = !searchTerm ||
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCompany = companyFilter === 'all' || job.company === companyFilter;

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'new' && !job.viewed) ||
      (statusFilter === 'today' && isToday(jobDate)) ||
      (statusFilter === 'week' && isThisWeek(jobDate));

    const loc = (job.location || '').toLowerCase();
    const matchesRemote = remoteFilter === 'all' ||
      (remoteFilter === 'remote' && loc.includes('remote')) ||
      (remoteFilter === 'hybrid' && loc.includes('hybrid')) ||
      (remoteFilter === 'onsite' && !loc.includes('remote') && !loc.includes('hybrid'));

    let matchesSalary = true;
    if (salaryFilter !== 'all' && job.salary) {
      const nums = job.salary.match(/\d+/g);
      if (nums?.[0]) {
        const n = parseInt(nums[0]);
        const threshold = parseInt(salaryFilter.replace('k', ''));
        const normalized = (n > 1000 && n < 1_000_000) ? n / 1000 : n;
        matchesSalary = normalized >= threshold;
      }
    }

    const matchesScore = matchScoreFilter === 'all' || (job.matchScore ?? 0) >= parseInt(matchScoreFilter);

    return matchesSearch && matchesCompany && matchesStatus && matchesRemote && matchesSalary && matchesScore;
  }).sort((a, b) => {
    if (sortBy === 'latest') return getJobDate(b.postedAt).getTime() - getJobDate(a.postedAt).getTime();
    if (sortBy === 'company') return (a.company || '').localeCompare(b.company || '');
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });

  const totalPages = Math.ceil(filteredJobs.length / JOBS_PER_PAGE);
  const hasMore = page < totalPages;
  const paginatedJobs = filteredJobs.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE);
  const newCount = allJobs.filter(j => !j.viewed).length;

  const clearFilters = () => {
    setSearchTerm(''); setSalaryFilter('all'); setCompanyFilter('all');
    setRemoteFilter('all'); setMatchScoreFilter('all'); setStatusFilter('all');
    setSortBy('match'); setPage(1);
  };

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [searchTerm, salaryFilter, companyFilter, remoteFilter, matchScoreFilter, statusFilter, sortBy]);

  const isLoading = loading || !profileLoaded || loadingProfiles;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#050505] text-white relative font-sans selection:bg-blue-500/30" ref={topRef}>

      {/* Background */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
        />
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-white/5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <span className="text-xs font-semibold text-blue-300 tracking-wide">AI AGENT ACTIVE</span>
              {newCount > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                  {newCount} new
                </span>
              )}
            </div>
            <h1 className="text-5xl font-black tracking-tighter text-white">
              Job<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Hunt</span>
            </h1>
            <p className="text-gray-400 max-w-lg text-lg">Your AI recruiter found <span className="text-white font-semibold">{allJobs.length}</span> matches.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/dashboard">
              <button className="group px-5 py-2.5 bg-white text-black hover:bg-gray-100 rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.15)]">
                Dashboard <ArrowRight className="w-4 h-4 inline ml-1 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </div>
        </div>

        {/* ── Profile Switcher ── */}
        <div className="flex items-center justify-between bg-gray-900/40 backdrop-blur-xl border border-gray-800 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Viewing matches for</p>
              {loadingProfiles ? (
                <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 text-gray-400 animate-spin" /><span className="text-gray-400 text-sm">Loading…</span></div>
              ) : profiles.length === 0 ? (
                <p className="text-gray-400 text-sm">No profiles yet — create one to get matches.</p>
              ) : (
                <select
                  value={selectedProfileId || ''}
                  onChange={(e) => { setSelectedProfileId(e.target.value); setAllJobs([]); }}
                  className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.emoji} {p.name}{!p.isActive ? ' (Inactive)' : ''}</option>
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

        {/* ── Error Banner ── */}
        {fetchError && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-300 font-semibold text-sm">Error loading jobs</p>
              <p className="text-red-400/70 text-xs mt-1">{fetchError}</p>
            </div>
            <button
              onClick={() => selectedProfileId && fetchMatches(selectedProfileId)}
              className="flex items-center gap-1.5 text-xs text-red-300 hover:text-red-200 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        {/* ── Sticky Filter Bar ── */}
        <div className="sticky top-4 z-40">
          <div className="p-2 bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl ring-1 ring-white/5">
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Search */}
              <div className="flex-1 relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-4 focus-within:border-blue-500/50 transition-colors">
                  <Search className="w-5 h-5 text-gray-500 mr-3 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search roles, companies, keywords…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-transparent border-none focus:outline-none text-white placeholder-gray-500 font-medium"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="text-gray-500 hover:text-white ml-2">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-hide">
                {[
                  { icon: Sparkles, val: statusFilter, set: setStatusFilter, opts: [['all','All Status'],['new','✨ New'],['today','🔥 Today'],['week','📅 This Week']] },
                  { icon: Building2, val: companyFilter, set: setCompanyFilter, opts: [['all','All Companies'], ...uniqueCompanies.map(c => [c, c])] },
                  { icon: Target, val: matchScoreFilter, set: setMatchScoreFilter, opts: [['all','All Scores'],['95','95%+ S-Tier'],['85','85%+ A-Tier'],['75','75%+ B-Tier']] },
                  { icon: DollarSign, val: salaryFilter, set: setSalaryFilter, opts: [['all','Any Salary'],['100k','$100k+'],['150k','$150k+'],['200k','$200k+']] },
                  { icon: MapPin, val: remoteFilter, set: setRemoteFilter, opts: [['all','Any Location'],['remote','Remote'],['hybrid','Hybrid'],['onsite','On-site']] },
                ].map((f, i) => (
                  <div key={i} className="relative min-w-[150px]">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <f.icon className="w-4 h-4" />
                    </div>
                    <select
                      value={f.val}
                      onChange={e => { f.set(e.target.value); }}
                      className="w-full appearance-none bg-black/40 hover:bg-white/5 border border-white/10 rounded-xl h-12 pl-10 pr-8 text-sm font-medium text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer"
                    >
                      {f.opts.map(([v, l]) => <option key={v} value={v} className="bg-gray-900">{l}</option>)}
                    </select>
                  </div>
                ))}

                {/* Sort */}
                <div className="relative min-w-[150px]">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    className="w-full appearance-none bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl h-12 pl-10 pr-8 text-sm font-medium text-blue-300 focus:outline-none focus:border-blue-500/60 transition-colors cursor-pointer"
                  >
                    <option value="match" className="bg-gray-900 text-white">⚡ Best Match</option>
                    <option value="latest" className="bg-gray-900 text-white">🕐 Latest</option>
                    <option value="company" className="bg-gray-900 text-white">🏢 Company A–Z</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="min-h-[400px]">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {[1,2,3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 bg-gray-900/20 border border-dashed border-gray-800 rounded-3xl">
              <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mb-4 animate-bounce">
                <Filter className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                {allJobs.length === 0 ? 'No matches yet' : 'No results'}
              </h3>
              <p className="text-gray-500 mb-6 text-center max-w-md text-sm">
                {allJobs.length === 0
                  ? 'Run the job scraper to populate matches, or check that your Firestore data has userId matching your account.'
                  : statusFilter === 'new'
                  ? "You've viewed all matches. Switch to 'All Status' to see everything."
                  : 'Try clearing some filters.'}
              </p>
              {allJobs.length > 0 && (
                <button onClick={clearFilters} className="px-6 py-2 bg-white text-black rounded-lg font-bold hover:bg-gray-200 transition-colors">
                  Reset Filters
                </button>
              )}
              {/* Debug info — only show when no jobs at all */}
              {debugInfo && allJobs.length === 0 && (
                <p className="text-gray-700 text-[10px] font-mono mt-6 px-4 text-center">{debugInfo}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Result summary + pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-1 gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-gray-400 text-sm">
                    <span className="text-white font-bold">{filteredJobs.length}</span> matches
                    {allJobs.length !== filteredJobs.length && <span className="text-gray-600 text-xs ml-1">({allJobs.length} total)</span>}
                    {totalPages > 1 && <span className="text-gray-600 text-xs ml-2">· page {page}/{totalPages}</span>}
                  </p>
                  {companyFilter !== 'all' && (
                    <button onClick={() => setCompanyFilter('all')} className="px-2.5 py-1 bg-blue-500/15 text-blue-300 text-xs font-bold rounded-full border border-blue-500/30 flex items-center gap-1 hover:bg-blue-500/25 transition-colors">
                      <Building2 className="w-3 h-3" /> {companyFilter} <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handlePrevPage} disabled={page <= 1} className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-gray-800">Prev</button>
                  <span className="text-gray-500 font-mono text-xs">pg <span className="text-white">{page}</span></span>
                  <button onClick={handleNextPage} disabled={!hasMore} className="px-3 py-1.5 bg-white text-black hover:bg-gray-200 rounded-lg text-xs font-bold disabled:opacity-30">Next</button>
                </div>
              </div>

              {/* Company Pills */}
              {uniqueCompanies.length > 1 && uniqueCompanies.length <= 20 && (
                <div className="flex flex-wrap gap-2 px-1">
                  <button onClick={() => setCompanyFilter('all')} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${companyFilter === 'all' ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}>
                    All
                  </button>
                  {uniqueCompanies.map(co => (
                    <button key={co} onClick={() => setCompanyFilter(companyFilter === co ? 'all' : co)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${companyFilter === co ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}>
                      {co}
                    </button>
                  ))}
                </div>
              )}

              {/* Job Cards */}
              <div className="grid grid-cols-1 gap-4">
                {paginatedJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    inCompare={compareList.includes(job.id)}
                    onCompare={toggleCompare}
                    onView={markViewed}
                  />
                ))}
              </div>

              {/* Bottom Pagination */}
              <div className="flex items-center justify-center pt-6 pb-12 gap-4">
                <button onClick={handlePrevPage} disabled={page <= 1} className="px-6 py-3 bg-gray-900 border border-gray-800 rounded-xl text-sm font-bold disabled:opacity-30 hover:bg-gray-800">Previous</button>
                <span className="text-gray-500 font-mono text-sm">Page <span className="text-white">{page}</span> of <span className="text-white">{totalPages}</span></span>
                <button onClick={handleNextPage} disabled={!hasMore} className="px-6 py-3 bg-white text-black hover:bg-gray-200 rounded-xl text-sm font-bold disabled:opacity-30">Next Page</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating Compare Button ── */}
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

      {/* ── Scroll to top ── */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 left-8 z-50 w-10 h-10 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors shadow-lg"
        >
          <ChevronUp className="w-5 h-5 text-gray-300" />
        </button>
      )}

      <style jsx global>{`
        @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

// ─── Job Card Component ─────────────────────────────────────────────────────

function JobCard({
  job,
  inCompare,
  onCompare,
  onView,
}: {
  job: MatchedJob;
  inCompare: boolean;
  onCompare: (e: React.MouseEvent, id: string) => void;
  onView: (job: MatchedJob) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Intersection observer to mark viewed
  useEffect(() => {
    if (job.viewed || !ref.current) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { onView(job); obs.disconnect(); }
    }, { threshold: 0.5 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [job.id]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <div ref={ref}>
      <Link href={`/jobs/${job.id}`} prefetch={false}>
        <div
          onMouseMove={handleMouseMove}
          className="group relative rounded-3xl p-[1px] overflow-hidden cursor-pointer transition-transform hover:scale-[1.005] active:scale-[0.998]"
        >
          {/* Spotlight border glow */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl"
            style={{ background: 'radial-gradient(600px circle at var(--mx) var(--my), rgba(59,130,246,0.35), transparent 40%)' }}
          />

          <div className="relative h-full bg-[#0F0F10] rounded-[23px] p-5 md:p-6 border border-white/5 overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-[60px] group-hover:bg-blue-500/10 transition-colors" />

            <div className="relative flex flex-col md:flex-row gap-5">
              {/* Score */}
              <div className="shrink-0 flex flex-col items-center gap-1.5">
                <CircularProgress score={job.matchScore ?? 0} color={getTierColor(job.matchScore ?? 0)} />
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Match</span>
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 mb-1">
                  <h3 className="text-xl md:text-2xl font-bold text-white group-hover:text-blue-400 transition-colors truncate flex-1">
                    {job.title}
                  </h3>
                  {!job.viewed && (
                    <span className="shrink-0 px-2 py-0.5 bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider rounded-md animate-pulse">New</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-400 text-sm mb-4">
                  <span className="font-semibold text-white flex items-center gap-1">
                    <Briefcase className="w-3 h-3" /> {job.company}
                  </span>
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.location || 'Remote'}</span>
                  <span className="flex items-center gap-1 text-gray-500">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(getJobDate(job.postedAt), { addSuffix: true })}
                  </span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 items-center">
                  {job.salary && (
                    <span className="px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-xs font-bold flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> {job.salary}
                    </span>
                  )}
                  {job.seniority && (
                    <span className={`px-2.5 py-1 border rounded-lg text-xs font-bold uppercase tracking-wider ${getSeniorityStyle(job.seniority)}`}>
                      {job.seniority}
                    </span>
                  )}
                  {isToday(getJobDate(job.postedAt)) && (
                    <span className="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider animate-pulse">
                      🔥 Fresh
                    </span>
                  )}
                  {job.tags?.slice(0, 4).map((tag, i) => (
                    <span key={i} className="px-2.5 py-1 bg-white/5 text-gray-300 border border-white/5 rounded-lg text-xs hover:bg-white/10 transition-colors">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="flex items-center md:flex-col md:items-center md:justify-center md:border-l border-white/5 md:pl-5 gap-3 md:gap-2">
                <button
                  onClick={e => onCompare(e, job.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all z-10 relative ${
                    inCompare ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-white/5 hover:bg-white/10 text-gray-400 border border-white/5'
                  }`}
                >
                  <Scale className="w-3 h-3" />
                  {inCompare ? 'Remove' : 'Compare'}
                </button>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-gray-400 border border-white/5 transition-all z-10 relative"
                  >
                    <ExternalLink className="w-3 h-3" /> Apply
                  </a>
                )}
                <div className="flex items-center text-sm font-bold text-blue-400 group-hover:translate-x-1 transition-transform ml-auto md:ml-0">
                  View <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}