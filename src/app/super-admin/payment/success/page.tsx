
'use client';

import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();

  const paymentId = searchParams.get('payment_id');
  const status = searchParams.get('status');
  const merchantOrderId = searchParams.get('merchant_order_id');

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <div className="mx-auto bg-green-100 rounded-full h-16 w-16 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="mt-4 text-2xl">¡Pago Aprobado!</CardTitle>
          <CardDescription>
            Tu pago ha sido procesado exitosamente. Gracias por tu compra.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-left bg-muted/50 p-4 rounded-lg">
           <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Estado:</span>
                <span className="font-mono bg-green-200 text-green-800 px-2 py-0.5 rounded-full text-xs">{status}</span>
            </div>
            <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">ID de Pago:</span>
                <span className="font-mono">{paymentId}</span>
            </div>
            <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">ID de Orden:</span>
                <span className="font-mono">{merchantOrderId}</span>
            </div>
        </CardContent>
        <CardContent>
            <Button asChild className="w-full">
               <Link href="/dashboard">Volver al Panel de Control</Link>
            </Button>
        </CardContent>
      </Card>
    </div>
  );
}