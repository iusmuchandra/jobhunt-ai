import { NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// GET /api/profiles - Get all profiles for the authenticated user
export async function GET(request: Request) {
  try {
    const uid = await verifyAuthToken(request);
    if (!uid) return unauthorizedResponse();

    // Fetch all profiles for the user
    const profilesSnapshot = await adminDb
      .collection('users')
      .doc(uid)
      .collection('job_profiles')
      .orderBy('createdAt', 'desc')
      .get();

    const profiles = profilesSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ profiles });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profiles' },
      { status: 500 }
    );
  }
}

// POST /api/profiles - Create a new profile
export async function POST(request: Request) {
  try {
    const uid = await verifyAuthToken(request);
    if (!uid) return unauthorizedResponse();

    const body = await request.json();
    const {
      name,
      emoji,
      isActive = true,
      jobTitles,
      keywords,
      excludeKeywords,
      location,
      remotePreference,
      salaryMin,
      experienceLevel,
      jobTypes,
      industries
    } = body;

    // Validate required fields
    if (!name || !emoji) {
      return NextResponse.json(
        { error: 'Name and emoji are required' },
        { status: 400 }
      );
    }

    // Fetch user data to check tier
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data();

    // Check profile limit for free users
    const isPro = userData.tier === 'pro' || userData.tier === 'premium' || userData.tier === 'enterprise';
    const profileLimit = isPro ? Infinity : 3;

    const existingProfilesSnapshot = await adminDb
      .collection('users')
      .doc(uid)
      .collection('job_profiles')
      .get();

    if (existingProfilesSnapshot.size >= profileLimit) {
      return NextResponse.json(
        { error: 'Profile limit reached. Upgrade to Pro for unlimited profiles.' },
        { status: 403 }
      );
    }

    // Create new profile document
    const profileData = {
      name,
      emoji,
      isActive,
      jobTitles: jobTitles || [],
      keywords: keywords || [],
      excludeKeywords: excludeKeywords || [],
      location: location || '',
      remotePreference: remotePreference || 'any',
      salaryMin: salaryMin || 0,
      experienceLevel: experienceLevel || '',
      jobTypes: jobTypes || [],
      industries: industries || [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const profileRef = await adminDb
      .collection('users')
      .doc(uid)
      .collection('job_profiles')
      .add(profileData);

    return NextResponse.json({
      id: profileRef.id,
      ...profileData
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating profile:', error);
    return NextResponse.json(
      { error: 'Failed to create profile' },
      { status: 500 }
    );
  }
}

// PUT /api/profiles - Update an existing profile
export async function PUT(request: Request) {
  try {
    const uid = await verifyAuthToken(request);
    if (!uid) return unauthorizedResponse();

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Profile ID is required' },
        { status: 400 }
      );
    }

    // Check if profile exists and belongs to user
    const profileRef = adminDb
      .collection('users')
      .doc(uid)
      .collection('job_profiles')
      .doc(id);

    const profileDoc = await profileRef.get();
    if (!profileDoc.exists()) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Update profile with timestamp
    const updateData = {
      ...updates,
      updatedAt: Timestamp.now()
    };

    await profileRef.update(updateData);

    return NextResponse.json({
      id,
      ...updateData
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

// DELETE /api/profiles - Delete a profile and its matches
export async function DELETE(request: Request) {
  try {
    const uid = await verifyAuthToken(request);
    if (!uid) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Profile ID is required' },
        { status: 400 }
      );
    }

    // Check if profile exists and belongs to user
    const profileRef = adminDb
      .collection('users')
      .doc(uid)
      .collection('job_profiles')
      .doc(id);

    const profileDoc = await profileRef.get();
    if (!profileDoc.exists()) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Delete all matches associated with this profile
    const matchesSnapshot = await adminDb
      .collection('user_job_matches')
      .where('userId', '==', uid)
      .where('profileId', '==', id)
      .get();

    const batch = adminDb.batch();
    matchesSnapshot.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
    });

    // Delete the profile itself
    batch.delete(profileRef);

    await batch.commit();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting profile:', error);
    return NextResponse.json(
      { error: 'Failed to delete profile' },
      { status: 500 }
    );
  }
}