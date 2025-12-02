
'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getSettings } from './settings';
import type { AppSettings } from '@/types/settings';
import { MercadoPagoConfig, Preference } from 'mercadopago';
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
  // Configura el cliente de Mercado Pago con tu Access Token.
  const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
  });

  // Crea una nueva instancia de Preferencia
  const preference = new Preference(client);

  try {
    // Crea la preferencia de pago con los datos del producto.
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
        back_urls: {
            success: 'https://www.google.com', // URL a la que volver si el pago es exitoso
        },
        auto_return: 'approved',
      },
    });

    // Si se crea el punto de inicio (la URL de pago), redirige al usuario.
    if (result.init_point) {
      redirect(result.init_point);
    } else {
      throw new Error('No se pudo obtener el init_point de Mercado Pago');
    }
  } catch (error) {
    console.error('Error al crear la preferencia de pago:', error);
    return {
      error: 'Ocurrió un error al intentar crear la preferencia de pago.',
    };
  }
}
