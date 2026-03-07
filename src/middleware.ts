import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/pricing', '/api/stripe/webhook'];

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME);
  const pathname = normalizePath(request.nextUrl.pathname);

  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const isNextInternal = pathname.startsWith('/_next') || pathname.startsWith('/favicon');

  if (!token && !isPublic && !isNextInternal) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
