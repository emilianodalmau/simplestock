
'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getSettings } from './settings';
import type { AppSettings } from '@/types/settings';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { redirect } from 'next/navigation';

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
  // Para la prueba inicial, usamos un email de comprador de prueba de Mercado Pago.
  // Esto evita la necesidad de configurar Firebase Admin solo para obtener el email del usuario.
  // Puedes encontrar o crear usuarios de prueba en tu panel de Mercado Pago.
  const testUserEmail = 'test_user_12345678@testuser.com';

  const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
  });
  const preapproval = new PreApproval(client);

  const body = {
    preapproval_plan_id: process.env.MERCADO_PAGO_PLAN_ID!,
    reason: 'Suscripción a SIMPLESTOCK (Prueba)',
    back_url: 'https://www.google.com', // Placeholder URL
    payer_email: testUserEmail,
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
