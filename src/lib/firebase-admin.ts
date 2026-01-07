
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';

// IMPORTANT: Do not expose this to the client-side.
const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;

let adminApp: App | null = null;

export async function initAdmin(): Promise<App> {
  if (adminApp) {
    return adminApp;
  }
  
  if (getApps().some(app => app.name === 'firebase-admin')) {
      adminApp = getApps().find(app => app.name === 'firebase-admin')!;
      return adminApp;
  }

  if (!serviceAccountString) {
    console.error(
        'FIREBASE_SERVICE_ACCOUNT environment variable is not set. ' +
        'Server-side Firebase operations will fail.'
    );
    throw new Error('Firebase Admin SDK not initialized.');
  }
  
  try {
    const serviceAccount = JSON.parse(serviceAccountString);
    adminApp = initializeApp({
      credential: cert(serviceAccount),
    }, 'firebase-admin');
    return adminApp;
  } catch (error: any) {
      console.error('Error parsing FIREBASE_SERVICE_ACCOUNT or initializing Firebase Admin:', error.message);
      throw new Error('Could not initialize Firebase Admin SDK.');
  }
}
