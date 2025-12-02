
'use server';

import { MercadoPagoConfig, Preference } from 'mercadopago';
import { redirect } from 'next/navigation';

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
          failure: 'https://simplestock-two.vercel.app/', // URL de fallo
          pending: 'https://simplestock-two.vercel.app/', // URL de pago pendiente
        },
        auto_return: 'approved',
      },
    });

    // Si se crea el punto de inicio (la URL de pago), redirige al usuario.
    if (result.id) {
      redirect(result.init_point!);
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
