"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { 
  User, 
  Mail, 
  Phone, 
  Camera, 
  Save, 
  Loader2, 
  ArrowLeft,
  CheckCircle,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form State
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoURL, setPhotoURL] = useState('');

  // Load User Data
  useEffect(() => {
    async function loadProfile() {
      if (!user) return;

      // Set defaults from Auth
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
      setPhotoURL(user.photoURL || '');

      // Fetch extended data from Firestore (like phone)
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.phoneNumber) setPhone(data.phoneNumber);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      }
    }
    loadProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    setSuccess(false);

    try {
      // 1. Update Firebase Auth Profile (Display Name)
      if (displayName !== user.displayName) {
        await updateProfile(user, { displayName });
      }

      // 2. Update Firestore Document (Phone, etc.)
      await setDoc(doc(db, 'users', user.uid), {
        displayName,
        email,
        phoneNumber: phone,
        updatedAt: new Date()
      }, { merge: true });

      setSuccess(true);
      
      // Reset success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);

    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* --- Background Gradients --- */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* Header */}
        <div>
          <Link href="/settings" className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Settings
          </Link>
          <h1 className="text-4xl font-black tracking-tight mb-2">
            <span className="bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
              Profile Information
            </span>
          </h1>
          <p className="text-gray-400 text-lg">Update your personal details and public profile.</p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-green-300 font-medium">Profile updated successfully!</span>
          </div>
        )}

        <div className="space-y-6">
          
          {/* Main Profile Card */}
          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
            
            {/* Avatar Section */}
            <div className="flex items-center gap-6 mb-8 pb-8 border-b border-gray-800">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 p-1">
                  <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                    {photoURL ? (
                      <img src={photoURL} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-10 h-10 text-gray-400" />
                    )}
                  </div>
                </div>
                <button className="absolute bottom-0 right-0 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-all transform hover:scale-110">
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{displayName || 'User'}</h2>
                <p className="text-sm text-gray-400">Personal Account</p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-6">
              
              {/* Full Name */}
              <div className="space-y-2">
                <Label className="text-gray-300 font-medium">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <Input 
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="bg-gray-800/50 border-gray-700 text-white pl-10 h-12 focus:border-blue-500"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>

              {/* Email Address (Read Only) */}
              <div className="space-y-2">
                <Label className="text-gray-300 font-medium">Email Address</Label>
                <div className="relative opacity-70 cursor-not-allowed">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <Input 
                    value={email}
                    disabled
                    className="bg-gray-800/30 border-gray-800 text-gray-400 pl-10 h-12"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Shield className="w-4 h-4 text-green-500" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed manually for security reasons.</p>
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <Label className="text-gray-300 font-medium">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <Input 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-gray-800/50 border-gray-700 text-white pl-10 h-12 focus:border-blue-500"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

            </div>

            {/* Actions */}
            <div className="mt-8 pt-6 border-t border-gray-800 flex justify-end gap-4">
              <Link href="/settings">
                <Button variant="outline" className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white">
                  Cancel
                </Button>
              </Link>
              <Button 
                onClick={handleSave} 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 text-white px-8"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Save Changes</>
                )}
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}