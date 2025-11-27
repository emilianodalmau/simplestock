
'use server';

import { initializeApp, getApps, App, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { firebaseConfig } from '@/firebase/config';

// --- Firebase Admin SDK Initialization ---
let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp({
    credential: applicationDefault(),
    ...firebaseConfig
  });
} else {
  adminApp = getApps()[0];
}

const adminAuth = getAuth(adminApp);

interface CreateUserParams {
  email: string;
  firstName: string;
  lastName: string;
}

// Generates a random, secure password.
const generatePassword = (length = 12): string => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  let password = "";
  for (let i = 0, n = charset.length; i < n; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  return password;
};

/**
 * A Server Action to create a new user in Firebase Authentication.
 * It does NOT create the Firestore document.
 * @param params - The user data for creation.
 * @returns An object containing the generated password and user ID, or an error message.
 */
export async function createAuthUser(params: CreateUserParams): Promise<{ uid?: string; password?: string; error?: string }> {
  const { email, firstName, lastName } = params;
  const password = generatePassword();

  try {
    // 1. Create the user in Firebase Authentication only
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    // 2. Return the generated password and the new user's UID
    return { uid: userRecord.uid, password };

  } catch (error: any) {
    console.error("Error creating auth user with Admin SDK:", error);
    if (error.code === 'auth/email-already-exists') {
      return { error: 'El email proporcionado ya está en uso por otro usuario.' };
    }
    return { error: 'Ocurrió un error inesperado al crear el usuario en el sistema de autenticación.' };
  }
}
