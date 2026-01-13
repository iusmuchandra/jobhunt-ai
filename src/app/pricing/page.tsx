"use client"; // <--- This is important for buttons to work!

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    
    // Simulate API call to Stripe
    await new Promise(resolve => setTimeout(resolve, 2000));

    // In a real app, this is where you'd redirect to the Stripe Checkout URL
    alert("🎉 Upgrade Successful! (This is a demo)");
    
    setLoading(false);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Back Button */}
      <div className="max-w-7xl mx-auto mb-8">
        <Link href="/dashboard" className="inline-flex items-center text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>

      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Simple, transparent pricing</h1>
        <p className="text-xl text-slate-600">Choose the plan that's right for your career goals</p>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Free Plan */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col">
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-slate-900 mb-2">Free Starter</h3>
            <p className="text-slate-600 mb-6">Perfect for casual job seekers</p>
            <div className="flex items-baseline">
              <span className="text-5xl font-bold text-slate-900">$0</span>
              <span className="text-slate-600 ml-2">/month</span>
            </div>
          </div>

          <ul className="space-y-4 mb-8 flex-1">
            <FeatureItem text="5 Job Matches per day" included={true} />
            <FeatureItem text="Basic Match Score" included={true} />
            <FeatureItem text="Application Tracking" included={true} />
            <FeatureItem text="AI Cover Letter Generator" included={false} />
            <FeatureItem text="Priority Email Alerts" included={false} />
            <FeatureItem text="Resume Optimization" included={false} />
          </ul>

          <Button variant="outline" className="w-full py-6 text-lg" disabled>
            Current Plan
          </Button>
        </div>

        {/* Pro Plan */}
        <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 p-8 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
            MOST POPULAR
          </div>

          <div className="mb-8">
            <h3 className="text-xl font-semibold text-white mb-2">Pro Career</h3>
            <p className="text-slate-400 mb-6">For serious job hunters who want results fast</p>
            <div className="flex items-baseline">
              <span className="text-5xl font-bold text-white">$49</span>
              <span className="text-slate-400 ml-2">/month</span>
            </div>
          </div>

          <ul className="space-y-4 mb-8 flex-1">
            <FeatureItem text="Unlimited Job Matches" included={true} dark />
            <FeatureItem text="Advanced AI Match Analysis" included={true} dark />
            <FeatureItem text="Unlimited Application Tracking" included={true} dark />
            <FeatureItem text="AI Cover Letter Generator" included={true} dark />
            <FeatureItem text="Instant Job Alerts" included={true} dark />
            <FeatureItem text="Resume Optimization" included={true} dark />
          </ul>

          <Button 
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full py-6 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 border-0 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              "Upgrade Now"
            )}
          </Button>
          <p className="text-center text-slate-500 text-sm mt-4">
            7-day money-back guarantee
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text, included, dark }: { text: string; included: boolean; dark?: boolean }) {
  return (
    <li className="flex items-center">
      {included ? (
        <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mr-3 ${dark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'}`}>
          <Check className="w-3 h-3" />
        </div>
      ) : (
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mr-3">
          <X className="w-3 h-3" />
        </div>
      )}
      <span className={dark ? 'text-slate-300' : included ? 'text-slate-700' : 'text-slate-400'}>
        {text}
      </span>
    </li>
  );
}