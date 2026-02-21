'use client';

import React from 'react';
import Link from 'next/link';
import { 
  User, 
  FileText, 
  CreditCard, 
  Bell, 
  ChevronRight, 
  Shield,
  Target,
  Zap,
  LogOut
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsPage() {
  const { signOut } = useAuth();

  const settingsOptions = [
    {
      title: "Job Profiles",
      description: "Manage multiple search profiles for different roles",
      icon: Target,
      href: "/settings/profiles",
      color: "text-blue-400",
      bgColor: "bg-blue-400/10"
    },
    {
      title: "Profile Information",
      description: "Update your name, email, and contact info",
      icon: User,
      href: "/settings/profile",
      color: "text-purple-400",
      bgColor: "bg-purple-400/10"
    },
    {
      title: "Resume & Documents",
      description: "Upload your master resume for applications",
      icon: FileText,
      href: "/settings/resume",
      color: "text-pink-400",
      bgColor: "bg-pink-400/10"
    },
    {
      title: "Auto-Apply Setup",
      description: "Configure one-click job applications",
      icon: Zap,
      href: "/settings/auto-apply",
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/10"
    },
    {
      title: "Billing & Subscription",
      description: "Manage your Pro plan and payment methods",
      icon: CreditCard,
      href: "/settings/billing", 
      color: "text-green-400",
      bgColor: "bg-green-400/10"
    },
    {
      title: "Notifications",
      description: "Configure your job alert emails",
      icon: Bell,
      href: "/settings/notifications",
      color: "text-orange-400",
      bgColor: "bg-orange-400/10"
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* --- Background Gradients (Premium Look) --- */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-10">
        
        {/* Header */}
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-2">
            <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Settings
            </span>
          </h1>
          <p className="text-gray-400 text-lg">Manage your account preferences and AI configurations.</p>
        </div>

        {/* Settings Grid */}
        <div className="grid gap-4">
          {settingsOptions.map((option, index) => (
            <Link key={index} href={option.href}>
              <div className="group relative bg-gray-900/40 hover:bg-gray-800/60 backdrop-blur-xl border border-gray-800 hover:border-gray-600 rounded-2xl p-4 transition-all duration-300 flex items-center gap-4 cursor-pointer">
                <div className={`p-3 rounded-xl ${option.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                  <option.icon className={`w-6 h-6 ${option.color}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">{option.title}</h3>
                  <p className="text-sm text-gray-400">{option.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          ))}
        </div>

        {/* Security Section */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4">Security</h2>
          <div className="group relative bg-gray-900/40 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 flex items-center justify-between">
             <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gray-800/50">
                  <Shield className="w-6 h-6 text-gray-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Password & Authentication</h3>
                  <p className="text-sm text-gray-400">Managed via Firebase Auth</p>
                </div>
              </div>
              <button className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
                Change Password
              </button>
          </div>
        </div>

         {/* Sign Out Button */}
         <div className="pt-4">
             <button 
               onClick={() => signOut()}
               className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors px-4 py-2 rounded-lg hover:bg-red-400/10"
             >
               <LogOut className="w-5 h-5" />
               <span className="font-medium">Sign Out</span>
             </button>
          </div>

      </div>
    </div>
  );
}