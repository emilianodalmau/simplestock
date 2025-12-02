
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';

// IMPORTANT: Do not expose this to the client-side.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : null;

export async function initAdmin(): Promise<App> {
  if (getApps().length) {
    return getApps()[0];
  }
  if (!serviceAccount) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT environment variable is not set.'
    );
  }
  return initializeApp({
    credential: cert(serviceAccount),
  });
}
