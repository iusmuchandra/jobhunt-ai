import { adminAuth } from '@/lib/firebase-admin';

export async function verifyAuthToken(request: Request): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenResponse() {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}