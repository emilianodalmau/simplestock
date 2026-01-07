
'use server';

import { MercadoPagoConfig, Preference } from 'mercadopago';

// Inicializa el cliente de Mercado Pago.
// Es crucial que el ACCESS_TOKEN se configure como una variable de entorno.
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN'
});

/**
 * Crea una preferencia de pago en Mercado Pago.
 * Esta función se ejecuta en el servidor y es segura.
 * 
 * @param planId - El identificador de tu plan (ej. 'crecimiento_mensual').
 * @param title - El título que se mostrará en el checkout (ej. 'Plan Crecimiento').
 * @param price - El precio del plan.
 * @param workspaceId - El ID del workspace para asociarlo al pago.
 * @returns El ID de la preferencia de pago generada.
 */
export async function createPreference(
    planId: string, 
    title: string, 
    price: number,
    workspaceId: string
) {
  try {
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: planId,
            title: title,
            quantity: 1,
            unit_price: price,
            currency_id: 'USD', // CORRECCIÓN: Usar USD para coincidir con los precios de los planes.
          },
        ],
        // URL a la que Mercado Pago enviará notificaciones sobre el estado del pago.
        // Esto es CRÍTICO para automatizar la activación del plan.
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
        // Metadatos para identificar el pago en el webhook.
        external_reference: workspaceId,
        // URLs a las que el usuario será redirigido.
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL}/suscripcion?status=success`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL}/suscripcion?status=failure`,
          pending: `${process.env.NEXT_PUBLIC_APP_URL}/suscripcion?status=pending`,
        },
        auto_return: 'approved', // Redirige automáticamente solo si el pago es aprobado.
      },
    });

    console.log('Preferencia de Mercado Pago creada:', result);

    // Devolvemos el ID de la preferencia. El frontend lo usará para renderizar el botón de pago.
    return { id: result.id };
  } catch (error) {
    console.error('Error al crear la preferencia de Mercado Pago:', error);
    // Devuelve un objeto con un mensaje de error claro.
    return { error: 'No se pudo generar el enlace de pago.' };
  }
}
