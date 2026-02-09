// src/components/AdminControls.tsx - FIXED VERSION
'use client';

import { useState } from 'react';
import { triggerJobScraper, syncJobs } from '@/app/actions/admin-actions';

export function AdminControls() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTriggerScraper = async () => {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      // 🔒 SECURITY FIX: Use server action instead of client-side secret
      const result = await triggerJobScraper();

      if (result.success) {
        setMessage('✅ Job scraper triggered successfully!');
      } else {
        setError(result.error || 'Failed to trigger scraper');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      // 🔒 SECURITY FIX: Use server action
      const result = await syncJobs();

      if (result.success) {
        setMessage('✅ Jobs synced successfully!');
      } else {
        setError(result.error || 'Failed to sync jobs');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Admin Controls</h2>
      
      <div className="space-y-4">
        <div>
          <button
            onClick={handleTriggerScraper}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Triggering...' : 'Trigger Job Scraper'}
          </button>
        </div>

        <div>
          <button
            onClick={handleSyncJobs}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Syncing...' : 'Sync Jobs'}
          </button>
        </div>

        {message && (
          <div className="p-3 bg-green-100 text-green-800 rounded">
            {message}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-100 text-red-800 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}