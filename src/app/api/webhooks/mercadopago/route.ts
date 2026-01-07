
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { initAdmin } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase/firestore';

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
    // Inicializa Firebase Admin
    await initAdmin();
    const firestore = getFirestore();

    // Obtiene la información del pago desde Mercado Pago
    const payment = await new Payment(client).get({ id: paymentId });
    
    console.log('Datos del pago obtenidos de MP:', payment);

    const workspaceId = payment.external_reference;
    const paymentStatus = payment.status;
    
    if (!workspaceId) {
      console.error('Error: external_reference (workspaceId) no encontrado en el pago.');
      return NextResponse.json({ success: false, message: 'Workspace ID not found in payment' }, { status: 400 });
    }

    if (paymentStatus === 'approved') {
      console.log(`Pago aprobado para el workspace: ${workspaceId}`);
      
      const item = payment.additional_information?.items?.[0];
      const planId = item?.id as keyof typeof planLimits;

      if (!planId || !planLimits[planId]) {
        console.error(`Error: Plan ID "${planId}" no es válido o no se encontró en la lista de planes.`);
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
  } catch (error) {
    console.error('Error procesando el webhook de Mercado Pago:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
