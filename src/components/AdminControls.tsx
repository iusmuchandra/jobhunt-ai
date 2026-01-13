// components/AdminControls.tsx
import { useState } from "react";

export function AdminControls() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const triggerSync = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sync-jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`,
        },
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-lg">
      <h3 className="text-xl font-bold mb-4">Admin Controls</h3>
      <button
        onClick={triggerSync}
        disabled={loading}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg"
      >
        {loading ? 'Syncing...' : 'Trigger Job Sync'}
      </button>
      {result && (
        <pre className="mt-4 p-4 bg-slate-100 rounded">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}