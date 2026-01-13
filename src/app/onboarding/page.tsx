use client;

import { useEffect } from 'react';
import { useRouter } from 'nextnavigation';
import { useAuth } from '@contextsAuthContext';
import { doc, getDoc } from 'firebasefirestore';
import { db } from '@libfirebase';

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() = {
    async function checkOnboarding() {
      if (!user) {
        router.push('authsignin');
        return;
      }

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const hasPreferences = userDoc.data().searchKeywords.length  0;

      if (hasPreferences) {
        router.push('dashboard');
      } else {
        router.push('settingspreferences');
      }
    }

    checkOnboarding();
  }, [user, router]);

  return (
    div className=flex items-center justify-center min-h-screen
      div className=animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 
    div
  );
}