
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

// Este es ahora el componente de cliente que recibe la clave pública como prop
function CorrederaDePagoClient({ publicKey }: { publicKey?: string }) {
  const [state, formAction, isPending] = useActionState(createSubscription, initialState);
  const { toast } = useToast();
  const [isSdkReady, setIsSdkReady] = useState(false);

  // Efecto para cargar el SDK de Mercado Pago de forma segura
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => setIsSdkReady(true);
    document.body.appendChild(script);

    return () => {
      // Limpia el script cuando el componente se desmonta
      const container = document.getElementById('walletBrick_container');
      if (container) {
          while (container.firstChild) {
              container.removeChild(container.firstChild);
          }
      }
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
    // Solo proceder si tenemos todo lo necesario: SDK listo, preferenceId y la Public Key.
    if (state?.preferenceId && isSdkReady && publicKey) {
      try {
        const mp = new window.MercadoPago(publicKey, {
            locale: 'es-AR'
        });
        
        const renderWalletBrick = async () => {
          const container = document.getElementById('walletBrick_container');
          if (container) {
              // Limpia el contenedor antes de renderizar para evitar duplicados
              while (container.firstChild) {
                  container.removeChild(container.firstChild);
              }
              
              // Crea e inicializa el Brick de Mercado Pago
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
          }
        };
        
        renderWalletBrick();
      } catch(e) {
        console.error("Error rendering Mercado Pago Brick: ", e)
        toast({
          variant: 'destructive',
          title: 'Error de Mercado Pago',
          description: 'No se pudo renderizar el botón de pago. Revisa la consola para más detalles.',
        });
      }
    }
  }, [state?.preferenceId, isSdkReady, publicKey, toast]);

  return (
      <Card>
        <CardHeader>
          <CardTitle>Planes y Suscripciones</CardTitle>
          <CardDescription>
            Aquí se mostrarán los planes de suscripción y la integración con Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!publicKey && (
             <div className="text-destructive font-semibold bg-destructive/10 p-3 rounded-md">
                <p className='font-bold'>Error de Configuración</p>
                <p className='text-sm'>
                  La clave pública de Mercado Pago no está configurada. Asegúrate de haberla añadido a tu archivo .env.local (con el prefijo `NEXT_PUBLIC_`) y de haber reiniciado el servidor.
                </p>
             </div>
          )}

          {publicKey && !state?.preferenceId && (
            <p>
              Haz clic en el botón para generar una preferencia de pago y mostrar el botón de Mercado Pago.
            </p>
          )}
          
          {isPending && <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}

          {/* Contenedor para el botón de Mercado Pago */}
          <div id="walletBrick_container"></div>

        </CardContent>
        <CardFooter>
          {/* Solo mostramos el botón de generar si aún no tenemos una preferenceId */}
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
  );
}


// Este es el componente de servidor que renderiza la página
export default function CorrederaDePagoPage() {
  // Leemos la variable de entorno aquí, en el servidor, de forma segura.
  const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Corredera de Pago</h1>
        <p className="text-muted-foreground">Página de prueba para la integración con la pasarela de pagos.</p>
      </div>
      {/* Pasamos la clave pública como una prop al componente de cliente */}
      <CorrederaDePagoClient publicKey={publicKey} />
    </div>
  );
}
