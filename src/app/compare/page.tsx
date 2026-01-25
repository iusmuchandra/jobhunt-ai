"use client"; 

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  Building2, MapPin, DollarSign, Target, TrendingUp, 
  Calendar, Zap, ArrowRight, X, Check, Minus 
} from 'lucide-react';
import Link from 'next/link';

// Job Comparison Page Component
export default function JobComparePage() {
  const searchParams = useSearchParams();
  const jobIds = searchParams.get('jobs')?.split(',') || [];
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJobs() {
      if (jobIds.length === 0) return;
      
      try {
        // Fetch all jobs by IDs
        const jobsRef = collection(db, 'jobs');
        const q = query(jobsRef, where(documentId(), 'in', jobIds.slice(0, 3)));
        const snapshot = await getDocs(q);
        
        const jobsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setJobs(jobsData);
      } catch (error) {
        console.error('Error fetching jobs:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchJobs();
  }, [jobIds]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading comparison...</p>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="text-center">
          <Target className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">No Jobs to Compare</h2>
          <p className="text-gray-400 mb-6">Select at least 2 jobs from the jobs page</p>
          <Link href="/jobs">
            <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold transition-colors">
              Browse Jobs
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const comparisonMetrics = [
    {
      key: 'matchScore',
      label: 'Match Score',
      icon: Target,
      format: (val) => `${val}%`,
      higher_better: true
    },
    {
      key: 'company',
      label: 'Company',
      icon: Building2,
      format: (val) => val,
      highlight_tiers: true
    },
    {
      key: 'salary',
      label: 'Salary',
      icon: DollarSign,
      format: (val) => val || 'Not specified',
      higher_better: true
    },
    {
      key: 'location',
      label: 'Location',
      icon: MapPin,
      format: (val) => val,
      highlight_remote: true
    },
    {
      key: 'seniority',
      label: 'Seniority',
      icon: TrendingUp,
      format: (val) => val?.charAt(0).toUpperCase() + val?.slice(1) || 'Mid',
    },
    {
      key: 'postedAt',
      label: 'Posted',
      icon: Calendar,
      format: (val) => {
        if (!val) return 'Recently';
        const date = val.toDate ? val.toDate() : new Date(val);
        const days = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        return `${days} days ago`;
      },
      lower_better: true
    },
  ];

  const getBestValue = (metric, jobs) => {
    if (metric.key === 'matchScore') {
      return Math.max(...jobs.map(j => j[metric.key] || 0));
    }
    if (metric.key === 'postedAt') {
      const dates = jobs.map(j => {
        const val = j[metric.key];
        if (!val) return new Date();
        return val.toDate ? val.toDate() : new Date(val);
      });
      return Math.max(...dates.map(d => d.getTime()));
    }
    return null;
  };

  const isHighlighted = (job, metric) => {
    if (metric.higher_better) {
      const best = getBestValue(metric, jobs);
      return job[metric.key] === best;
    }
    if (metric.lower_better) {
      const jobDate = job[metric.key]?.toDate ? job[metric.key].toDate() : new Date(job[metric.key] || new Date());
      const best = getBestValue(metric, jobs);
      return jobDate.getTime() === best;
    }
    if (metric.highlight_remote) {
      return job[metric.key]?.toLowerCase().includes('remote');
    }
    if (metric.highlight_tiers) {
      const tierS = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Stripe'];
      return tierS.includes(job.company);
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-black mb-2">Compare Jobs</h1>
            <p className="text-gray-400">Side-by-side comparison of {jobs.length} opportunities</p>
          </div>
          <Link href="/jobs">
            <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
              <X className="w-4 h-4" /> Close
            </button>
          </Link>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="max-w-7xl mx-auto">
        <div className={`grid gap-6 ${jobs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {jobs.map((job, idx) => (
            <div key={job.id} className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 space-y-6">
              {/* Job Header */}
              <div className="border-b border-gray-800 pb-4">
                <h2 className="text-2xl font-bold mb-2">{job.title}</h2>
                <p className="text-blue-400 font-semibold">{job.company}</p>
              </div>

              {/* Metrics */}
              <div className="space-y-4">
                {comparisonMetrics.map(metric => {
                  const Icon = metric.icon;
                  const value = metric.format(job[metric.key]);
                  const highlighted = isHighlighted(job, metric);
                  
                  return (
                    <div 
                      key={metric.key}
                      className={`p-4 rounded-xl border transition-all ${
                        highlighted 
                          ? 'bg-green-500/10 border-green-500/30' 
                          : 'bg-gray-800/30 border-gray-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`w-4 h-4 ${highlighted ? 'text-green-400' : 'text-gray-500'}`} />
                        <span className="text-xs text-gray-400 uppercase tracking-wider">{metric.label}</span>
                        {highlighted && <Check className="w-4 h-4 text-green-400 ml-auto" />}
                      </div>
                      <div className={`text-lg font-semibold ${highlighted ? 'text-green-300' : 'text-white'}`}>
                        {value}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tags */}
              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-500 uppercase mb-2">Skills Match</p>
                <div className="flex flex-wrap gap-2">
                  {job.tags?.slice(0, 4).map((tag, i) => (
                    <span 
                      key={i}
                      className="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <Link href={`/jobs/${job.id}`} className="block">
                <button className="w-full px-4 py-3 bg-white text-black hover:bg-gray-200 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 group">
                  View Job 
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
            </div>
          ))}
        </div>

        {/* Winner Badge */}
        {jobs.length >= 2 && (
          <div className="mt-12 p-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-3xl">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-1">Best Overall Match</h3>
                <p className="text-gray-400">
                  Based on match score and salary: <span className="text-white font-semibold">{jobs[0].title} at {jobs[0].company}</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}