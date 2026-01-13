"use client";

import React, { useState, useEffect } from 'react';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  Loader2, 
  ArrowLeft, 
  Sparkles, 
  UploadCloud // FIXED: Changed from CloudUpload to UploadCloud
} from 'lucide-react';
import Link from 'next/link';

export default function ResumePage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [currentResume, setCurrentResume] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<any>(null);

  // Load existing resume
  useEffect(() => {
    async function fetchResume() {
      if (!user) return;
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().resumeUrl) {
          setCurrentResume(docSnap.data().resumeUrl);
          setResumeName(docSnap.data().resumeName || "Master Resume.pdf");
          setLastUpdated(docSnap.data().resumeUpdatedAt);
        }
      } catch (error) {
        console.error("Error fetching resume:", error);
      }
    }
    fetchResume();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);

    try {
      // 1. Upload to Firebase Storage
      const storageRef = ref(storage, `resumes/${user.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // 2. Save Link to Firestore User Profile
      await setDoc(doc(db, 'users', user.uid), {
        resumeUrl: downloadURL,
        resumeName: file.name,
        resumeUpdatedAt: new Date()
      }, { merge: true });

      setCurrentResume(downloadURL);
      setResumeName(file.name);
      setLastUpdated(new Date());
      setFile(null);

    } catch (error) {
      console.error("Error uploading resume:", error);
      alert("Failed to upload resume. Please try again.");
    } finally {
      setUploading(false);
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
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-pink-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
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
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-8 h-8 text-pink-400" />
            <h1 className="text-4xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-white via-pink-200 to-purple-200 bg-clip-text text-transparent">
                Resume & Documents
              </span>
            </h1>
          </div>
          <p className="text-gray-400 text-lg">Upload your master resume. Our AI will use this to tailor your applications.</p>
        </div>

        {/* Main Card */}
        <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-5 h-5 text-pink-400" />
            <h2 className="text-xl font-bold text-white">Master Resume</h2>
          </div>

          <div className="space-y-6">
            
            {/* Current Resume Status */}
            {currentResume ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center border border-green-500/30">
                    <FileText className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">{resumeName}</p>
                    <p className="text-xs text-green-300/80 flex items-center gap-1.5 mt-1">
                      <CheckCircle className="w-3 h-3" />
                      Uploaded {lastUpdated ? new Date(lastUpdated.seconds * 1000).toLocaleDateString() : 'Just now'}
                    </p>
                  </div>
                </div>
                <Link href={currentResume} target="_blank">
                  <button className="px-4 py-2 bg-green-900/20 border border-green-500/30 text-green-300 hover:bg-green-500/20 hover:text-white rounded-xl font-medium transition-all">
                    View PDF
                  </button>
                </Link>
              </div>
            ) : (
              <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-2xl p-8 text-center hover:bg-gray-800/50 transition-colors">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-700">
                  <UploadCloud className="w-8 h-8 text-gray-400" /> {/* FIXED HERE */}
                </div>
                <p className="text-white font-semibold text-lg">No resume uploaded yet</p>
                <p className="text-sm text-gray-500 mt-1">Upload a PDF to get started with AI features</p>
              </div>
            )}

            {/* Upload Area */}
            <div className="pt-6 border-t border-gray-800">
              <label className="block text-sm font-medium text-gray-300 mb-3 uppercase tracking-wider">
                {currentResume ? 'Update Resume' : 'Upload New Resume'}
              </label>
              
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Styled File Input */}
                <div className="relative flex-1">
                  <input 
                    type="file" 
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className={`w-full h-12 bg-gray-800/50 border ${file ? 'border-pink-500/50 text-white' : 'border-gray-700 text-gray-400'} rounded-xl flex items-center px-4 transition-all`}>
                    {file ? (
                      <span className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-pink-400" />
                        {file.name}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Select PDF file...
                      </span>
                    )}
                  </div>
                </div>

                <button 
                  onClick={handleUpload} 
                  disabled={!file || uploading}
                  className="flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-500 text-white h-12 px-8 rounded-xl font-medium shadow-lg shadow-pink-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2 ml-1">Supported format: PDF (Max 5MB)</p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}