
'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getSettings } from './settings';
import type { AppSettings } from '@/types/settings';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { redirect } from 'next/navigation';
import { initializeFirebase } from '@/firebase/index.ts';
import { getAuth } from 'firebase/auth';
import { cookies } from 'next/headers';
import { getApp, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initAdmin } from './firebase-admin';

const settingsFilePath = path.join(
  process.cwd(),
  'src/lib/app-settings.json'
);

// This function IS a Server Action, meant to be called from the client.
export async function updateSettings(formData: FormData) {
  const currentSettings = await getSettings();

  const newSettings: AppSettings = {
    appName: (formData.get('appName') as string) || currentSettings.appName,
    logoUrl: formData.get('logoUrl') as string,
  };

  await fs.writeFile(settingsFilePath, JSON.stringify(newSettings, null, 2));

  // Revalidate all paths to reflect the changes immediately
  revalidatePath('/', 'layout');
}

export async function createSubscription(prevState: any, formData: FormData) {
  await initAdmin();
  const adminAuth = getAdminAuth();
  
  // Get the session cookie
  const sessionCookie = cookies().get('session')?.value;
  if (!sessionCookie) {
    return { error: 'No se encontró la sesión de usuario. Inicia sesión de nuevo.' };
  }

  let decodedIdToken;
  try {
    // Verify the session cookie to get the user's UID and email
    decodedIdToken = await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
     return { error: 'La sesión ha expirado. Por favor, inicia sesión de nuevo.' };
  }
  
  const userEmail = decodedIdToken.email;

  if (!userEmail) {
    return { error: 'El usuario no tiene un email válido para la suscripción.' };
  }

  const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
  });
  const preapproval = new PreApproval(client);

  const body = {
    preapproval_plan_id: process.env.MERCADO_PAGO_PLAN_ID!,
    reason: 'Suscripción a SIMPLESTOCK',
    back_url: 'https://www.google.com', // Placeholder URL
    payer_email: userEmail,
  };

  try {
    const result = await preapproval.create({ body });
    if (result.init_point) {
      redirect(result.init_point);
    } else {
        throw new Error('No se pudo obtener el init_point de Mercado Pago');
    }
  } catch (error) {
    console.error('Error al crear la suscripción:', error);
    return {
      error: 'Ocurrió un error al intentar crear la suscripción.',
    };
  }
}
