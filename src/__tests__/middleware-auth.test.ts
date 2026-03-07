import { middleware } from '@/middleware';
import { requireAdminWithCookieStore } from '@/app/actions/admin-actions';
import { adminAuth } from '@/lib/firebase-admin';

jest.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifySessionCookie: jest.fn(),
  },
}));

describe('middleware exact-match route protection', () => {
  const buildRequest = (pathname: string, hasCookie = false): any => ({
    cookies: {
      get: jest.fn().mockReturnValue(hasCookie ? { value: 'session' } : undefined),
    },
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
  });

  it('allows exact public route /login', () => {
    const res = middleware(buildRequest('/login', false));
    expect(res.status).toBe(200);
  });

  it('redirects /login-help because it should not match /login exactly', () => {
    const res = middleware(buildRequest('/login-help', false));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?redirect=%2Flogin-help');
  });

  it('normalizes trailing slash and treats /login/ as public', () => {
    const res = middleware(buildRequest('/login/', false));
    expect(res.status).toBe(200);
  });
});

describe('requireAdmin guard', () => {
  const verifySessionCookieMock = adminAuth.verifySessionCookie as jest.Mock;

  beforeEach(() => {
    verifySessionCookieMock.mockReset();
  });

  it('throws when there is no session cookie', async () => {
    await expect(
      requireAdminWithCookieStore({ get: () => undefined })
    ).rejects.toThrow('Not authenticated');
  });

  it('throws when session is valid but user is not admin', async () => {
    verifySessionCookieMock.mockResolvedValue({ uid: 'u1', admin: false });

    await expect(
      requireAdminWithCookieStore({ get: () => ({ value: 'cookie' }) })
    ).rejects.toThrow('Not authorized');
  });

  it('returns claims when admin flag is present', async () => {
    verifySessionCookieMock.mockResolvedValue({ uid: 'admin', admin: true });

    await expect(
      requireAdminWithCookieStore({ get: () => ({ value: 'cookie' }) })
    ).resolves.toMatchObject({ uid: 'admin', admin: true });
  });
});
