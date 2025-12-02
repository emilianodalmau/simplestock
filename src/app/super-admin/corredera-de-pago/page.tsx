'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export default function CorrederaDePagoPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Corredera de Pago
        </h1>
        <p className="text-muted-foreground">
          Página de prueba para la integración con la pasarela de pagos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planes y Suscripciones</CardTitle>
          <CardDescription>
            Aquí se mostrarán los planes de suscripción y la integración con Mercado Pago.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
