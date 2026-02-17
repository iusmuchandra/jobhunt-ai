import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/pricing', '/api/stripe/webhook'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('__session');
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));
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