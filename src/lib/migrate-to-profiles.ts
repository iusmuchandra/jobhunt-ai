import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, JobProfile } from './types';

/**
 * Migrate existing user preferences to a default job profile
 * Called from the dashboard on first load if user has no profiles yet
 */
export async function migrateToProfiles(userId: string, userData: UserProfile): Promise<boolean> {
  try {
    const profilesRef = collection(db, 'users', userId, 'job_profiles');
    const existing = await getDocs(profilesRef);

    if (!existing.empty) return false; // Already migrated

    // Check if they have any preferences to migrate
    if (!userData.searchKeywords?.length && !userData.excludeKeywords?.length) return false;

    const defaultProfile = {
      name: (userData.searchKeywords?.[0]) || 'My Job Search',
      emoji: '🎯',
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      jobTitles: userData.searchKeywords || [],
      keywords: userData.searchKeywords || [],
      excludeKeywords: userData.excludeKeywords || [],
      location: userData.preferredLocations?.[0] || '',
      remotePreference: 'any',
      salaryMin: 0,
      experienceLevel: userData.experience_level || '',
      jobTypes: ['Full-time'],
      industries: [],
    };

    await addDoc(profilesRef, defaultProfile);
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}

