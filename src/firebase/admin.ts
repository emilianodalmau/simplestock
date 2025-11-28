import { App, applicationDefault, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore } from 'firebase-admin/firestore';
import type { ReadonlyHeaders } from 'next/headers';

let _app: App;
let _auth: Auth;
let _db: Firestore;

/**
 * Gets the Firebase Admin SDK App instance.
 *
 * If the app is not initialized, it will be initialized with the default
 * credential.
 *
 * @returns The Firebase Admin SDK App instance.
 */
export async function getAdminApp() {
  if (getApps().length === 0) {
    _app = initializeApp({
      credential: applicationDefault(),
    });
    _auth = getAuth(_app);
    _db = _app.firestore();
  } else {
    _app = getApp();
    _auth = getAuth(_app);
    _db = _app.firestore();
  }
  return { app: _app, auth: _auth, firestore: _db };
}

export async function getAuthenticatedUser(headers: ReadonlyHeaders) {
    const sessionCookie = headers.get('__session');
    if (!sessionCookie) {
        return null;
    }
    try {
        const { auth } = await getAdminApp();
        const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
        return decodedClaims;
    } catch (e) {
        console.error('Failed to verify session cookie', e);
        return null;
    }
}
