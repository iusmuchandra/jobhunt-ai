import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle, Clock, ExternalLink } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ApplicationStatusTrackerProps {
  applicationId: string;
  onComplete?: (finalStatus: string) => void;
  showDetails?: boolean;
}

interface ApplicationStatus {
  status: 'queued' | 'processing' | 'review_required' | 'applied' | 'failed' | 'cancelled';
  progress: number;
  progressMessage: string;
  lastUpdated: Date;
  details?: string;
  applicationUrl?: string;
}

const ApplicationStatusTracker: React.FC<ApplicationStatusTrackerProps> = ({ 
  applicationId, 
  onComplete,
  showDetails = true
}) => {
  const [status, setStatus] = useState<ApplicationStatus>({
    status: 'queued',
    progress: 0,
    progressMessage: 'Application queued...',
    lastUpdated: new Date()
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) {
      setIsLoading(false);
      setError('No application ID provided');
      return;
    }

    setIsLoading(true);

    // Real-time listener to Firestore
    const unsubscribe = onSnapshot(
      doc(db, 'applications', applicationId),
      (docSnapshot) => {
        setIsLoading(false);
        
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          
          // Map Firestore data to local state
          const newStatus = data.status || 'queued';
          
          setStatus({
            status: newStatus,
            progress: data.progress || 0,
            progressMessage: data.progressMessage || 'Processing...',
            lastUpdated: data.lastUpdated?.toDate() || new Date(),
            details: data.notes || data.details, // Flexible mapping
            applicationUrl: data.jobUrl // Or data.applicationUrl if you save it specifically
          });

          // Trigger completion callback if finished
          if (newStatus === 'applied' || newStatus === 'failed') {
             // Small delay to allow the user to see the 100% state
             setTimeout(() => {
                onComplete?.(newStatus);
             }, 2000);
          }
        } else {
          setError('Application record not found');
        }
      },
      (err) => {
        console.error("Error fetching application status:", err);
        setError('Failed to sync with application service');
        setIsLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, [applicationId, onComplete]);

  const getStatusIcon = () => {
    switch (status.status) {
      case 'processing':
        return <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />;
      case 'review_required':
        return <AlertCircle className="w-8 h-8 text-amber-600 animate-pulse" />;
      case 'applied':
        return <CheckCircle className="w-8 h-8 text-green-600" />;
      case 'failed':
        return <XCircle className="w-8 h-8 text-red-600" />;
      case 'cancelled':
        return <XCircle className="w-8 h-8 text-gray-400" />;
      default:
        return <Clock className="w-8 h-8 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case 'processing':
        return 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200';
      case 'review_required':
        return 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200';
      case 'applied':
        return 'bg-gradient-to-r from-green-50 to-emerald-100 border-green-200';
      case 'failed':
        return 'bg-gradient-to-r from-red-50 to-red-100 border-red-200';
      case 'cancelled':
        return 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200';
      default:
        return 'bg-gradient-to-r from-gray-50 to-blue-50 border-gray-200';
    }
  };

  const getStatusTitle = () => {
    switch (status.status) {
      case 'processing':
        return 'Auto-Apply in Progress';
      case 'review_required':
        return 'Manual Review Required';
      case 'applied':
        return 'Application Submitted!';
      case 'failed':
        return 'Application Failed';
      case 'cancelled':
        return 'Application Cancelled';
      default:
        return 'Queued for Processing';
    }
  };

  const getEstimatedTime = () => {
    if (status.status === 'applied') return 'Completed';
    if (status.status === 'failed' || status.status === 'cancelled') return 'N/A';
    
    // Simple estimation logic based on progress
    const remaining = 100 - status.progress;
    const estimatedMinutes = Math.ceil(remaining / 20); // Rough estimate (5 mins total)
    return estimatedMinutes < 1 ? '< 1 min remaining' : `~${estimatedMinutes} min remaining`;
  };

  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-gray-50 to-blue-50 border-2 border-gray-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <div>
            <p className="text-lg font-semibold text-gray-900">Connecting to application service...</p>
            <p className="text-sm text-gray-600">Syncing status</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <XCircle className="w-8 h-8 text-red-600" />
          <div>
            <p className="text-lg font-semibold text-red-900">Error Loading Application</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`border-2 rounded-2xl p-8 shadow-lg transition-all duration-300 ${getStatusColor()}`}>
      <div className="flex flex-col md:flex-row items-start gap-6">
        <div className="flex-shrink-0">
          <div className="relative">
            {getStatusIcon()}
            {status.status === 'processing' && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full animate-ping" />
            )}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {getStatusTitle()}
              </h3>
              
              <p className="text-gray-700 text-lg font-medium mb-1">
                {status.progressMessage}
              </p>
              
              {status.details && showDetails && (
                <p className="text-gray-600 text-sm">
                  {status.details}
                </p>
              )}
            </div>
            
            <div className="text-right">
              <div className="text-sm font-medium text-gray-500 mb-1">Estimated Time</div>
              <div className="text-lg font-bold text-gray-900">{getEstimatedTime()}</div>
            </div>
          </div>
          
          {/* Progress Bar */}
          {(status.status === 'processing' || status.status === 'queued') && (
            <div className="mb-8">
              <div className="flex items-center justify-between text-sm font-medium text-gray-700 mb-3">
                <span>Auto-Apply Progress</span>
                <span className="font-bold text-blue-700">{Math.round(status.progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-500 ease-out rounded-full relative"
                  style={{ width: `${status.progress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>Queued</span>
                <span>Processing</span>
                <span>Review</span>
                <span>Complete</span>
              </div>
            </div>
          )}
          
          {/* Status-specific content */}
          <div className="space-y-4">
            {status.status === 'review_required' && (
              <div className="bg-gradient-to-r from-amber-100 to-amber-50 border border-amber-300 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-900 mb-2">Manual Review Required</h4>
                    <p className="text-amber-800 text-sm mb-3">
                      Your application has been prepared but requires your review before submission. 
                      Please check the automation window to verify details and submit manually.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {status.status === 'applied' && (
              <div className="bg-gradient-to-r from-green-100 to-emerald-50 border border-green-300 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-900 mb-2">Application Submitted Successfully!</h4>
                    <p className="text-green-800 text-sm mb-3">
                      Your application has been submitted to {status.applicationUrl ? 'the company portal' : 'the employer'}. 
                      You should receive a confirmation email shortly.
                    </p>
                    {status.applicationUrl && (
                      <button 
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                        onClick={() => window.open(status.applicationUrl, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Application Status
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {status.status === 'failed' && (
              <div className="bg-gradient-to-r from-red-100 to-red-50 border border-red-300 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-900 mb-2">Application Failed</h4>
                    <p className="text-red-800 text-sm mb-3">
                      {status.details || 'There was an error submitting your application.'}
                    </p>
                    <div className="flex gap-3">
                      <button 
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                        onClick={() => window.location.reload()}
                      >
                        Try Again
                      </button>
                      <button 
                        className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
                        onClick={() => onComplete?.('failed')}
                      >
                        Apply Manually
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Timeline / Last Updated */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Last updated: {status.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="font-medium">
                ID: <span className="font-mono text-gray-700">{applicationId.slice(0, 8)}...</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* CSS for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default ApplicationStatusTracker;