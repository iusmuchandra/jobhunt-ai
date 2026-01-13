'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Briefcase,
  Sparkles,
  Settings,
  LogOut,
  User,
  CreditCard,
  Home
} from 'lucide-react';

export function Navigation() {
  const { user, userProfile, signOut } = useAuth();
  const pathname = usePathname();

  const isPublicRoute = ['/', '/login', '/signup', '/pricing'].includes(pathname);
  const isHomePage = pathname === '/';

  if (isPublicRoute && !user) {
    return (
      <nav className={`sticky top-0 z-50 ${isHomePage ? 'bg-black/50 border-b border-white/10' : 'bg-white/50 border-b'} backdrop-blur-xl`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Sparkles className={`h-8 w-8 ${isHomePage ? 'text-purple-400' : 'text-blue-600'}`} />
              <span className={`text-2xl font-bold ${isHomePage ? 'text-white' : 'bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent'}`}>
                JobHunt AI
              </span>
            </Link>

            <div className="flex items-center gap-4">
              <Link href="/pricing">
                <Button variant="ghost" className={isHomePage ? 'text-white hover:bg-white/10' : ''}>
                  Pricing
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" className={isHomePage ? 'text-white hover:bg-white/10' : ''}>
                  Log In
                </Button>
              </Link>
              <Link href="/signup">
                <Button className={isHomePage ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500' : ''}>
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  if (!user) return null;

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Jobs', href: '/jobs', icon: Briefcase },
    { name: 'AI Assistant', href: '/assistant', icon: Sparkles },
  ];

  return (
    <nav className="border-b bg-white/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                JobHunt AI
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link key={item.name} href={item.href}>
                    <Button
                      variant={isActive ? 'secondary' : 'ghost'}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {userProfile?.tier === 'free' && (
              <Link href="/pricing">
                <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600">
                  Upgrade to Pro
                </Button>
              </Link>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || ''} />
                    <AvatarFallback className="bg-blue-100 text-blue-600">
                      {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.displayName || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    <p className="text-xs text-blue-600 font-medium uppercase">
                      {userProfile?.tier || 'Free'} Plan
                    </p>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <Link href="/dashboard">
                  <DropdownMenuItem className="cursor-pointer">
                    <Home className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                </Link>

                <Link href="/settings">
                  <DropdownMenuItem className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                </Link>

                <Link href="/settings/billing">
                  <DropdownMenuItem className="cursor-pointer">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Billing
                  </DropdownMenuItem>
                </Link>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:text-red-600"
                  onClick={() => signOut()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}