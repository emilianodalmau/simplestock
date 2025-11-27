
'use server';

import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// --- Firebase Admin SDK Initialization ---
// This pattern ensures the Admin SDK is initialized only once per server instance.
let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp();
} else {
  adminApp = getApps()[0];
}

const adminAuth = getAuth(adminApp);
const adminFirestore = getFirestore(adminApp);

interface CreateUserParams {
  email: string;
  firstName: string;
  lastName: string;
  workspaceId: string;
  phone?: string;
  address?: string;
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
 * A Server Action to create a new user with the 'solicitante' role.
 * This function runs securely on the server.
 * @param params - The user data for creation.
 * @returns An object containing the generated password or an error message.
 */
export async function createUser(params: CreateUserParams): Promise<{ password?: string; error?: string }> {
  const { email, firstName, lastName, workspaceId, phone, address } = params;
  const password = generatePassword();

  try {
    // 1. Create the user in Firebase Authentication
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    // 2. Create the user document in Firestore
    const userDocRef = adminFirestore.collection('users').doc(userRecord.uid);
    await userDocRef.set({
      id: userRecord.uid,
      email,
      firstName,
      lastName,
      phone: phone || '',
      address: address || '',
      role: 'solicitante', // Assign the specific role
      workspaceId,
      createdAt: new Date().toISOString(),
    });

    // 3. Return the generated password
    return { password };

  } catch (error: any) {
    console.error("Error creating user with Admin SDK:", error);
    // Provide a more user-friendly error message
    if (error.code === 'auth/email-already-exists') {
      return { error: 'El email proporcionado ya está en uso por otro usuario.' };
    }
    return { error: 'Ocurrió un error inesperado al crear el usuario.' };
  }
}
