
'use server';

import { MercadoPagoConfig, Preference } from 'mercadopago';
import { initAdmin } from './firebase-admin';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

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

    // Detecta dinámicamente la URL base desde los encabezados de la solicitud.
    const headersList = headers();
    const host = headersList.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    if (!baseUrl) {
        throw new Error("No se pudo determinar la URL base de la aplicación.");
    }
    
    // URL a la que Mercado Pago enviará notificaciones sobre el estado del pago.
    // Esto es CRÍTICO para automatizar la activación del plan.
    const notificationUrl = `${baseUrl}/api/webhooks/mercadopago`;

    const result = await preference.create({
      body: {
        items: [
          {
            id: planId,
            title: title,
            quantity: 1,
            unit_price: price,
            currency_id: 'USD',
          },
        ],
        notification_url: notificationUrl,
        // Metadatos para identificar el pago en el webhook.
        external_reference: workspaceId,
        // URLs a las que el usuario será redirigido.
        back_urls: {
          success: `${baseUrl}/suscripcion?status=success`,
          failure: `${baseUrl}/suscripcion?status=failure`,
          pending: `${baseUrl}/suscripcion?status=pending`,
        },
        auto_return: 'approved', // Redirige automáticamente solo si el pago es aprobado.
      },
    });

    console.log('Preferencia de Mercado Pago creada:', result);

    // Devolvemos el ID de la preferencia. El frontend lo usará para renderizar el botón de pago.
    return { id: result.id };
  } catch (error: any) {
    console.error('Error al crear la preferencia de Mercado Pago:', error);
    // Devuelve un objeto con un mensaje de error claro.
    return { error: error.message || 'No se pudo generar el enlace de pago.' };
  }
}

/**
 * Elimina un usuario de Firebase Authentication y Firestore.
 * Esta acción solo debe ser accesible para super-administradores.
 * @param userId - El UID del usuario a eliminar.
 */
export async function deleteUser(userId: string) {
  try {
    const adminApp = await initAdmin();
    const adminAuth = getAdminAuth(adminApp);
    const firestore = getFirestore(adminApp);

    // Paso 1: Intentar eliminar de Auth
    try {
        await adminAuth.deleteUser(userId);
    } catch (authError: any) {
        // Si el error es que el usuario no existe, lo ignoramos y seguimos
        // para borrar el documento "zombie" de Firestore.
        if (authError.code === 'auth/user-not-found') {
            console.warn(`Usuario ${userId} no encontrado en Auth, eliminando solo de Firestore.`);
        } else {
            // Si es otro error de Auth, lo lanzamos.
            throw authError;
        }
    }

    // Paso 2: Eliminar de Firestore (siempre se ejecuta)
    await firestore.collection('users').doc(userId).delete();
    
    revalidatePath('/usuarios');

    return { success: true, message: 'Usuario eliminado correctamente.' };
  } catch (error: any) {
    console.error('Error al eliminar el usuario:', error);
    return { success: false, error: error.message };
  }
}

export async function getProductInfoFromBarcode(barcode: string) {
  // --- 1. Try Open Food Facts first ---
  try {
    const openFoodFactsResponse = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    if (openFoodFactsResponse.ok) {
      const openFoodFactsData = await openFoodFactsResponse.json();
      if (openFoodFactsData.status !== 0 && openFoodFactsData.product) {
        const product = openFoodFactsData.product;
        // If we found a product with a name, we consider it a success.
        if (product.product_name || product.product_name_es) {
            console.log(`Producto ${barcode} encontrado en Open Food Facts.`);
            return {
              success: true,
              product: {
                name: product.product_name_es || product.product_name || '',
                brand: product.brands || '',
                imageUrl: product.image_url || '',
              }
            };
        }
      }
    }
  } catch (error: any) {
    console.error('Error fetching from Open Food Facts:', error.message);
    // Don't return, just log and fall through to Wikidata
  }

  // --- 2. If Open Food Facts fails, try Wikidata ---
  try {
    // Build a list of possible GTINs to check (original and zero-padded for UPC-A)
    const gtinValues = barcode.length === 12 
        ? `"${barcode}" "0${barcode}"` 
        : `"${barcode}"`;

    // The properties to search for GTIN codes. Added GTIN-8 for more coverage.
    const properties = "wdt:P239 wdt:P212 wdt:P238 wdt:P240";

    const sparqlQuery = `
      SELECT ?item ?itemLabel ?image WHERE {
        VALUES ?gtin { ${gtinValues} }
        VALUES ?property { ${properties} }
        ?item ?property ?gtin.
        OPTIONAL { ?item wdt:P18 ?image. }
        # More robust language fallback per Wikidata documentation.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],es,en". }
      }
      LIMIT 1
    `;
    
    const wikidataUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;

    const wikidataResponse = await fetch(wikidataUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SimpleStockApp/1.0 (Firebase Studio Project; mailto:support@example.com)'
      }
    });

    if (wikidataResponse.ok) {
      const wikidataData = await wikidataResponse.json();
      const bindings = wikidataData.results?.bindings;
      if (bindings && bindings.length > 0) {
        const result = bindings[0];
        console.log(`Producto ${barcode} encontrado en Wikidata.`);
        return {
          success: true,
          product: {
            name: result.itemLabel?.value || '',
            brand: '', // Wikidata doesn't have a standard "brand" field like OFF
            imageUrl: result.image?.value || '',
          }
        };
      }
    }
  } catch (error: any) {
    console.error('Error fetching from Wikidata:', error.message);
    // Don't return, just log and fall through to final error
  }


  // --- 3. If both fail ---
  console.log(`Producto ${barcode} no encontrado en ninguna fuente.`);
  return { success: false, error: 'Product not found in any database.' };
}
