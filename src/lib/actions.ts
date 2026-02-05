
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
  const cleanBarcode = barcode.trim();

  // --- 1. Intento con Open Food Facts ---
  try {
    const offResponse = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`, {
      headers: { 'User-Agent': 'SimpleStockApp - Web - Version 1.0' }
    });
    
    if (offResponse.ok) {
      const data = await offResponse.json();
      if (data.status === 1 && data.product) {
        return {
          success: true,
          product: {
            name: data.product.product_name_es || data.product.product_name || '',
            brand: data.product.brands || '',
            imageUrl: data.product.image_url || '',
          }
        };
      }
    }
  } catch (error) {
    console.error('Error OFF:', error);
  }

  // --- 2. Fallback a Wikidata (Versión corregida) ---
  try {
    // Definimos las propiedades de Wikidata donde puede estar el código
    // P296: GTIN, P212: ISBN-13, P238: GTIN-12, P240: GTIN-8
    const properties = ['P296', 'P212', 'P238', 'P240'];
    
    // Construimos una query más directa sin VALUES para evitar bloqueos de ejecución
    const orConditions = properties.map(p => `{ ?item wdt:${p} "${cleanBarcode}" }`).join(' UNION ');
    
    // Si es UPC-A (12 dígitos), también probamos con el cero adelante
    let upcCondition = '';
    if (cleanBarcode.length === 12) {
      upcCondition = ' UNION ' + properties.map(p => `{ ?item wdt:${p} "0${cleanBarcode}" }`).join(' UNION ');
    }

    const sparqlQuery = `
      SELECT ?item ?itemLabel ?image WHERE {
        { ${orConditions} ${upcCondition} }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
        OPTIONAL { ?item wdt:P18 ?image. }
      }
      LIMIT 1
    `;

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/sparql-results+json',
        // Cambiamos a un User-Agent más estándar de navegador para evitar bloqueos
        'User-Agent': 'Mozilla/5.0 (compatible; SimpleStockBot/1.0; +https://simpletask.com.ar)'
      },
      cache: 'no-store' // Evitamos problemas de caché durante el debug
    });

    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

    const data = await response.json();
    const result = data.results?.bindings?.[0];

    if (result) {
      return {
        success: true,
        product: {
          name: result.itemLabel.value,
          brand: '', // Wikidata no siempre separa marca del nombre
          imageUrl: result.image ? result.image.value : '',
          barcode: cleanBarcode
        }
      };
    }
  } catch (error) {
    console.error("Error Wikidata Fallback:", error);
  }

  return { success: false, error: 'Producto no encontrado.' };
}
