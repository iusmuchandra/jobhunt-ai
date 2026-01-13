"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { CreditCard, Clock, Shield, ArrowLeft, Loader2, Sparkles, CheckCircle } from 'lucide-react';

export default function BillingPage() {
  const [loading, setLoading] = useState(false);

  const handleManageSubscription = async () => {
    setLoading(true);
    // Simulate opening Stripe Customer Portal
    await new Promise(resolve => setTimeout(resolve, 1500));
    alert("This would open the Stripe Customer Portal to update card/cancel plan.");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* --- Background Gradients --- */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-green-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
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
          <h1 className="text-4xl font-black tracking-tight mb-2">
            <span className="bg-gradient-to-r from-white via-green-200 to-blue-200 bg-clip-text text-transparent">
              Billing & Subscription
            </span>
          </h1>
          <p className="text-gray-400 text-lg">Manage your plan, payment methods, and billing history.</p>
        </div>

        {/* Current Plan Card */}
        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur-xl opacity-50" />
          <div className="relative bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-6 md:p-8">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-white">Current Plan</h2>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                    Active
                  </span>
                </div>
                <p className="text-gray-400">Renews on Feb 3, 2026</p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-4xl font-black text-white">$0</span>
                  <span className="text-gray-500 font-medium">/month</span>
                </div>
              </div>
            </div>

            {/* Plan Details Box */}
            <div className="bg-gray-800/50 rounded-2xl p-6 mb-8 border border-gray-700/50">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl">
                  <Shield className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Free Starter</h3>
                  <p className="text-gray-400 leading-relaxed">
                    You are currently on the free plan. Upgrade to Pro to unlock unlimited job matches, AI cover letters, and priority support.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/pricing" className="flex-1">
                <button className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl font-bold text-white shadow-lg hover:shadow-blue-500/25 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Upgrade Plan
                </button>
              </Link>
              <button 
                onClick={handleManageSubscription}
                disabled={loading}
                className="flex-1 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl font-bold text-gray-300 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Manage Subscription"}
              </button>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-gray-900/40 backdrop-blur-xl border border-gray-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <CreditCard className="w-6 h-6 text-purple-400" />
              Payment Method
            </h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between p-4 bg-gray-800/30 border border-gray-700 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="w-14 h-10 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
                  <span className="text-xs font-bold text-gray-500">CARD</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">No payment method added</p>
                  <p className="text-xs text-gray-500">Add a card to upgrade your plan</p>
                </div>
              </div>
              <button className="text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors">
                Add Card
              </button>
            </div>
          </div>
        </div>

        {/* Billing History */}
        <div className="bg-gray-900/40 backdrop-blur-xl border border-gray-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <Clock className="w-6 h-6 text-green-400" />
              Billing History
            </h2>
          </div>
          <div className="divide-y divide-gray-800">
            {/* Empty State */}
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-gray-600" />
              </div>
              <p className="text-gray-500 font-medium">No invoices available yet.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}