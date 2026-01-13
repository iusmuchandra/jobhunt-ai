"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge'; // Kept Badge for consistent behavior
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
  Ban, // Exclusions icon
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// --- Constants (Preserved Exactly) ---
const POPULAR_KEYWORDS = [
  'Product Manager', 'Software Engineer', 'Data Scientist', 
  'Network Engineer', 'DevOps Engineer', 'Frontend Developer',
  'Backend Developer', 'Full Stack', 'Machine Learning',
  'Security Engineer', 'Cloud Architect', 'UI/UX Designer'
];

const SENIORITY_LEVELS = [
  { value: 'junior', label: 'Junior (0-2 years)' },
  { value: 'mid', label: 'Mid-Level (2-5 years)' },
  { value: 'senior', label: 'Senior (5-8 years)' },
  { value: 'staff', label: 'Staff (8-12 years)' },
  { value: 'principal', label: 'Principal (12+ years)' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Director/VP/C-Level' }
];

const US_LOCATIONS = [
  'Remote', 'San Francisco', 'Bay Area', 'New York', 'Seattle',
  'Austin', 'Boston', 'Los Angeles', 'Chicago', 'Denver',
  'Portland', 'San Diego', 'Washington DC', 'Miami', 'Atlanta'
];

export default function PreferencesPage() {
  // --- Hooks & State ---
  const { user } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Job Keywords State
  const [keywords, setKeywords] = useState<string[]>([]);
  const [customKeyword, setCustomKeyword] = useState('');
  
  // Exclude Keywords State
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [customExcludeKeyword, setCustomExcludeKeyword] = useState('');

  // Other Preferences State
  const [seniority, setSeniority] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [customLocation, setCustomLocation] = useState('');
  const [minMatchScore, setMinMatchScore] = useState(60);

  // --- Load Existing Preferences ---
  useEffect(() => {
    async function loadPreferences() {
      if (!user) return;
      
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setKeywords(data.searchKeywords || []);
          setExcludeKeywords(data.excludedKeywords || []); // Load exclusions
          setSeniority(data.seniorityLevels || []);
          setLocations(data.preferredLocations || []);
          setMinMatchScore(data.minMatchScore || 60);
        }
      } catch (error) {
        console.error("Error loading preferences:", error);
      }
    }
    
    loadPreferences();
  }, [user]);

  // --- Handlers ---

  // Add Keyword Handler
  const addKeyword = (keyword: string) => {
    const normalized = keyword.toLowerCase().trim();
    if (normalized && !keywords.some(k => k.toLowerCase() === normalized)) {
      setKeywords([...keywords, keyword.trim()]);
      setCustomKeyword('');
    }
  };

  // Remove Keyword Handler
  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword));
  };

  // Add Exclude Keyword Handler
  const addExcludeKeyword = (keyword: string) => {
    const normalized = keyword.toLowerCase().trim();
    if (normalized && !excludeKeywords.some(k => k.toLowerCase() === normalized)) {
      setExcludeKeywords([...excludeKeywords, keyword.trim()]);
      setCustomExcludeKeyword('');
    }
  };

  // Remove Exclude Keyword Handler
  const removeExcludeKeyword = (keyword: string) => {
    setExcludeKeywords(excludeKeywords.filter(k => k !== keyword));
  };

  // Toggle Seniority Handler
  const toggleSeniority = (level: string) => {
    if (seniority.includes(level)) {
      setSeniority(seniority.filter(s => s !== level));
    } else {
      setSeniority([...seniority, level]);
    }
  };

  // Add Location Handler
  const addLocation = (location: string) => {
    const normalized = location.toLowerCase().trim();
    if (normalized && !locations.some(l => l.toLowerCase() === normalized)) {
      setLocations([...locations, location.trim()]);
      setCustomLocation('');
    }
  };

  // Remove Location Handler
  const removeLocation = (location: string) => {
    setLocations(locations.filter(l => l !== location));
  };

  // Save Preferences Handler
  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    setSaved(false);
    
    try {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        displayName: user.displayName,
        searchKeywords: keywords,
        excludeKeywords: excludeKeywords, // Save exclusions to Firestore
        seniorityLevels: seniority,
        preferredLocations: locations,
        minMatchScore: minMatchScore,
        preferencesUpdatedAt: new Date(),
      }, { merge: true });
      
      setSaved(true);
      setTimeout(() => router.push('/dashboard'), 1500);
      
    } catch (error) {
      console.error("Error saving preferences:", error);
      alert("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* --- Background Gradients (Premium Look) --- */}
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

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* Header */}
        <div>
          <Link href="/settings" className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Settings
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
                Job Preferences
              </span>
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Tell us what you're looking for. Our AI will match you with perfect opportunities.
          </p>
        </div>

        {saved && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-green-300 font-medium">
              Preferences saved! Redirecting to dashboard...
            </span>
          </div>
        )}

        <div className="space-y-6">
          
          {/* =======================
              KEYWORDS SECTION 
             ======================= */}
          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-bold text-white">Job Titles & Keywords</h2>
            </div>
            <p className="text-gray-400 mb-6 text-sm">
              What roles are you interested in? Add keywords that describe your ideal position.
            </p>

            {/* Selected Keywords Area */}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                {keywords.map((keyword, idx) => (
                  <Badge 
                    key={idx} 
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 text-blue-300 border-blue-500/30 hover:bg-blue-600/30 rounded-lg text-sm font-medium"
                  >
                    {keyword}
                    <button 
                      onClick={() => removeKeyword(keyword)}
                      className="ml-1 hover:text-white rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Quick Select Buttons */}
            <div className="mb-6">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Quick Select (Popular Roles)
              </p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_KEYWORDS.map((keyword) => (
                  <button
                    key={keyword}
                    onClick={() => addKeyword(keyword)}
                    disabled={keywords.includes(keyword)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                      keywords.includes(keyword)
                        ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                        : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Keyword Input */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Add Custom Keyword
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Technical Product Manager"
                  value={customKeyword}
                  onChange={(e) => setCustomKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKeyword(customKeyword);
                    }
                  }}
                  className="bg-gray-800/50 border-gray-700 text-white placeholder-gray-500"
                />
                <Button 
                  onClick={() => addKeyword(customKeyword)} 
                  disabled={!customKeyword.trim()} 
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* =======================
              EXCLUSIONS SECTION (NEW)
             ======================= */}
          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-2">
              <Ban className="w-5 h-5 text-red-400" />
              <h2 className="text-xl font-bold text-white">Exclusions & Negative Filters</h2>
            </div>
            <p className="text-gray-400 mb-6 text-sm">
              Are there specific terms you want to avoid? Jobs containing these words will be hidden.
            </p>

            <div className="flex gap-2 mb-4">
              <Input
                value={customExcludeKeyword}
                onChange={e => setCustomExcludeKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addExcludeKeyword(customExcludeKeyword);
                  }
                }}
                placeholder="e.g., Intern, Unpaid, Sales"
                className="bg-gray-800/50 border-gray-700 text-white placeholder-gray-500"
              />
              <Button 
                onClick={() => addExcludeKeyword(customExcludeKeyword)} 
                disabled={!customExcludeKeyword.trim()} 
                className="bg-gray-700 hover:bg-gray-600"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            {excludeKeywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
                {excludeKeywords.map(kw => (
                  <Badge key={kw} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 rounded-lg text-sm">
                    {kw} 
                    <button 
                      onClick={() => removeExcludeKeyword(kw)}
                      className="ml-1 hover:text-red-200 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* =======================
              SENIORITY SECTION 
             ======================= */}
          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-bold text-white">Experience Level</h2>
            </div>
            <p className="text-gray-400 mb-6 text-sm">
              Select all seniority levels you're open to.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SENIORITY_LEVELS.map((level) => (
                <button
                  key={level.value}
                  onClick={() => toggleSeniority(level.value)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    seniority.includes(level.value)
                      ? 'bg-purple-500/20 border-purple-500/50 text-white shadow-lg shadow-purple-900/20'
                      : 'bg-gray-800/30 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{level.label}</span>
                    {seniority.includes(level.value) && (
                      <CheckCircle className="w-5 h-5 text-purple-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* =======================
              LOCATIONS SECTION 
             ======================= */}
          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-5 h-5 text-green-400" />
              <h2 className="text-xl font-bold text-white">Preferred Locations</h2>
            </div>
            <p className="text-gray-400 mb-6 text-sm">
              Where would you like to work? Select multiple locations or add custom ones.
            </p>
            
            {/* Selected Locations */}
            {locations.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                {locations.map((loc, idx) => (
                  <Badge 
                    key={idx} 
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20 rounded-lg text-sm"
                  >
                    {loc}
                    <button 
                      onClick={() => removeLocation(loc)}
                      className="ml-1 hover:text-green-200 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Quick Select Locations */}
            <div className="mb-6">
               <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                 Popular US Locations
               </p>
               <div className="flex flex-wrap gap-2">
                {US_LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => addLocation(loc)}
                    disabled={locations.some(l => l.toLowerCase() === loc.toLowerCase())}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                      locations.some(l => l.toLowerCase() === loc.toLowerCase())
                        ? 'bg-gray-800 text-gray-500 border-gray-700'
                        : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:text-white'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
               </div>
            </div>

            {/* Custom Location Input */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Add Custom Location
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., London, Canada, Europe"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLocation(customLocation);
                    }
                  }}
                  className="bg-gray-800/50 border-gray-700 text-white placeholder-gray-500"
                />
                <Button 
                  onClick={() => addLocation(customLocation)} 
                  disabled={!customLocation.trim()} 
                  className="bg-green-600 hover:bg-green-500"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* =======================
              MATCH SCORE SECTION 
             ======================= */}
          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                <h2 className="text-xl font-bold text-white">Match Score Threshold</h2>
            </div>
            <p className="text-gray-400 mb-6 text-sm">
              Only show jobs with at least this match score (higher = more selective).
            </p>
            
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-400">Minimum Score:</span>
              <span className="text-2xl font-bold text-blue-400">{minMatchScore}%</span>
            </div>
            <Slider
              value={[minMatchScore]}
              onValueChange={(value) => setMinMatchScore(value[0])}
              min={30}
              max={90}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>30% (More jobs)</span>
              <span>90% (Perfect matches only)</span>
            </div>
          </div>

          {/* =======================
              SAVE ACTIONS 
             ======================= */}
          <div className="flex gap-4 pt-4 sticky bottom-4 z-10">
            <Button
              onClick={handleSave}
              disabled={saving || keywords.length === 0}
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
                  Save Preferences
                </>
              )}
            </Button>
            <Link href="/settings">
              <Button 
                variant="outline" 
                className="h-full bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white rounded-xl px-8"
              >
                Cancel
              </Button>
            </Link>
          </div>

          {/* Keyword Warning */}
          {keywords.length === 0 && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-200 text-sm">
              ⚠️ Please add at least one job keyword to start receiving matches
            </div>
          )}

        </div>
      </div>
    </div>
  );
}