
'use server';

import { MercadoPagoConfig, Preference } from 'mercadopago';
import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';

const settingsFilePath = path.join(
  process.cwd(),
  'src/lib/app-settings.json'
);


// This is the missing Server Action
export async function updateSettings(formData: FormData) {
  try {
    const newSettings = {
      appName: formData.get('appName') as string,
      logoUrl: formData.get('logoUrl') as string,
    };
    
    await fs.writeFile(settingsFilePath, JSON.stringify(newSettings, null, 2), 'utf-8');

    // Revalidate the path to ensure the new settings are picked up on next page load
    revalidatePath('/', 'layout');

    return { success: true, message: 'Settings updated successfully.' };
  } catch (error) {
    console.error('Failed to update settings:', error);
    return { success: false, message: 'Failed to update settings.' };
  }
}


export async function createSubscription(prevState: any, formData: FormData) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return {
        error: 'El Access Token de Mercado Pago no está configurado en el servidor.',
        preferenceId: null,
    }
  }

  const client = new MercadoPagoConfig({
    accessToken: accessToken,
  });

  const preference = new Preference(client);
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:9003';

  try {
    const result = await preference.create({
      body: {
        items: [
          {
            title: 'Suscripción de prueba SIMPLESTOCK',
            quantity: 1,
            unit_price: 2000,
            currency_id: 'ARS',
          },
        ],
        // Usamos el usuario de prueba específico del cliente
        payer: {
          email: 'TESTUSER407212@testuser.com',
        },
        back_urls: {
          success: `${baseUrl}/super-admin/payment/success`,
          failure: `${baseUrl}/super-admin/payment/failure`,
          pending: `${baseUrl}/super-admin/payment/pending`,
        },
        auto_return: 'approved',
      },
    });

    return {
      error: null,
      preferenceId: result.id,
    };

  } catch (error) {
    console.error('Error al crear la preferencia de pago:', error);
    return {
      error: 'Ocurrió un error al intentar crear la preferencia de pago.',
      preferenceId: null,
    };
  }
}
