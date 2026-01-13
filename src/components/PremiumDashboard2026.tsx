"use client";

import React, { useState, useMemo } from 'react';
import { Target, Briefcase, TrendingUp, Sparkles, ExternalLink, Building2, MapPin, Calendar, Zap, Filter, Search } from 'lucide-react';

export default function PremiumDashboard2026() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const stats = {
    matches: 2199,
    applications: 34,
    interviews: 0,
    responseRate: 20
  };
  
  const jobs = [
    {
      id: 1,
      title: 'Staff Product Manager, Seller Experience',
      company: 'Stripe',
      location: 'San Francisco, Remote',
      score: 95,
      salary: '$200k - $280k',
      posted: '2d ago',
      tags: ['Product Strategy', 'B2B SaaS', 'Payments'],
      tier: 'S',
      type: 'new'
    },
    {
      id: 2,
      title: 'Senior Product Manager, AI Platform',
      company: 'Anthropic',
      location: 'Remote',
      score: 92,
      salary: '$180k - $260k',
      posted: '1d ago',
      tags: ['AI/ML', 'Platform', 'Enterprise'],
      tier: 'S',
      type: 'saved'
    },
    {
      id: 3,
      title: 'Principal Product Manager',
      company: 'Databricks',
      location: 'San Francisco, Hybrid',
      score: 88,
      salary: '$220k - $320k',
      posted: '3d ago',
      tags: ['Data Platform', 'Enterprise', 'Technical'],
      tier: 'A',
      type: 'new'
    }
  ];

  // Logic: Filter jobs based on Tab selection AND Search input
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesFilter = activeFilter === 'all' ? true : job.type === activeFilter;
      const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            job.company.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchQuery, jobs]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* Animated Background Gradients */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-pink-500/20 rounded-full blur-[120px] animate-pulse animation-delay-4000"></div>
        
        {/* Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        {/* Premium Header - Responsive Flex */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-400 font-mono">LIVE TRACKING</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">
              <span className="bg-gradient-to-r from-white via-blue-200 to-purple-300 bg-clip-text text-transparent">
                Welcome back, Chandra
              </span>
            </h1>
            <p className="text-gray-400 text-lg">Your AI-powered job search command center</p>
          </div>
          
          <button className="group relative px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-semibold hover:scale-105 transition-transform duration-300 overflow-hidden w-full md:w-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <span className="relative flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5" />
              Upgrade to Pro
            </span>
          </button>
        </div>

        {/* Premium Stats Cards - Fixed Responsiveness */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* New Matches Card */}
          <div className="group relative cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
            <div className="relative bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-8 hover:border-blue-400/40 transition-all duration-300 hover:scale-[1.02]">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-blue-500/20 rounded-2xl">
                  <Target className="w-6 h-6 text-blue-400" />
                </div>
                <ExternalLink className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-gray-400 font-medium">New Matches</div>
                <div className="text-5xl font-black tracking-tight">{stats.matches}</div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="px-2 py-1 bg-green-500/20 text-green-400 rounded-lg font-medium">
                    +20 this week
                  </div>
                </div>
              </div>
              
              <div className="mt-6 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full w-3/4 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"></div>
              </div>
            </div>
          </div>

          {/* Applications Card */}
          <div className="group relative cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
            <div className="relative bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-xl border border-green-500/20 rounded-3xl p-8 hover:border-green-400/40 transition-all duration-300 hover:scale-[1.02]">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-green-500/20 rounded-2xl">
                  <Briefcase className="w-6 h-6 text-green-400" />
                </div>
                <ExternalLink className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-gray-400 font-medium">Applications</div>
                <div className="text-5xl font-black tracking-tight">{stats.applications}</div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg font-medium">
                    {stats.responseRate}% response
                  </div>
                </div>
              </div>
              
              <div className="mt-6 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"></div>
              </div>
            </div>
          </div>

          {/* Interviews Card */}
          <div className="group relative cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
            <div className="relative bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-8 hover:border-purple-400/40 transition-all duration-300 hover:scale-[1.02]">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-purple-500/20 rounded-2xl">
                  <TrendingUp className="w-6 h-6 text-purple-400" />
                </div>
                <ExternalLink className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-gray-400 font-medium">Interviews</div>
                <div className="text-5xl font-black tracking-tight">{stats.interviews}</div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded-lg font-medium">
                    2 scheduled
                  </div>
                </div>
              </div>
              
              <div className="mt-6 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-gradient-to-r from-purple-500 to-pink-400 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Premium Filters & Search - Wire up Search */}
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs by title, company, or skills..."
              className="w-full bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          
          <button className="p-4 bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl hover:border-gray-700 transition-colors hidden md:block">
            <Filter className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Premium Job Cards - Wire up Filtering */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Top Matches</h2>
            <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-xl border border-gray-800">
              {['all', 'new', 'saved'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    activeFilter === filter
                      ? 'bg-gray-700 text-white shadow-lg'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredJobs.length > 0 ? (
              filteredJobs.map(job => (
                <div key={job.id} className="group relative cursor-pointer">
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
                              <h3 className="text-lg md:text-xl font-bold">{job.title}</h3>
                              <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                job.tier === 'S' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                Tier {job.tier}
                              </span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm text-gray-400">
                              <span className="font-medium text-white">{job.company}</span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {job.location}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {job.posted}
                              </span>
                              <span className="font-semibold text-green-400">{job.salary}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 ml-0 md:ml-[60px]">
                          {job.tags.map(tag => (
                            <span key={tag} className="px-3 py-1 bg-gray-800 rounded-lg text-xs text-gray-300">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="text-left md:text-right">
                          <div className="text-3xl font-black bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                            {job.score}
                          </div>
                          <div className="text-xs text-gray-500 font-medium">MATCH</div>
                        </div>
                        
                        <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-semibold hover:scale-105 transition-transform duration-300 flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          Quick Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500">
                No jobs found matching your filters.
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Moved animations to standard style block */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}</style>
    </div>
  );
}