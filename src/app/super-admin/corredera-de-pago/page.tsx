
'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createSubscription } from '@/lib/actions';
import { useFormState } from 'react-dom';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const initialState = {
  error: null,
};

export default function CorrederaDePagoPage() {
  const [state, formAction] = useFormState(createSubscription, initialState);
  const { toast } = useToast();

  useEffect(() => {
    if (state?.error) {
      toast({
        variant: 'destructive',
        title: 'Error de Suscripción',
        description: state.error,
      });
    }
  }, [state, toast]);

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
            Aquí se mostrarán los planes de suscripción y la integración con
            Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            Al hacer clic en el botón, serás redirigido al checkout de Mercado
            Pago para completar una suscripción de prueba.
          </p>
        </CardContent>
        <CardFooter>
          <form action={formAction}>
            <Button type="submit">Suscribirse al Plan de Prueba</Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
