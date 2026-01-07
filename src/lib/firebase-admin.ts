
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';

// IMPORTANT: Do not expose this to the client-side.
const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;

let adminApp: App | null = null;

export async function initAdmin(): Promise<App> {
  // If the app is already initialized, return it.
  const existingApp = getApps().find(app => app.name === 'firebase-admin');
  if (existingApp) {
    return existingApp;
  }
  
  if (!serviceAccountString) {
    console.error(
        'FIREBASE_SERVICE_ACCOUNT environment variable is not set. ' +
        'Server-side Firebase operations will fail.'
    );
    throw new Error('Firebase Admin SDK not initialized: Service account credentials not found.');
  }
  
  try {
    const serviceAccount = JSON.parse(serviceAccountString);
    // Initialize with a specific name to avoid conflicts
    adminApp = initializeApp({
      credential: cert(serviceAccount),
    }, 'firebase-admin');
    return adminApp;
  } catch (error: any) {
      console.error('Error parsing FIREBASE_SERVICE_ACCOUNT or initializing Firebase Admin:', error.message);
      throw new Error('Could not initialize Firebase Admin SDK.');
  }
}
