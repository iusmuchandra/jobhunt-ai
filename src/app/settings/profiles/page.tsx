"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Sparkles,
  Plus,
  X,
  MapPin,
  Briefcase,
  Target,
  Save,
  Loader2,
  CheckCircle,
  Edit,
  Trash2,
  ChevronLeft,
  User,
  Zap,
  DollarSign,
  Building2,
  Globe
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { JobProfile } from '@/lib/types';

// Emoji picker options
const EMOJI_OPTIONS = [
  '🧑‍💻', '💼', '⚖️', '🏗️', '📊', '🎨', '🔬', '🩺', '✈️', '🏦',
  '📝', '🎯', '🔧', '📱', '🌐', '💡', '🤝', '🏛️', '🎓', '🚀'
];

// Remote preference options
const REMOTE_OPTIONS = [
  { value: 'remote', label: 'Remote Only' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
  { value: 'any', label: 'Any' }
];

// Experience level options
const EXPERIENCE_OPTIONS = [
  'Intern', 'Entry', 'Mid', 'Senior', 'Lead', 'Principal', 'Executive'
];

// Job type options
const JOB_TYPE_OPTIONS = [
  'Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship', 'Freelance'
];

// Industry options
const INDUSTRY_OPTIONS = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
  'Retail', 'Real Estate', 'Transportation', 'Energy', 'Government',
  'Non-profit', 'Entertainment', 'Media', 'Hospitality', 'Consulting'
];

