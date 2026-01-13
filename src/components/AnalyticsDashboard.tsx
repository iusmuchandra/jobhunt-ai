// components/AnalyticsDashboard.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { TrendingUp, DollarSign, MapPin, Users, Briefcase, Globe } from 'lucide-react';

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
    return <div className="p-8 text-center text-gray-500 animate-pulse">Loading market insights...</div>;
  }

  if (!analytics) {
    return <div className="p-8 text-center text-gray-500">No market data available yet. Run the scraper to generate insights.</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-500/20 p-6 rounded-2xl border border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-300 font-medium">Total Jobs Analyzed</p>
              <p className="text-3xl font-black text-white mt-2">
                {analytics.total_jobs_analyzed.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-blue-500/20 rounded-xl">
                <Briefcase className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-900/30 to-green-500/20 p-6 rounded-2xl border border-green-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-300 font-medium">Remote Opportunities</p>
              <p className="text-3xl font-black text-white mt-2">
                {analytics.remote_count.toLocaleString()}
              </p>
              <p className="text-sm text-green-200 mt-1 font-mono">
                {((analytics.remote_count / analytics.total_jobs_analyzed) * 100).toFixed(1)}% of total
              </p>
            </div>
             <div className="p-3 bg-green-500/20 rounded-xl">
                <Globe className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-900/30 to-purple-500/20 p-6 rounded-2xl border border-purple-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-300 font-medium">Avg Role Salary</p>
              <p className="text-3xl font-black text-white mt-2">
                $
                {(
                  analytics.top_roles.reduce((sum, role) => sum + role.avg_salary, 0) /
                  Math.max(analytics.top_roles.length, 1)
                ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
             <div className="p-3 bg-purple-500/20 rounded-xl">
                <DollarSign className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-900/30 to-amber-500/20 p-6 rounded-2xl border border-amber-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-amber-300 font-medium">Companies Tracking</p>
              <p className="text-3xl font-black text-white mt-2">
                {analytics.top_companies.length}+
              </p>
            </div>
             <div className="p-3 bg-amber-500/20 rounded-xl">
                <TrendingUp className="w-6 h-6 text-amber-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Hiring Companies */}
        <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Top Hiring Companies
            </h3>
            <div className="space-y-4">
            {analytics.top_companies.slice(0, 8).map((company, index) => (
                <div key={company.company} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-transparent hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 flex items-center justify-center bg-blue-600/20 rounded-lg">
                    <span className="text-sm font-bold text-blue-300">{index + 1}</span>
                    </div>
                    <div>
                    <p className="font-bold text-white">{company.company}</p>
                    <p className="text-xs text-gray-400 uppercase tracking-wider">
                        {company.remote_ratio.toFixed(0)}% remote
                    </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-lg font-black text-white">{company.total_jobs}</p>
                    <p className="text-xs text-gray-500">OPEN ROLES</p>
                </div>
                </div>
            ))}
            </div>
        </div>

        {/* Most In-Demand Roles */}
        <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            Most In-Demand Roles
            </h3>
            <div className="space-y-4">
            {analytics.top_roles.slice(0, 8).map((role, index) => (
                <div key={role.role} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-transparent hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 flex items-center justify-center bg-amber-600/20 rounded-lg">
                    <span className="text-sm font-bold text-amber-300">{index + 1}</span>
                    </div>
                    <div>
                    <p className="font-bold text-white capitalize">{role.role}</p>
                    <p className="text-xs text-gray-400 uppercase tracking-wider">
                        {role.company_count} companies hiring
                    </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-lg font-black text-white">{role.count}</p>
                    {role.avg_salary > 0 && (
                    <p className="text-xs text-green-400 font-bold">
                        ${(role.avg_salary / 1000).toFixed(0)}k avg
                    </p>
                    )}
                </div>
                </div>
            ))}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {/* Highest Paying Companies */}
        <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Highest Paying Companies
          </h3>
          <div className="space-y-4">
            {analytics.salary_insights.highest_paying_companies.slice(0, 6).map((company, index) => (
              <div key={company.company} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-transparent hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-green-600/20 rounded-lg">
                    <span className="text-sm font-bold text-green-300">{index + 1}</span>
                  </div>
                  <span className="font-bold text-white">{company.company}</span>
                </div>
                <span className="text-lg font-black text-green-400">
                  ${(company.avg_salary / 1000).toFixed(0)}k
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Locations */}
        <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-purple-400" />
            Top Job Hubs
          </h3>
          <div className="space-y-4">
            {analytics.top_locations.slice(0, 6).map((location, index) => (
              <div key={location.location} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-transparent hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-purple-600/20 rounded-lg">
                    <span className="text-sm font-bold text-purple-300">{index + 1}</span>
                  </div>
                  <span className="font-bold text-white capitalize">{location.location}</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-white">{location.count}</span>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">
                    Jobs Found
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}