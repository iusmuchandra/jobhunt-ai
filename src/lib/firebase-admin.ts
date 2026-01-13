import { initializeApp, getApps, cert, ServiceAccount, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// 1. Setup Service Account with Fallbacks
// We check for the specific ADMIN ID, but fall back to the public one if missing.
const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// 2. Safe Initialization
// We only try to initialize if we actually have the keys. 
// This prevents build-time crashes when secrets aren't available.
let adminApp;

if (!getApps().length) {
  if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
    try {
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } catch (error) {
      console.error('Firebase Admin initialization error:', error);
    }
  } else {
    console.warn('Firebase Admin: Missing service account credentials. Skipping initialization.');
  }
} else {
  adminApp = getApp();
}

// 3. Export Services safely
// If init failed, these might be undefined, but it prevents the build from crashing immediately.
export const adminDb = adminApp ? getFirestore(adminApp) : {} as any;
export const adminAuth = adminApp ? getAuth(adminApp) : {} as any;
export const adminStorage = adminApp ? getStorage(adminApp) : {} as any;

export default adminApp;

// Helper functions (Safe wrappers)
export async function getUserByEmail(email: string) {
  if (!adminAuth.getUserByEmail) return null;
  try {
    return await adminAuth.getUserByEmail(email);
  } catch (error) {
    console.error('Error fetching user by email:', error);
    return null;
  }
}

export async function setCustomUserClaims(uid: string, claims: object) {
  if (!adminAuth.setCustomUserClaims) return false;
  try {
    await adminAuth.setCustomUserClaims(uid, claims);
    return true;
  } catch (error) {
    console.error('Error setting custom claims:', error);
    return false;
  }
}

export async function deleteUser(uid: string) {
  if (!adminAuth.deleteUser) return false;
  try {
    await adminAuth.deleteUser(uid);
    // Also delete user data
    await adminDb.collection('users').doc(uid).delete();
    return true;
  } catch (error) {
    console.error('Error deleting user:', error);
    return false;
  }
}