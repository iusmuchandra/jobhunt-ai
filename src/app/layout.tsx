import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { Navigation } from '@/components/Navigation';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'JobHunt AI - AI-Powered Job Search for Tech Professionals',
  description: 'Find your dream tech job with AI-powered matching, instant alerts, and personalized application assistance. Track 500+ top companies.',
  keywords: [
    'tech jobs',
    'job search',
    'AI job matching',
    'software engineer jobs',
    'machine learning jobs',
    'startup jobs',
    'remote jobs',
    'tech careers'
  ].join(', '),
  authors: [{ name: 'JobHunt AI' }],
  openGraph: {
    title: 'JobHunt AI - AI-Powered Job Search',
    description: 'Find your dream tech job with AI-powered matching and instant alerts',
    url: 'https://jobhunt.ai',
    siteName: 'JobHunt AI',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'JobHunt AI Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JobHunt AI - AI-Powered Job Search',
    description: 'Find your dream tech job with AI-powered matching',
    images: ['/og-image.png'],
    creator: '@jobhuntai',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className={inter.className}>
        {/* AuthProvider must wrap the entire application to share user state */}
        <AuthProvider>
          <div className="min-h-screen">
            <Navigation />
            <main>
              {children}
            </main>
          </div>
          <Toaster />
        </AuthProvider>

        {/* Analytics - Only loaded in production */}
        {process.env.NODE_ENV === 'production' && (
          <script
            defer
            data-domain="jobhunt.ai"
            src="https://plausible.io/js/script.js"
          />
        )}
      </body>
    </html>
  );
}