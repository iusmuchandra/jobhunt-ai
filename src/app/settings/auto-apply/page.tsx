"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Save, Plus, Trash2, Loader2, CheckCircle, Zap, 
  Briefcase, Globe, User, Settings, FileText, 
  Download, ArrowLeft, X, MessageSquare
} from 'lucide-react';
import Link from 'next/link';

// Interfaces
interface WorkExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

interface Education {
  school: string;
  degree: string;
  field: string;
  graduationYear: string;
}

interface CustomQuestion {
  keyword: string;
  answer: string;
}

export default function AutoApplySetupPage() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  // --- 1. Personal & Contact ---
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');

  // --- 2. Professional Info ---
  const [currentTitle, setCurrentTitle] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');

  // --- 3. Experience & Education ---
  const [workHistory, setWorkHistory] = useState<WorkExperience[]>([{
    company: '', title: '', startDate: '', endDate: '', current: false, description: ''
  }]);
  const [education, setEducation] = useState<Education[]>([{
    school: '', degree: '', field: '', graduationYear: ''
  }]);

  // --- 4. Job Preferences & Custom Q&A ---
  const [desiredSalary, setDesiredSalary] = useState('');
  const [workplaceType, setWorkplaceType] = useState('remote');
  const [relocation, setRelocation] = useState(false);
  
  // NEW: Custom Questions State
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([
    { keyword: 'Notice Period', answer: '2 weeks' },
    { keyword: 'Hear about us', answer: 'LinkedIn' },
    { keyword: 'Clearance', answer: 'None' }
  ]);

  // --- 5. Legal & EEOC ---
  const [eligibleToWorkInUS, setEligibleToWorkInUS] = useState<boolean>(true);
  const [requiresSponsorship, setRequiresSponsorship] = useState<boolean>(false);
  const [gender, setGender] = useState('');
  const [race, setRace] = useState('');
  const [veteranStatus, setVeteranStatus] = useState('');
  const [disabilityStatus, setDisabilityStatus] = useState('');

  // --- 6. Application Config ---
  const [coverLetterTemplate, setCoverLetterTemplate] = useState(
    "Dear Hiring Manager at {COMPANY},\n\nI am excited to apply for the {POSITION} role..."
  );

  // Load Data
  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPhone(data.phone || '');
          setLocation(data.location || '');
          setLinkedinUrl(data.linkedinUrl || '');
          setPortfolioUrl(data.portfolioUrl || '');
          setGithubUrl(data.githubUrl || '');
          setCurrentTitle(data.currentTitle || '');
          setYearsOfExperience(data.yearsOfExperience?.toString() || '');
          setSkills(data.skills || []);
          setWorkHistory(data.workHistory || []);
          setEducation(data.education || []);
          setDesiredSalary(data.desiredSalary || '');
          setWorkplaceType(data.workplaceType || 'remote');
          setRelocation(data.relocation || false);
          
          // Load custom questions or fallback to defaults if empty
          if (data.customQuestions && data.customQuestions.length > 0) {
            setCustomQuestions(data.customQuestions);
          }

          setEligibleToWorkInUS(data.eligibleToWorkInUS ?? true);
          setRequiresSponsorship(data.requiresSponsorship ?? false);
          setGender(data.gender || '');
          setRace(data.race || '');
          setVeteranStatus(data.veteranStatus || '');
          setDisabilityStatus(data.disabilityStatus || '');
          if (data.coverLetterTemplate) setCoverLetterTemplate(data.coverLetterTemplate);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      }
    }
    loadProfile();
  }, [user]);

  // Handlers
  const handleAddSkill = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newSkill.trim()) {
      e.preventDefault();
      if (!skills.includes(newSkill.trim())) {
        setSkills([...skills, newSkill.trim()]);
      }
      setNewSkill('');
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setSkills(skills.filter(s => s !== skillToRemove));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        phone, location, linkedinUrl, portfolioUrl, githubUrl,
        currentTitle, yearsOfExperience, skills,
        workHistory, education,
        desiredSalary, workplaceType, relocation,
        customQuestions, // Save custom Q&A
        eligibleToWorkInUS, requiresSponsorship,
        gender, race, veteranStatus, disabilityStatus,
        coverLetterTemplate,
        autoApplySetupComplete: true,
        updatedAt: new Date(),
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({ title: 'Error', description: 'Failed to save.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const exportForExtension = () => {
    const profileData = {
      user: { name: user?.displayName, email: user?.email },
      contact: { phone, location, linkedinUrl, portfolioUrl, githubUrl },
      professional: { currentTitle, yearsOfExperience, skills },
      history: { workHistory, education },
      preferences: { desiredSalary, workplaceType, relocation, customQuestions },
      legal: { eligibleToWorkInUS, requiresSponsorship, gender, race, veteranStatus, disabilityStatus },
      coverLetter: coverLetterTemplate
    };
    const blob = new Blob([JSON.stringify(profileData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jobhunt-auto-apply-profile.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!user) return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-yellow-500 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-yellow-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse animation-delay-2000" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <Link href="/settings" className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Settings
            </Link>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <span className="bg-gradient-to-r from-yellow-200 via-orange-200 to-red-200 bg-clip-text text-transparent">
                Auto-Apply Profile
              </span>
              <Badge className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border-yellow-500/50">
                <Zap className="w-3 h-3 mr-1" /> Pro
              </Badge>
            </h1>
            <p className="text-gray-400 mt-1">Complete your profile once to unlock 1-click applications.</p>
          </div>
          
          <div className="flex gap-3">
             <Button onClick={exportForExtension} variant="outline" className="bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 gap-2">
              <Download className="w-4 h-4" /> Export JSON
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-yellow-600 hover:bg-yellow-500 text-white gap-2 font-bold shadow-lg shadow-yellow-900/20">
              {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
              Save Profile
            </Button>
          </div>
        </div>

        {saved && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <CheckCircle className="w-5 h-5" /> Changes saved successfully!
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gray-900/50 border border-gray-800 p-1 h-auto flex-wrap justify-start w-full rounded-xl">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"> <User className="w-4 h-4" /> Profile</TabsTrigger>
            <TabsTrigger value="experience" className="gap-2 data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"> <Briefcase className="w-4 h-4" /> Experience</TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2 data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"> <Settings className="w-4 h-4" /> Preferences</TabsTrigger>
            <TabsTrigger value="legal" className="gap-2 data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"> <Globe className="w-4 h-4" /> Legal</TabsTrigger>
            <TabsTrigger value="coverletter" className="gap-2 data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"> <FileText className="w-4 h-4" /> Cover Letter</TabsTrigger>
          </TabsList>

          {/* --- TAB 1: PROFILE --- */}
          <TabsContent value="profile" className="space-y-6">
            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-6">Basic Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-gray-300">Phone Number *</Label>
                  <Input className="bg-gray-800/50 border-gray-700 text-white" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Location (City, State) *</Label>
                  <Input className="bg-gray-800/50 border-gray-700 text-white" value={location} onChange={e => setLocation(e.target.value)} placeholder="New York, NY" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Current Job Title</Label>
                  <Input className="bg-gray-800/50 border-gray-700 text-white" value={currentTitle} onChange={e => setCurrentTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Years of Experience</Label>
                  <Input className="bg-gray-800/50 border-gray-700 text-white" type="number" value={yearsOfExperience} onChange={e => setYearsOfExperience(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-6">Professional Links</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">LinkedIn URL</Label>
                  <Input className="bg-gray-800/50 border-gray-700 text-white" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Portfolio / Website</Label>
                  <Input className="bg-gray-800/50 border-gray-700 text-white" value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} placeholder="https://myportfolio.com" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">GitHub URL</Label>
                  <Input className="bg-gray-800/50 border-gray-700 text-white" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/..." />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* --- TAB 2: EXPERIENCE --- */}
          <TabsContent value="experience" className="space-y-6">
            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <div className="flex flex-row items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Work History</h2>
                  <p className="text-gray-400 text-sm">Most recent roles are most important</p>
                </div>
                <Button onClick={() => setWorkHistory([...workHistory, { company: '', title: '', startDate: '', endDate: '', current: false, description: '' }])} variant="outline" size="sm" className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700">
                  <Plus className="w-4 h-4 mr-2" /> Add Job
                </Button>
              </div>
              <div className="space-y-6">
                {workHistory.map((work, idx) => (
                  <div key={idx} className="p-6 border border-gray-700 bg-gray-800/30 rounded-2xl space-y-4 relative">
                    <Button variant="ghost" size="sm" className="absolute top-4 right-4 text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={() => setWorkHistory(workHistory.filter((_, i) => i !== idx))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label className="text-gray-300">Company</Label><Input className="bg-gray-900/50 border-gray-700 text-white" value={work.company} onChange={e => { const newH = [...workHistory]; newH[idx].company = e.target.value; setWorkHistory(newH); }} /></div>
                      <div className="space-y-2"><Label className="text-gray-300">Job Title</Label><Input className="bg-gray-900/50 border-gray-700 text-white" value={work.title} onChange={e => { const newH = [...workHistory]; newH[idx].title = e.target.value; setWorkHistory(newH); }} /></div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-2"><Label className="text-gray-300">Start Date</Label><Input className="bg-gray-900/50 border-gray-700 text-white" type="month" value={work.startDate} onChange={e => { const newH = [...workHistory]; newH[idx].startDate = e.target.value; setWorkHistory(newH); }} /></div>
                      <div className="space-y-2"><Label className="text-gray-300">End Date</Label><Input className="bg-gray-900/50 border-gray-700 text-white" type="month" value={work.endDate} disabled={work.current} onChange={e => { const newH = [...workHistory]; newH[idx].endDate = e.target.value; setWorkHistory(newH); }} /></div>
                      <div className="flex items-center pt-8"><input type="checkbox" className="mr-2 w-4 h-4 rounded border-gray-600 bg-gray-700" checked={work.current} onChange={e => { const newH = [...workHistory]; newH[idx].current = e.target.checked; setWorkHistory(newH); }} /><Label className="text-gray-300">Current Role</Label></div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-300">Description</Label>
                      <Textarea className="bg-gray-900/50 border-gray-700 text-white min-h-[100px]" value={work.description} onChange={e => { const newH = [...workHistory]; newH[idx].description = e.target.value; setWorkHistory(newH); }} placeholder="• Led a team of..." />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <div className="flex flex-row items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Education</h2>
                <Button onClick={() => setEducation([...education, { school: '', degree: '', field: '', graduationYear: '' }])} variant="outline" size="sm" className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700">
                  <Plus className="w-4 h-4 mr-2" /> Add Education
                </Button>
              </div>
              <div className="space-y-6">
                {education.map((edu, idx) => (
                  <div key={idx} className="p-6 border border-gray-700 bg-gray-800/30 rounded-2xl space-y-4 relative">
                     <Button variant="ghost" size="sm" className="absolute top-4 right-4 text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={() => setEducation(education.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4" /></Button>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2"><Label className="text-gray-300">School</Label><Input className="bg-gray-900/50 border-gray-700 text-white" value={edu.school} onChange={e => { const newE = [...education]; newE[idx].school = e.target.value; setEducation(newE); }} /></div>
                        <div className="space-y-2"><Label className="text-gray-300">Degree</Label><Input className="bg-gray-900/50 border-gray-700 text-white" value={edu.degree} onChange={e => { const newE = [...education]; newE[idx].degree = e.target.value; setEducation(newE); }} /></div>
                        <div className="space-y-2"><Label className="text-gray-300">Field of Study</Label><Input className="bg-gray-900/50 border-gray-700 text-white" value={edu.field} onChange={e => { const newE = [...education]; newE[idx].field = e.target.value; setEducation(newE); }} /></div>
                        <div className="space-y-2"><Label className="text-gray-300">Graduation Year</Label><Input className="bg-gray-900/50 border-gray-700 text-white" value={edu.graduationYear} onChange={e => { const newE = [...education]; newE[idx].graduationYear = e.target.value; setEducation(newE); }} /></div>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* --- TAB 3: PREFERENCES & SKILLS --- */}
          <TabsContent value="preferences" className="space-y-6">
            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-2">Skills</h2>
              <p className="text-gray-400 mb-6 text-sm">Type a skill and press Enter to add it.</p>
              <Input 
                value={newSkill} 
                onChange={e => setNewSkill(e.target.value)} 
                onKeyDown={handleAddSkill} 
                placeholder="e.g. React, Python, Product Management (Press Enter)" 
                className="bg-gray-800/50 border-gray-700 text-white mb-4"
              />
              <div className="flex flex-wrap gap-2">
                {skills.map(skill => (
                  <Badge key={skill} className="px-3 py-1.5 text-sm flex items-center gap-2 bg-yellow-500/20 text-yellow-300 border-yellow-500/30 hover:bg-yellow-500/30">
                    {skill} <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => removeSkill(skill)} />
                  </Badge>
                ))}
                {skills.length === 0 && <span className="text-sm text-gray-500 italic">No skills added yet.</span>}
              </div>
            </div>

            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-6">Job Preferences</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-gray-300">Desired Salary (Annual USD)</Label>
                  <Input className="bg-gray-800/50 border-gray-700 text-white" value={desiredSalary} onChange={e => setDesiredSalary(e.target.value)} placeholder="120000" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Workplace Type</Label>
                  <Select value={workplaceType} onValueChange={setWorkplaceType}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="remote">Remote Only</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="onsite">On-site</SelectItem>
                      <SelectItem value="any">Open to Any</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-3 pt-4">
                  <input type="checkbox" id="reloc" checked={relocation} onChange={e => setRelocation(e.target.checked)} className="w-5 h-5 rounded border-gray-600 bg-gray-700" />
                  <Label htmlFor="reloc" className="cursor-pointer text-gray-300">I am willing to relocate</Label>
                </div>
              </div>
            </div>

            {/* NEW: Custom Common Questions Section */}
            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-purple-400" />
                    Common Questions & Answers
                  </h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Pre-fill answers for common application questions to avoid using AI for basic facts.
                  </p>
                </div>
                <Button 
                  onClick={() => setCustomQuestions([...customQuestions, { keyword: '', answer: '' }])}
                  variant="outline" 
                  size="sm" 
                  className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Question
                </Button>
              </div>

              <div className="space-y-4">
                {customQuestions.map((q, idx) => (
                  <div key={idx} className="flex gap-4 items-start p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs text-gray-400">If question contains keyword:</Label>
                      <Input 
                        placeholder="e.g. Notice Period" 
                        value={q.keyword}
                        onChange={e => {
                          const newQ = [...customQuestions];
                          newQ[idx].keyword = e.target.value;
                          setCustomQuestions(newQ);
                        }}
                        className="bg-gray-900/50 border-gray-700 text-white"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs text-gray-400">Auto-fill this answer:</Label>
                      <Input 
                        placeholder="e.g. 2 weeks" 
                        value={q.answer}
                        onChange={e => {
                          const newQ = [...customQuestions];
                          newQ[idx].answer = e.target.value;
                          setCustomQuestions(newQ);
                        }}
                        className="bg-gray-900/50 border-gray-700 text-white"
                      />
                    </div>
                    <div className="pt-8">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setCustomQuestions(customQuestions.filter((_, i) => i !== idx))}
                        className="text-gray-500 hover:text-red-400 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {customQuestions.length === 0 && (
                  <div className="text-center py-8 text-gray-500 border border-dashed border-gray-800 rounded-xl">
                    No custom questions added yet. Add "Notice Period" or "Clearance" to speed up applications.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

           {/* --- TAB 4: LEGAL & EEOC --- */}
           <TabsContent value="legal" className="space-y-6">
            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-6">Work Authorization</h2>
              <div className="space-y-4">
                <div className="flex items-center space-x-3 p-4 border border-gray-700 bg-gray-800/30 rounded-xl hover:bg-gray-800/50 transition-colors">
                  <input type="checkbox" checked={eligibleToWorkInUS} onChange={e => setEligibleToWorkInUS(e.target.checked)} className="w-5 h-5 rounded border-gray-600 bg-gray-700" />
                  <Label className="text-gray-300 cursor-pointer">I am authorized to work in the United States</Label>
                </div>
                <div className="flex items-center space-x-3 p-4 border border-gray-700 bg-gray-800/30 rounded-xl hover:bg-gray-800/50 transition-colors">
                  <input type="checkbox" checked={requiresSponsorship} onChange={e => setRequiresSponsorship(e.target.checked)} className="w-5 h-5 rounded border-gray-600 bg-gray-700" />
                  <Label className="text-gray-300 cursor-pointer">I will require visa sponsorship now or in the future</Label>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-2">EEOC Information (Voluntary)</h2>
              <p className="text-gray-400 mb-6 text-sm">Standard questions asked by 99% of ATS systems. Providing this allows for fuller auto-completion.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-gray-300">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="non-binary">Non-binary</SelectItem>
                      <SelectItem value="decline">Decline to Self-Identify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Race / Ethnicity</Label>
                  <Select value={race} onValueChange={setRace}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="white">White</SelectItem>
                      <SelectItem value="black">Black or African American</SelectItem>
                      <SelectItem value="hispanic">Hispanic or Latino</SelectItem>
                      <SelectItem value="asian">Asian</SelectItem>
                      <SelectItem value="two_or_more">Two or More Races</SelectItem>
                      <SelectItem value="decline">Decline to Self-Identify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Veteran Status</Label>
                  <Select value={veteranStatus} onValueChange={setVeteranStatus}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="veteran">I am a Veteran</SelectItem>
                      <SelectItem value="not_veteran">I am not a Veteran</SelectItem>
                      <SelectItem value="decline">Decline to Self-Identify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Disability Status</Label>
                  <Select value={disabilityStatus} onValueChange={setDisabilityStatus}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="yes">Yes, I have a disability</SelectItem>
                      <SelectItem value="no">No, I do not have a disability</SelectItem>
                      <SelectItem value="decline">Decline to Self-Identify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
           </TabsContent>

          {/* --- TAB 5: COVER LETTER --- */}
          <TabsContent value="coverletter" className="space-y-6">
            <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-2">Master Cover Letter Template</h2>
              <p className="text-gray-400 mb-6 text-sm">This template is used when the AI generates a letter. Use the variables below to make it dynamic.</p>
              
              <div className="flex gap-2 flex-wrap mb-4">
                <Badge variant="outline" className="cursor-pointer border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white" onClick={() => setCoverLetterTemplate(prev => prev + "{COMPANY}")}>+ {"{COMPANY}"}</Badge>
                <Badge variant="outline" className="cursor-pointer border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white" onClick={() => setCoverLetterTemplate(prev => prev + "{POSITION}")}>+ {"{POSITION}"}</Badge>
                <Badge variant="outline" className="cursor-pointer border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white" onClick={() => setCoverLetterTemplate(prev => prev + "{YOUR_NAME}")}>+ {"{YOUR_NAME}"}</Badge>
              </div>
              <Textarea 
                rows={15} 
                className="font-mono text-sm leading-relaxed bg-gray-800/50 border-gray-700 text-gray-200 focus:ring-yellow-500/50"
                value={coverLetterTemplate} 
                onChange={e => setCoverLetterTemplate(e.target.value)} 
              />
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}