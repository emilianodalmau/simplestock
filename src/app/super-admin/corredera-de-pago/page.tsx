
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createSubscription } from '@/lib/actions';
import { useActionState, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const initialState = {
  error: null,
  preferenceId: null,
};

declare global {
    interface Window {
        MercadoPago: any;
    }
}

export default function CorrederaDePagoPage() {
  const [state, formAction, isPending] = useActionState(createSubscription, initialState);
  const { toast } = useToast();
  const [isSdkReady, setIsSdkReady] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

  // Efecto para cargar el SDK de Mercado Pago
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => setIsSdkReady(true);
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);
  

  // Efecto para manejar errores de la acción del servidor
  useEffect(() => {
    if (state?.error) {
      toast({
        variant: 'destructive',
        title: 'Error de Suscripción',
        description: state.error,
      });
    }
  }, [state?.error, toast]);

  // Efecto para renderizar el botón de pago cuando se obtiene el preferenceId
  useEffect(() => {
    if (state?.preferenceId && isSdkReady && publicKey) {
      const mp = new window.MercadoPago(publicKey, {
          locale: 'es-AR'
      });
      
      const renderWalletBrick = async () => {
        // Limpiar el contenedor antes de renderizar
        const container = document.getElementById('walletBrick_container');
        if (container) {
            // Asegurarse de que el contenedor de bricks esté vacío antes de renderizar
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
        }
        
        await mp.bricks().create('wallet', 'walletBrick_container', {
          initialization: {
            preferenceId: state.preferenceId,
          },
          customization: {
             texts: {
                valueProp: 'smart_option',
             },
          },
        });
      };
      
      renderWalletBrick();
    }
  }, [state?.preferenceId, isSdkReady, publicKey]);

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Corredera de Pago</h1>
        <p className="text-muted-foreground">Página de prueba para la integración con la pasarela de pagos.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planes y Suscripciones</CardTitle>
          <CardDescription>
            Aquí se mostrarán los planes de suscripción y la integración con Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!publicKey && (
             <p className="text-destructive font-semibold">
              Error: La clave pública de Mercado Pago no está configurada. Asegúrate de haberla añadido a tu archivo .env.local y de haber reiniciado el servidor.
            </p>
          )}

          {!state?.preferenceId && publicKey && (
            <p>
              Haz clic en el botón para generar una preferencia de pago y mostrar el botón de Mercado Pago.
            </p>
          )}

          {isPending && <Loader2 className="mx-auto h-8 w-8 animate-spin" />}

          {/* Contenedor para el botón de Mercado Pago */}
          <div id="walletBrick_container"></div>

        </CardContent>
        <CardFooter>
          {!state?.preferenceId && (
            <form action={formAction}>
              <Button type="submit" disabled={isPending || !isSdkReady || !publicKey}>
                 {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                 Generar Botón de Pago
              </Button>
            </form>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