export default function ProfilesPage() {
  // --- Hooks & State ---
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [userTier, setUserTier] = useState<'free' | 'pro' | 'premium' | 'enterprise'>('free');

  // Form state for creating/editing
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<JobProfile | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    emoji: '🎯',
    isActive: true,
    jobTitles: [] as string[],
    keywords: [] as string[],
    excludeKeywords: [] as string[],
    location: '',
    remotePreference: 'any' as 'remote' | 'hybrid' | 'onsite' | 'any',
    salaryMin: 0,
    experienceLevel: '',
    jobTypes: [] as string[],
    industries: [] as string[],
  });
  const [customKeyword, setCustomKeyword] = useState('');
  const [customExcludeKeyword, setCustomExcludeKeyword] = useState('');
  const [customJobTitle, setCustomJobTitle] = useState('');

  // --- Load Profiles & User Data ---
  useEffect(() => {
    async function loadData() {
      if (!user) return;

      try {
        setLoading(true);

        // Fetch user tier
        const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
        if (!userDoc.empty) {
          const userData = userDoc.docs[0].data();
          setUserTier(userData.tier || 'free');
        }

        // Fetch profiles
        const profilesRef = collection(db, 'users', user.uid, 'job_profiles');
        const profilesSnap = await getDocs(profilesRef);
        const profilesList = profilesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as JobProfile[];

        setProfiles(profilesList);
      } catch (error) {
        console.error("Error loading profiles:", error);
        toast({ title: 'Error', description: 'Failed to load profiles', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  // --- Form Handlers ---
  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addJobTitle = () => {
    const trimmed = customJobTitle.trim();
    if (trimmed && !formData.jobTitles.includes(trimmed)) {
      setFormData(prev => ({
        ...prev,
        jobTitles: [...prev.jobTitles, trimmed]
      }));
      setCustomJobTitle('');
    }
  };

  const removeJobTitle = (title: string) => {
    setFormData(prev => ({
      ...prev,
      jobTitles: prev.jobTitles.filter(t => t !== title)
    }));
  };

  const addKeyword = () => {
    const trimmed = customKeyword.trim();
    if (trimmed && !formData.keywords.includes(trimmed)) {
      setFormData(prev => ({
        ...prev,
        keywords: [...prev.keywords, trimmed]
      }));
      setCustomKeyword('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword)
    }));
  };

  const addExcludeKeyword = () => {
    const trimmed = customExcludeKeyword.trim();
    if (trimmed && !formData.excludeKeywords.includes(trimmed)) {
      setFormData(prev => ({
        ...prev,
        excludeKeywords: [...prev.excludeKeywords, trimmed]
      }));
      setCustomExcludeKeyword('');
    }
  };

  const removeExcludeKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      excludeKeywords: prev.excludeKeywords.filter(k => k !== keyword)
    }));
  };

  const toggleJobType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      jobTypes: prev.jobTypes.includes(type)
        ? prev.jobTypes.filter(t => t !== type)
        : [...prev.jobTypes, type]
    }));
  };

  const toggleIndustry = (industry: string) => {
    setFormData(prev => ({
      ...prev,
      industries: prev.industries.includes(industry)
        ? prev.industries.filter(i => i !== industry)
        : [...prev.industries, industry]
    }));
  };

  // --- Profile CRUD Operations ---
  const startCreate = () => {
    setIsEditing(true);
    setEditingProfile(null);
    setFormData({
      name: '',
      emoji: '🎯',
      isActive: true,
      jobTitles: [],
      keywords: [],
      excludeKeywords: [],
      location: '',
      remotePreference: 'any',
      salaryMin: 0,
      experienceLevel: '',
      jobTypes: [],
      industries: [],
    });
  };

  const startEdit = (profile: JobProfile) => {
    setIsEditing(true);
    setEditingProfile(profile);
    setFormData({
      name: profile.name,
      emoji: profile.emoji,
      isActive: profile.isActive,
      jobTitles: profile.jobTitles || [],
      keywords: profile.keywords || [],
      excludeKeywords: profile.excludeKeywords || [],
      location: profile.location || '',
      remotePreference: profile.remotePreference || 'any',
      salaryMin: profile.salaryMin || 0,
      experienceLevel: profile.experienceLevel || '',
      jobTypes: profile.jobTypes || [],
      industries: profile.industries || [],
    });
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditingProfile(null);
  };

  const saveProfile = async () => {
    if (!user) return;

    // Validate
    if (!formData.name.trim()) {
      toast({ title: 'Validation Error', description: 'Profile name is required', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const profileData = {
        ...formData,
        updatedAt: serverTimestamp(),
      };

      if (editingProfile) {
        // Update existing profile
        await updateDoc(doc(db, 'users', user.uid, 'job_profiles', editingProfile.id), profileData);
        toast({ title: 'Success', description: 'Profile updated successfully' });
      } else {
        // Create new profile - check limit for free users
        const isPro = userTier === 'pro' || userTier === 'premium' || userTier === 'enterprise';
        const profileLimit = isPro ? Infinity : 3;

        if (profiles.length >= profileLimit) {
          toast({
            title: 'Profile Limit Reached',
            description: 'Free users can have up to 3 profiles. Upgrade to Pro for unlimited profiles.',
            variant: 'destructive'
          });
          return;
        }

        // Add new profile
        await addDoc(collection(db, 'users', user.uid, 'job_profiles'), {
          ...profileData,
          createdAt: serverTimestamp(),
        });
        toast({ title: 'Success', description: 'Profile created successfully' });
      }

      // Refresh profiles
      const profilesRef = collection(db, 'users', user.uid, 'job_profiles');
      const profilesSnap = await getDocs(profilesRef);
      const profilesList = profilesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as JobProfile[];
      setProfiles(profilesList);

      setIsEditing(false);
      setEditingProfile(null);

    } catch (error) {
      console.error("Error saving profile:", error);
      toast({ title: 'Error', description: 'Failed to save profile', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async (profileId: string) => {
    if (!user) return;

    if (!confirm('Are you sure you want to delete this profile? All associated job matches will also be deleted.')) {
      return;
    }

    try {
      // Delete via API (which also deletes matches)
      const response = await fetch(`/api/profiles?id=${profileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` }
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      // Remove from local state
      setProfiles(profiles.filter(p => p.id !== profileId));
      toast({ title: 'Success', description: 'Profile deleted' });

    } catch (error) {
      console.error("Error deleting profile:", error);
      toast({ title: 'Error', description: 'Failed to delete profile', variant: 'destructive' });
    }
  };

  const toggleActive = async (profile: JobProfile) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, 'users', user.uid, 'job_profiles', profile.id), {
        isActive: !profile.isActive,
        updatedAt: serverTimestamp(),
      });

      // Update local state
      setProfiles(profiles.map(p =>
        p.id === profile.id ? { ...p, isActive: !p.isActive } : p
      ));

    } catch (error) {
      console.error("Error toggling active:", error);
    }
  };

  // --- Render Logic ---
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse animation-delay-2000" />
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
        {/* Header */}
        <div>
          <Link href="/settings" className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-4 transition-colors">
            <ChevronLeft className="w-4 h-4 mr-2" /> Back to Settings
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
                Job Profiles
              </span>
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Manage multiple search profiles for different roles. Free users can have up to 3 profiles.
          </p>
          {userTier !== 'free' && (
            <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-blue-300 text-sm">Pro Tier: Unlimited profiles</span>
            </div>
          )}
        </div>

        {/* Profiles Grid */}
        {!isEditing && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {profiles.map(profile => (
              <div key={profile.id} className="relative bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 hover:border-gray-600 transition-all">
                {/* Emoji & Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">{profile.emoji}</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white text-lg">{profile.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {profile.remotePreference !== 'any' && (
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">
                          {profile.remotePreference.charAt(0).toUpperCase() + profile.remotePreference.slice(1)}
                        </Badge>
                      )}
                      {profile.salaryMin > 0 && (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">
                          ${profile.salaryMin.toLocaleString()}+
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>Job Titles:</span>
                    <span className="text-white">{profile.jobTitles?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>Keywords:</span>
                    <span className="text-white">{profile.keywords?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>Exclusions:</span>
                    <span className="text-white">{profile.excludeKeywords?.length || 0}</span>
                  </div>
                  {profile.location && (
                    <div className="flex items-center text-sm text-gray-400">
                      <MapPin className="w-3 h-3 mr-1" />
                      {profile.location}
                    </div>
                  )}
                </div>

                {/* Active Toggle & Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={profile.isActive}
                      onCheckedChange={() => toggleActive(profile)}
                    />
                    <span className={`text-sm ${profile.isActive ? 'text-green-400' : 'text-gray-500'}`}>
                      {profile.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(profile)}
                      className="border-gray-700 text-gray-300 hover:text-white"
                    >
                      <Edit className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteProfile(profile.id)}
                      className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Add New Profile Card */}
            <button
              onClick={startCreate}
              disabled={userTier === 'free' && profiles.length >= 3}
              className={`relative bg-gray-900/30 backdrop-blur-xl border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all
                ${userTier === 'free' && profiles.length >= 3
                  ? 'border-gray-800 text-gray-500 cursor-not-allowed'
                  : 'border-gray-600 text-gray-300 hover:border-blue-500 hover:text-blue-400 hover:bg-gray-900/50'}`}
            >
              <Plus className="w-12 h-12" />
              <div className="text-center">
                <h3 className="font-bold text-lg">Add New Profile</h3>
                <p className="text-sm mt-1">
                  {userTier === 'free' && profiles.length >= 3
                    ? 'Upgrade to Pro for unlimited profiles'
                    : 'Create a new job search profile'}
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Edit/Create Form */}
        {isEditing && (
          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 md:p-8 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">
                {editingProfile ? 'Edit Profile' : 'Create New Profile'}
              </h2>
              <Button variant="outline" onClick={cancelEdit} className="border-gray-700 text-gray-300">
                Cancel
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column - Basic Info */}
              <div className="space-y-6">
                {/* Name & Emoji */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Profile Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="e.g., Senior Software Engineer"
                    className="bg-gray-800/50 border-gray-700 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Emoji</label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => handleInputChange('emoji', emoji)}
                        className={`text-2xl p-2 rounded-lg transition-all ${
                          formData.emoji === emoji
                            ? 'bg-blue-500/20 border-2 border-blue-500/50'
                            : 'bg-gray-800/30 border border-gray-700 hover:border-gray-500'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location & Remote */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Location Preference</label>
                  <Input
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="e.g., Remote, San Francisco, etc."
                    className="bg-gray-800/50 border-gray-700 text-white mb-4"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {REMOTE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        onClick={() => handleInputChange('remotePreference', option.value)}
                        className={`p-3 rounded-lg border text-sm transition-all ${
                          formData.remotePreference === option.value
                            ? 'bg-blue-500/20 border-blue-500/50 text-white'
                            : 'bg-gray-800/30 border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Salary & Experience */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Minimum Salary</label>
                    <div className="flex items-center">
                      <DollarSign className="w-4 h-4 text-gray-500 mr-2" />
                      <Input
                        type="number"
                        value={formData.salaryMin}
                        onChange={(e) => handleInputChange('salaryMin', parseInt(e.target.value) || 0)}
                        className="bg-gray-800/50 border-gray-700 text-white"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Experience Level</label>
                    <select
                      value={formData.experienceLevel}
                      onChange={(e) => handleInputChange('experienceLevel', e.target.value)}
                      className="w-full bg-gray-800/50 border border-gray-700 text-white rounded-lg p-2.5"
                    >
                      <option value="">Any</option>
                      {EXPERIENCE_OPTIONS.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Right Column - Keywords & Filters */}
              <div className="space-y-6">
                {/* Job Titles */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Job Titles</label>
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={customJobTitle}
                      onChange={(e) => setCustomJobTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addJobTitle())}
                      placeholder="e.g., Product Manager"
                      className="bg-gray-800/50 border-gray-700 text-white"
                    />
                    <Button onClick={addJobTitle} className="bg-blue-600 hover:bg-blue-500">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.jobTitles.map(title => (
                      <Badge key={title} className="flex items-center gap-2 bg-blue-500/10 text-blue-400 border-blue-500/20">
                        {title}
                        <button onClick={() => removeJobTitle(title)} className="hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Keywords */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Keywords</label>
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={customKeyword}
                      onChange={(e) => setCustomKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                      placeholder="e.g., React, Python, Machine Learning"
                      className="bg-gray-800/50 border-gray-700 text-white"
                    />
                    <Button onClick={addKeyword} className="bg-blue-600 hover:bg-blue-500">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.keywords.map(keyword => (
                      <Badge key={keyword} className="flex items-center gap-2 bg-purple-500/10 text-purple-400 border-purple-500/20">
                        {keyword}
                        <button onClick={() => removeKeyword(keyword)} className="hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Exclude Keywords */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Exclude Keywords</label>
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={customExcludeKeyword}
                      onChange={(e) => setCustomExcludeKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExcludeKeyword())}
                      placeholder="e.g., Intern, Unpaid, Sales"
                      className="bg-gray-800/50 border-gray-700 text-white"
                    />
                    <Button onClick={addExcludeKeyword} className="bg-gray-700 hover:bg-gray-600">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.excludeKeywords.map(keyword => (
                      <Badge key={keyword} className="flex items-center gap-2 bg-red-500/10 text-red-400 border-red-500/20">
                        {keyword}
                        <button onClick={() => removeExcludeKeyword(keyword)} className="hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Job Types */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Job Types</label>
                  <div className="flex flex-wrap gap-2">
                    {JOB_TYPE_OPTIONS.map(type => (
                      <button
                        key={type}
                        onClick={() => toggleJobType(type)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                          formData.jobTypes.includes(type)
                            ? 'bg-green-500/20 border-green-500/50 text-white'
                            : 'bg-gray-800/30 border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Industries */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Industries</label>
                  <div className="flex flex-wrap gap-2">
                    {INDUSTRY_OPTIONS.map(industry => (
                      <button
                        key={industry}
                        onClick={() => toggleIndustry(industry)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                          formData.industries.includes(industry)
                            ? 'bg-yellow-500/20 border-yellow-500/50 text-white'
                            : 'bg-gray-800/30 border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {industry}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-4 pt-6 border-t border-gray-800">
              <Button
                onClick={saveProfile}
                disabled={saving || !formData.name.trim()}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-6 rounded-xl shadow-lg shadow-purple-900/20"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    {editingProfile ? 'Update Profile' : 'Create Profile'}
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={cancelEdit} className="h-full bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white rounded-xl px-8">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isEditing && profiles.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-2xl font-bold text-white mb-2">No profiles yet</h3>
            <p className="text-gray-400 mb-6">Create your first job search profile to start receiving matches</p>
            <Button onClick={startCreate} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500">
              <Plus className="w-5 h-5 mr-2" /> Create First Profile
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}