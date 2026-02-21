// components/AnalyticsDashboard.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { TrendingUp, DollarSign, MapPin, Users, Briefcase, Globe, Zap, ArrowUpRight } from 'lucide-react';
// NEW IMPORTS FOR CHARTS
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface AnalyticsData {
  id: string;
  timestamp: any;
  total_jobs_analyzed: number;
  remote_count: number;
  top_companies: Array<{
    company: string;
    total_jobs: number;
    avg_salary: number;
    remote_ratio: number;
  }>;
  top_roles: Array<{
    role: string;
    count: number;
    avg_salary: number;
    company_count: number;
  }>;
  top_locations: Array<{ location: string; count: number }>;
  salary_insights: {
    highest_paying_companies: Array<{ company: string; avg_salary: number }>;
    salary_distribution: Record<string, number>;
  };
}

// Chart Colors
const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#6366F1'];

export default function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const q = query(
          collection(db, 'market_analytics'),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          setAnalytics({
            id: doc.id,
            ...doc.data()
          } as AnalyticsData);
        }
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, []);

  if (loading) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-pulse">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-900/50 rounded-2xl border border-white/5" />
            ))}
        </div>
    );
  }

  if (!analytics) return null;

  // Prepare Data for Charts
  const roleData = (analytics.top_roles ?? []).slice(0, 5).map(r => ({
      name: r.role,
      value: r.count
  }));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. HERO STATS (Bento Grid Style) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ... (Keep your existing Hero Stats cards here) ... */}
        {/* Total Jobs */}
        <div className="group relative overflow-hidden p-6 bg-[#0F0F10] rounded-3xl border border-white/5 hover:border-blue-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Briefcase className="w-24 h-24 text-blue-500 -mr-4 -mt-4 rotate-12" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <Briefcase className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Market Depth</span>
            </div>
            <p className="text-4xl font-black text-white tracking-tight">
              {analytics.total_jobs_analyzed.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500 mt-1">Active roles scanned</p>
          </div>
        </div>

        {/* Remote Ratio */}
        <div className="group relative overflow-hidden p-6 bg-[#0F0F10] rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-emerald-400 mb-2">
              <Globe className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Remote Access</span>
            </div>
            <div className="flex items-baseline gap-2">
                <p className="text-4xl font-black text-white tracking-tight">
                {analytics.remote_count.toLocaleString()}
                </p>
                <span className="text-sm font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    {((analytics.remote_count / analytics.total_jobs_analyzed) * 100).toFixed(0)}%
                </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Work from anywhere</p>
          </div>
        </div>

        {/* Avg Salary */}
        <div className="group relative overflow-hidden p-6 bg-[#0F0F10] rounded-3xl border border-white/5 hover:border-purple-500/30 transition-all duration-300">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <DollarSign className="w-24 h-24 text-purple-500 -mr-4 -mt-4 rotate-12" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-purple-400 mb-2">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Market Rate</span>
            </div>
            <p className="text-4xl font-black text-white tracking-tight">
              ${((analytics.top_roles ?? []).reduce((sum, role) => sum + role.avg_salary, 0) / Math.max((analytics.top_roles ?? []).length, 1) / 1000).toFixed(0)}k
            </p>
            <p className="text-sm text-gray-500 mt-1">Average annual comp</p>
          </div>
        </div>

        {/* Companies Tracking */}
        <div className="group relative overflow-hidden p-6 bg-[#0F0F10] rounded-3xl border border-white/5 hover:border-amber-500/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-amber-400 mb-2">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Coverage</span>
            </div>
            <p className="text-4xl font-black text-white tracking-tight">
              {(analytics.top_companies ?? []).length}+
            </p>
            <p className="text-sm text-gray-500 mt-1">Top tier tech companies</p>
          </div>
        </div>
      </div>

      {/* 2. LEADERBOARDS & PIE CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Top Hiring (Takes up 1 column) */}
        <div className="lg:col-span-1 bg-[#0F0F10] border border-white/5 rounded-3xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    Top Hiring
                </h3>
            </div>
            <div className="space-y-3">
                {(analytics.top_companies ?? []).slice(0, 5).map((company, i) => (
                    <div key={company.company} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-500">#{i + 1}</span>
                            <span className="font-bold text-gray-200">{company.company}</span>
                        </div>
                        <span className="text-sm font-bold text-blue-400">{company.total_jobs}</span>
                    </div>
                ))}
            </div>
        </div>

        {/* PIE CHART SECTION (New!) */}
        <div className="lg:col-span-2 bg-[#0F0F10] border border-white/5 rounded-3xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-purple-500" />
                    Role Distribution
                </h3>
            </div>
            
            <div className="flex flex-col md:flex-row items-center h-64">
                {/* Chart */}
                <div className="w-full md:w-1/2 h-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={roleData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {roleData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }}
                                itemStyle={{ color: '#fff' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="w-full md:w-1/2 grid grid-cols-2 gap-4 pl-4">
                    {roleData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                            <div>
                                <p className="text-sm font-bold text-white capitalize">{entry.name}</p>
                                <p className="text-xs text-gray-500">{entry.value} jobs</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

      </div>

      {/* 3. ROLES & LOCATIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Highest Paying */}
         <div className="bg-[#0F0F10] border border-white/5 rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" /> Highest Paying
            </h3>
            <div className="space-y-3">
                {(analytics.salary_insights?.highest_paying_companies ?? []).slice(0, 5).map((company, i) => (
                    <div key={company.company} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <span className="font-bold text-gray-200">{company.company}</span>
                        <span className="text-sm font-bold text-green-400">${(company.avg_salary / 1000).toFixed(0)}k</span>
                    </div>
                ))}
            </div>
         </div>

         {/* Locations */}
         <div className="bg-[#0F0F10] border border-white/5 rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-500" /> Top Hubs
            </h3>
            <div className="flex flex-wrap gap-2">
                {(analytics.top_locations ?? []).slice(0, 8).map((loc) => (
                    <div key={loc.location} className="px-3 py-1.5 rounded-lg bg-gray-900 border border-white/10 flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-300 capitalize">{loc.location}</span>
                        <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-1.5 rounded">{loc.count}</span>
                    </div>
                ))}
            </div>
         </div>
      </div>
    </div>
  );
}