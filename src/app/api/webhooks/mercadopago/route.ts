
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
  console.log('--- Webhook de Mercado Pago recibido ---');
  
  const body = await req.json();
  console.log('Cuerpo de la notificación:', body);

  const paymentId = body.data?.id;

  if (body.type !== 'payment' || !paymentId) {
    console.log('Notificación no es de tipo "payment" o no tiene ID. Ignorando.');
    return NextResponse.json({ success: true, message: 'Not a processable payment notification.' });
  }

  // Handle test webhook simulation
  if (paymentId.startsWith('test_')) {
    console.log('Procesando simulación de webhook de prueba.');
    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      console.error('Error en simulación: Falta el workspaceId en el cuerpo de la petición.');
      return NextResponse.json({ success: false, message: 'Test simulation requires workspaceId' }, { status: 400 });
    }
    
    try {
        const adminApp = await initAdmin();
        const firestore = getFirestore(adminApp);
        
        const planId = 'crecimiento_mensual' as keyof typeof planLimits; // Simula la compra del plan Crecimiento
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
        await workspaceRef.update({ subscription: newSubscriptionData });

        console.log(`Simulación exitosa: Workspace ${workspaceId} actualizado al plan ${planId}.`);
        return NextResponse.json({ success: true, message: 'Test simulation processed successfully.' });

    } catch (error: any) {
        console.error('Error procesando la simulación del webhook:', error);
        return NextResponse.json({ success: false, message: error.message || 'Internal server error during simulation' }, { status: 500 });
    }
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
    const item = paymentDetails.additional_information?.items?.[0];
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