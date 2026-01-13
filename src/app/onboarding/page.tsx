"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    async function checkOnboarding() {
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        
        // Check if user has completed preferences (example check)
        const hasPreferences = userData?.searchKeywords && userData.searchKeywords.length > 0;

        if (hasPreferences) {
          router.push('/dashboard');
        } else {
          router.push('/settings/preferences');
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        // Fallback to dashboard if error
        router.push('/dashboard');
      }
    }

    checkOnboarding();
  }, [user, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
    </div>
  );
}