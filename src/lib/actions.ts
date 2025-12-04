'use server';

import { MercadoPagoConfig, Preference } from 'mercadopago';

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
