"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'; // Removed orderBy
import { useAuth } from '@/contexts/AuthContext';
import { 
  Briefcase, 
  Calendar, 
  Building2, 
  MapPin, 
  Search, 
  Filter, 
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  Trash2,
  TrendingUp,
  MoreHorizontal
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

// --- UI Components ---
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// --- Interfaces ---
interface Application {
  id: string;
  jobTitle: string;
  company: string;
  location?: string;
  status: 'applied' | 'interviewing' | 'offer' | 'rejected' | 'ghosted';
  appliedAt: any;
  jobId?: string;
  notes?: string;
  salary?: string;
  matchScore?: number;
  jobUrl?: string;
}

export default function ApplicationsPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Load Data ---
  useEffect(() => {
    async function fetchApplications() {
      if (!user) return;
      try {
        // FIXED: Removed 'orderBy' from query to prevent missing index/field issues
        const q = query(
          collection(db, 'applications'),
          where('userId', '==', user.uid)
        );
        
        const snapshot = await getDocs(q);
        
        const apps = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Application[];

        // FIXED: Sort client-side instead
        apps.sort((a, b) => {
          const dateA = a.appliedAt?.toDate ? a.appliedAt.toDate() : new Date(0);
          const dateB = b.appliedAt?.toDate ? b.appliedAt.toDate() : new Date(0);
          return dateB - dateA; // Descending order
        });

        setApplications(apps);
      } catch (error) {
        console.error("Error fetching applications:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchApplications();
  }, [user]);

  // --- Actions ---
  const handleStatusUpdate = async (appId: string, newStatus: string) => {
    try {
      const appRef = doc(db, 'applications', appId);
      await updateDoc(appRef, { status: newStatus });
      setApplications(prev => prev.map(app => 
        app.id === appId ? { ...app, status: newStatus as any } : app
      ));
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleDelete = async (appId: string) => {
    if (!confirm('Are you sure you want to remove this application?')) return;
    try {
      await deleteDoc(doc(db, 'applications', appId));
      setApplications(prev => prev.filter(app => app.id !== appId));
    } catch (error) {
      console.error("Error deleting application:", error);
    }
  };

  // --- Calculations ---
  const getCompanies = () => [...new Set(applications.map(app => app.company))];

  const getStats = () => {
    const total = applications.length;
    const interviewing = applications.filter(app => app.status === 'interviewing').length;
    const offers = applications.filter(app => app.status === 'offer').length;
    const responseRate = total > 0 ? ((interviewing + offers) / total * 100).toFixed(1) : 0;
    return { total, interviewing, offers, responseRate };
  };

  const stats = getStats();

  const filteredApps = applications.filter(app => {
    const matchesSearch = 
      app.jobTitle?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      app.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    const matchesCompany = companyFilter === 'all' || app.company === companyFilter;
    
    return matchesSearch && matchesStatus && matchesCompany;
  });

  // --- Helpers ---
  const getStatusBadge = (status: string) => {
    const styles = {
      offer: 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20',
      interviewing: 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20',
      rejected: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20',
      ghosted: 'bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/20',
      applied: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
    };
    // Fallback for any unknown status
    const style = styles[status as keyof typeof styles] || styles.applied;
    
    return (
      <Badge variant="outline" className={`${style} capitalize`}>
        {status}
      </Badge>
    );
  };

  if (!user) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse animation-delay-2000" />
        <div className="absolute inset-0 opacity-10" 
          style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} 
        />
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight mb-2">
              <span className="bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
                Applications Tracker
              </span>
            </h1>
            <p className="text-gray-400">Track and manage your job search progress.</p>
          </div>
          <Link href="/jobs">
            <Button className="bg-white text-black hover:bg-gray-200 rounded-xl font-bold">
              <Search className="w-4 h-4 mr-2" /> Find More Jobs
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Applications', value: stats.total, color: 'text-white', icon: Briefcase },
            { label: 'Interviewing', value: stats.interviewing, color: 'text-purple-400', icon: Calendar },
            { label: 'Offers', value: stats.offers, color: 'text-green-400', icon: CheckCircle2 },
            { label: 'Response Rate', value: `${stats.responseRate}%`, color: 'text-blue-400', icon: TrendingUp },
          ].map((stat, idx) => (
            <Card key={idx} className="bg-gray-900/50 backdrop-blur-xl border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">{stat.label}</span>
                  <stat.icon className={`w-4 h-4 ${stat.color} opacity-80`} />
                </div>
                <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input 
              placeholder="Search jobs or companies..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-900/50 border-gray-800 text-white placeholder:text-gray-500"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-gray-900/50 border-gray-800 text-white">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-800 text-white">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="interviewing">Interviewing</SelectItem>
              <SelectItem value="offer">Offer</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="ghosted">Ghosted</SelectItem>
            </SelectContent>
          </Select>

          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[180px] bg-gray-900/50 border-gray-800 text-white">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <SelectValue placeholder="Company" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-800 text-white">
              <SelectItem value="all">All Companies</SelectItem>
              {getCompanies().map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Applications Table */}
        <Card className="bg-gray-900/40 backdrop-blur-xl border-gray-800 overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
            ) : filteredApps.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <Briefcase className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <h3 className="text-xl font-bold text-gray-300">No applications found</h3>
                <p className="mb-6">Try adjusting your filters or apply to new jobs.</p>
                <Link href="/jobs">
                  <Button variant="outline" className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800">
                    Browse Jobs
                  </Button>
                </Link>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-gray-900/50">
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400">Position</TableHead>
                    <TableHead className="text-gray-400">Company</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                    <TableHead className="text-gray-400">Applied</TableHead>
                    <TableHead className="text-gray-400">Match</TableHead>
                    <TableHead className="text-right text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApps.map((app) => (
                    <TableRow key={app.id} className="border-gray-800 hover:bg-gray-800/30 transition-colors">
                      <TableCell>
                        <div className="font-semibold text-white">{app.jobTitle}</div>
                        {app.location && <div className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3"/> {app.location}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-gray-300">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          {app.company}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(app.status)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Calendar className="w-4 h-4 text-gray-600" />
                          {app.appliedAt ? formatDistanceToNow(app.appliedAt.toDate ? app.appliedAt.toDate() : new Date(), { addSuffix: true }) : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {app.matchScore ? (
                          <span className={`text-sm font-bold ${app.matchScore >= 90 ? 'text-green-400' : 'text-blue-400'}`}>
                            {app.matchScore}%
                          </span>
                        ) : <span className="text-gray-600">-</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {app.jobUrl && (
                            <Link href={app.jobUrl} target="_blank">
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-800">
                                <ArrowUpRight className="w-4 h-4" />
                              </Button>
                            </Link>
                          )}
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-800">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-800 text-gray-200">
                              <DropdownMenuItem onClick={() => handleStatusUpdate(app.id, 'interviewing')} className="hover:bg-gray-800 focus:bg-gray-800 cursor-pointer">
                                Mark as Interviewing
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusUpdate(app.id, 'offer')} className="hover:bg-gray-800 focus:bg-gray-800 cursor-pointer">
                                Mark as Offer
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusUpdate(app.id, 'rejected')} className="hover:bg-gray-800 focus:bg-gray-800 cursor-pointer text-red-400 hover:text-red-300">
                                Mark as Rejected
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(app.id)} className="hover:bg-red-900/20 focus:bg-red-900/20 cursor-pointer text-red-500 hover:text-red-400">
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}