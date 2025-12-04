
'use client';

import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { XCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PaymentFailurePage() {
  const searchParams = useSearchParams();

  const paymentId = searchParams.get('payment_id');
  const status = searchParams.get('status');

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
           <div className="mx-auto bg-red-100 rounded-full h-16 w-16 flex items-center justify-center">
            <XCircle className="h-10 w-10 text-red-600" />
          </div>
          <CardTitle className="mt-4 text-2xl">Pago Rechazado</CardTitle>
          <CardDescription>
            Hubo un problema al procesar tu pago. Por favor, intenta de nuevo o contacta a soporte.
          </CardDescription>
        </CardHeader>
         <CardContent className="space-y-4 text-sm text-left bg-muted/50 p-4 rounded-lg">
           <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Estado:</span>
                <span className="font-mono bg-red-200 text-red-800 px-2 py-0.5 rounded-full text-xs">{status}</span>
            </div>
            <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">ID de Pago:</span>
                <span className="font-mono">{paymentId}</span>
            </div>
        </CardContent>
        <CardContent>
          <Button asChild className="w-full" variant="outline">
            <Link href="/super-admin/corredera-de-pago">Volver a Intentar</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}