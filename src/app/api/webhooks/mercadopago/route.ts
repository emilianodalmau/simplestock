
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { initAdmin } from '@/lib/firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Define los límites para cada plan.
const planLimits = {
  inicial_mensual: { maxProducts: 100, maxUsers: 1, maxDeposits: 2, maxMovementsPerMonth: 100 },
  inicial_anual: { maxProducts: 100, maxUsers: 1, maxDeposits: 2, maxMovementsPerMonth: 100 },
  crecimiento_mensual: { maxProducts: 2000, maxUsers: 5, maxDeposits: 5, maxMovementsPerMonth: 999999 },
  crecimiento_anual: { maxProducts: 2000, maxUsers: 5, maxDeposits: 5, maxMovementsPerMonth: 999999 },
  empresarial_mensual: { maxProducts: 999999, maxUsers: 50, maxDeposits: 999999, maxMovementsPerMonth: 999999 },
  empresarial_anual: { maxProducts: 999999, maxUsers: 50, maxDeposits: 999999, maxMovementsPerMonth: 999999 },
  fullfree: { maxProducts: 999999, maxUsers: 999999, maxDeposits: 999999, maxMovementsPerMonth: 999999 },
};

// Asegúrate de tener tu Access Token como una variable de entorno.
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

export async function POST(req: NextRequest) {
  console.log('Webhook de Mercado Pago recibido.');
  
  const body = await req.json();
  const paymentId = body.data?.id;

  if (body.type !== 'payment' || !paymentId) {
    console.log('Notificación no es de tipo "payment" o no tiene ID.');
    return NextResponse.json({ success: false, message: 'Not a payment notification' });
  }

  try {
    const adminApp = await initAdmin();
    const firestore = getFirestore(adminApp);
    const payment = new Payment(client);
    
    console.log(`Procesando notificación para el ID de pago: ${paymentId}`);
    
    // --- Flujo normal para notificaciones reales de Mercado Pago ---
    const paymentDetails = await payment.get({ id: paymentId });
    console.log('Detalles completos del pago obtenidos de MP:', JSON.stringify(paymentDetails, null, 2));

    const workspaceId = paymentDetails.external_reference;
    const paymentStatus = paymentDetails.status;
    // CORRECCIÓN: Obtener el item del cuerpo principal, no de additional_information
    const item = paymentDetails.additional_information?.items?.[0];
    // CORRECCIÓN: Comprobar tanto 'id' como 'category_id' para el plan.
    const planId = (item?.id || item?.category_id) as keyof typeof planLimits;
    
    if (!workspaceId) {
      console.error('Error: external_reference (workspaceId) no encontrado en el pago.');
      return NextResponse.json({ success: false, message: 'Workspace ID not found in payment' }, { status: 400 });
    }

    if (paymentStatus === 'approved') {
      console.log(`Pago aprobado para el workspace: ${workspaceId}`);
      
      if (!planId || !planLimits[planId]) {
        console.error(`Error: Plan ID "${planId}" no es válido o no se encontró en los detalles del pago.`);
        return NextResponse.json({ success: false, message: `Invalid Plan ID: ${planId}` }, { status: 400 });
      }
      
      const isAnnual = planId.includes('_anual');
      const currentPeriodEndDate = new Date();
      if (isAnnual) {
          currentPeriodEndDate.setFullYear(currentPeriodEndDate.getFullYear() + 1);
      } else {
          currentPeriodEndDate.setMonth(currentPeriodEndDate.getMonth() + 1);
      }

      const newSubscriptionData = {
        planId: planId,
        status: 'active',
        currentPeriodEnd: Timestamp.fromDate(currentPeriodEndDate),
        limits: planLimits[planId],
        lastPaymentId: paymentId,
        updatedAt: Timestamp.now(),
      };
      
      const workspaceRef = firestore.collection('workspaces').doc(workspaceId);
      
      console.log(`Actualizando workspace ${workspaceId} con los siguientes datos de suscripción:`, JSON.stringify(newSubscriptionData, null, 2));
      
      await workspaceRef.update({
        subscription: newSubscriptionData
      });

      console.log(`Workspace ${workspaceId} actualizado al plan ${planId} exitosamente.`);
    } else {
      console.log(`Estado del pago no es "approved": ${paymentStatus}. No se realizan cambios.`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error procesando el webhook de Mercado Pago:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
