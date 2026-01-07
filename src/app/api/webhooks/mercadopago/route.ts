
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
    // Inicializa Firebase Admin y obtén la instancia de la app.
    const adminApp = await initAdmin();
    // Pasa la instancia de la app a getFirestore.
    const firestore = getFirestore(adminApp);
    const payment = new Payment(client);
    
    let paymentDetails;
    let workspaceId;
    let paymentStatus;
    let planId: keyof typeof planLimits | undefined;

    // --- Simulación para pruebas locales desde /test ---
    if (paymentId.startsWith('test_')) {
      console.log(`SIMULACIÓN de pago con ID: ${paymentId}`);
      workspaceId = body.workspaceId; // Read from body
      if (!workspaceId) {
        throw new Error('La simulación de webhook requiere un "workspaceId" en el cuerpo de la solicitud.');
      }
      paymentStatus = 'approved';
      planId = 'crecimiento_mensual'; // Forzamos el plan crecimiento para la simulación
    } else {
    // --- Flujo normal para notificaciones reales de Mercado Pago ---
      paymentDetails = await payment.get({ id: paymentId });
      console.log('Detalles del pago obtenidos de MP:', paymentDetails);

      workspaceId = paymentDetails.external_reference;
      paymentStatus = paymentDetails.status;
      const item = paymentDetails.additional_information?.items?.[0];
      planId = item?.id as keyof typeof planLimits;
    }
    
    if (!workspaceId) {
      console.error('Error: external_reference (workspaceId) no encontrado en el pago.');
      return NextResponse.json({ success: false, message: 'Workspace ID not found in payment' }, { status: 400 });
    }

    if (paymentStatus === 'approved') {
      console.log(`Pago aprobado para el workspace: ${workspaceId}`);
      
      if (!planId || !planLimits[planId]) {
        console.error(`Error: Plan ID "${planId}" no es válido.`);
        return NextResponse.json({ success: false, message: 'Invalid Plan ID' }, { status: 400 });
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
    // Agrega el mensaje de error a la respuesta para facilitar la depuración
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
