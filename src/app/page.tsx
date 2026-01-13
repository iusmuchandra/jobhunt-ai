import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { 
  Sparkles, 
  Rocket, 
  TrendingUp, 
  Zap, 
  ArrowRight,
  Target,
  Brain,
  Clock,
  Shield,
  Users,
  BarChart3,
  Check,
  Star,
  Briefcase,
  MessageSquare,
  FileText,
  Award
} from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white overflow-hidden">
      {/* Animated gradient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-500/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-pink-500/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Floating badge */}
          <div className="flex justify-center mb-8 animate-fade-in">
            <div className="group inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all cursor-pointer hover:scale-105">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm font-medium">10,000+ jobs added this week</span>
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
          </div>

          {/* Main heading */}
          <h1 className="text-6xl md:text-8xl font-black text-center mb-6 leading-tight animate-fade-in-up">
            <span className="bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent">
              Your AI-Powered
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient">
              Dream Job Finder
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-400 text-center max-w-3xl mx-auto mb-12 animate-fade-in-up animation-delay-200">
            Stop the endless scrolling. Let AI match you with perfect opportunities at top tech companies. 
            <span className="text-white font-semibold"> 3x faster than traditional job boards.</span>
          </p>

          {/* CTA Buttons - FIXED LINKS */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20 animate-fade-in-up animation-delay-400">
            {/* Link points to Sign Up now */}
            <Link href="/auth/signup">
              <Button size="lg" className="group relative px-8 py-7 text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-2xl shadow-2xl shadow-purple-500/50 hover:shadow-purple-500/70 transition-all duration-300 hover:scale-105">
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
            
            {/* Link added to this button too */}
            <Link href="/auth/signup">
              <Button size="lg" variant="outline" className="px-8 py-7 text-lg font-semibold bg-white/5 backdrop-blur-xl border-2 border-white/10 hover:bg-white/10 hover:border-white/20 rounded-2xl transition-all duration-300 hover:scale-105">
                See How It Works
              </Button>
            </Link>
          </div>

          {/* Social proof */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-gray-400 animate-fade-in animation-delay-600">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 border-2 border-black" />
                ))}
              </div>
              <span>50,000+ job seekers</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex text-yellow-400">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <span>4.9/5 rating</span>
            </div>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-purple-400" />
              <span>Product of the Day on ProductHunt</span>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="relative py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Large feature card */}
            <div className="lg:col-span-2 lg:row-span-2 group relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-xl border border-white/10 hover:border-white/20 p-8 transition-all duration-500 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 via-purple-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-6">
                  <Brain className="w-8 h-8" />
                </div>
                <h3 className="text-3xl font-bold mb-4">AI-Powered Matching</h3>
                <p className="text-gray-400 text-lg mb-6">
                  Our advanced AI analyzes thousands of job postings and matches you with opportunities that perfectly align with your skills, experience, and career goals.
                </p>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span>98% accuracy</span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span>Instant results</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Smaller feature cards */}
            <FeatureCard
              icon={<Clock className="w-6 h-6" />}
              title="Save 10+ Hours/Week"
              description="Automate repetitive tasks and focus on interview prep"
              gradient="from-pink-500/10 to-orange-500/10"
            />

            <FeatureCard
              icon={<Target className="w-6 h-6" />}
              title="Smart Tracking"
              description="Organize all applications with automated status updates"
              gradient="from-purple-500/10 to-pink-500/10"
            />

            <FeatureCard
              icon={<MessageSquare className="w-6 h-6" />}
              title="AI Cover Letters"
              description="Generate personalized cover letters in seconds"
              gradient="from-blue-500/10 to-cyan-500/10"
            />

            <FeatureCard
              icon={<FileText className="w-6 h-6" />}
              title="Resume Optimizer"
              description="Get AI feedback to improve your resume"
              gradient="from-green-500/10 to-emerald-500/10"
            />

            <FeatureCard
              icon={<BarChart3 className="w-6 h-6" />}
              title="Analytics Dashboard"
              description="Track your progress with detailed insights"
              gradient="from-orange-500/10 to-red-500/10"
            />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="relative rounded-3xl bg-gradient-to-br from-blue-600 to-purple-600 p-12 overflow-hidden">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
            <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-8">
              <StatCard number="500+" label="Top Companies" sublabel="Google, Meta, Apple..." />
              <StatCard number="10k+" label="Active Jobs" sublabel="Updated daily" />
              <StatCard number="98%" label="Match Accuracy" sublabel="AI-powered" />
              <StatCard number="3x" label="Faster Hiring" sublabel="vs. traditional" />
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Land your dream job
              </span>
              {' '}in 3 simple steps
            </h2>
            <p className="text-xl text-gray-400">It's easier than you think</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StepCard
              number="01"
              title="Create Your Profile"
              description="Tell us about your skills, experience, and what you're looking for in your next role."
              icon={<Users className="w-8 h-8" />}
            />
            <StepCard
              number="02"
              title="Get Matched with Jobs"
              description="Our AI scans thousands of opportunities and surfaces the perfect matches for you."
              icon={<Sparkles className="w-8 h-8" />}
            />
            <StepCard
              number="03"
              title="Apply with Confidence"
              description="Use AI-generated cover letters and get interview prep to land the job."
              icon={<Rocket className="w-8 h-8" />}
            />
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="relative py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-5xl font-bold text-center mb-16">
            Everything you need to{' '}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              succeed
            </span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <BenefitCard
              icon={<Shield className="w-6 h-6" />}
              title="Privacy First"
              description="Your data is encrypted and never shared. We respect your privacy."
              features={["End-to-end encryption", "GDPR compliant", "No data selling"]}
            />
            <BenefitCard
              icon={<Zap className="w-6 h-6" />}
              title="Lightning Fast"
              description="Get matched with jobs in seconds, not hours."
              features={["Real-time updates", "Instant notifications", "Fast application"]}
            />
            <BenefitCard
              icon={<Target className="w-6 h-6" />}
              title="Hyper-Targeted"
              description="Only see jobs that truly match your profile."
              features={["AI matching", "Smart filters", "Relevance score"]}
            />
            <BenefitCard
              icon={<Brain className="w-6 h-6" />}
              title="AI Assistant"
              description="Get help at every step of your job search."
              features={["Cover letters", "Resume tips", "Interview prep"]}
            />
            <BenefitCard
              icon={<BarChart3 className="w-6 h-6" />}
              title="Track Progress"
              description="See your job search journey visualized."
              features={["Analytics", "Success metrics", "Timeline view"]}
            />
            <BenefitCard
              icon={<Users className="w-6 h-6" />}
              title="Expert Support"
              description="Access to career coaches and industry experts."
              features={["1-on-1 coaching", "Resume reviews", "Mock interviews"]}
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative rounded-3xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-xl border border-white/10 p-12 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 animate-gradient" />
            
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-8">
                <Sparkles className="w-10 h-10" />
              </div>
              
              <h2 className="text-5xl font-bold mb-6">
                Ready to land your dream job?
              </h2>
              
              <p className="text-xl text-gray-400 mb-8">
                Join 50,000+ professionals who've found their perfect role with JobHunt AI
              </p>
              
              {/* FIXED LINK - Points to Sign Up */}
              <Link href="/auth/signup">
                <Button size="lg" className="px-12 py-7 text-lg font-semibold bg-white text-black hover:bg-gray-100 rounded-2xl shadow-2xl hover:scale-105 transition-all duration-300">
                  Start Free Trial
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              
              <p className="text-sm text-gray-500 mt-6">
                No credit card required • Free forever plan • Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ icon, title, description, gradient }: { icon: React.ReactNode; title: string; description: string; gradient: string }) {
  return (
    <div className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} backdrop-blur-xl border border-white/10 hover:border-white/20 p-8 transition-all duration-500 hover:scale-105 cursor-pointer`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 mb-4 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
    </div>
  );
}

function StatCard({ number, label, sublabel }: { number: string; label: string; sublabel: string }) {
  return (
    <div className="text-center group cursor-pointer">
      <div className="text-5xl md:text-6xl font-black mb-2 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent group-hover:scale-110 transition-transform">
        {number}
      </div>
      <div className="text-lg font-semibold text-white/90">{label}</div>
      <div className="text-sm text-white/60">{sublabel}</div>
    </div>
  );
}

function StepCard({ number, title, description, icon }: { number: string; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="group relative">
      <div className="relative rounded-3xl bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-xl border border-white/10 hover:border-white/20 p-8 transition-all duration-500 hover:scale-105">
        <div className="text-6xl font-black text-white/10 mb-4 group-hover:text-white/20 transition-colors">
          {number}
        </div>
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-6">
          {icon}
        </div>
        <h3 className="text-2xl font-bold mb-4">{title}</h3>
        <p className="text-gray-400">{description}</p>
      </div>
    </div>
  );
}

function BenefitCard({ icon, title, description, features }: { icon: React.ReactNode; title: string; description: string; features: string[] }) {
  return (
    <div className="group relative rounded-3xl bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-xl border border-white/10 hover:border-white/20 p-8 transition-all duration-500 hover:scale-105">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-gray-400 mb-6 text-sm">{description}</p>
      <ul className="space-y-2">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-center gap-2 text-sm text-gray-400">
            <Check className="w-4 h-4 text-green-400" />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}