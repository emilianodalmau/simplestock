'use server';

import { MercadoPagoConfig, Preference } from 'mercadopago';
import { redirect } from 'next/navigation';

export async function createSubscription(prevState: any, formData: FormData) {
  // Configura el cliente de Mercado Pago con tu Access Token.
  // Es crucial que MERCADO_PAGO_ACCESS_TOKEN esté en tu archivo .env.local
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

  // Crea una nueva instancia de Preferencia
  const preference = new Preference(client);

  // Obtiene la URL base para las URLs de retorno
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:9003';

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
          success: `${baseUrl}/super-admin/payment/success`,
          failure: `${baseUrl}/super-admin/payment/failure`,
          pending: `${baseUrl}/super-admin/payment/pending`,
        },
        auto_return: 'approved',
      },
    });

    // Devuelve el resultado completo que contiene el ID de la preferencia
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