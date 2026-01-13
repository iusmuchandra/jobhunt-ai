'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import AuthPages from '@/components/auth_ui';

export default function SignUpPage() {
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Local state for the signup form
  const [formData, setFormData] = useState({
    name: '', // Required for signup to set the display name
    email: '',
    password: '',
  });

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');
    
    // Simple front-end validation
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      // AuthContext handles updateProfile and Firestore doc creation
      await signUp(formData.email, formData.password, formData.name);
      
      setSuccess('Account created! Redirecting to preferences setup...');
      // Redirect to preferences setup after a short delay
      setTimeout(() => router.push('/settings/preferences'), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      setSuccess('Signed in with Google! Redirecting...');
      setTimeout(() => router.push('/dashboard'), 1000);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPages 
      mode="signup"
      loading={loading}
      error={error}
      success={success}
      formData={formData}
      setFormData={setFormData}
      onSubmit={handleSubmit}
      onGoogleSignIn={handleGoogleSignIn}
    />
  );
}