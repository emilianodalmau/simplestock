
'use client';

import { useEffect, useState } from 'react';
import { initMercadoPago, Wallet } from '@mercadopago/sdk-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

interface CheckoutButtonProps {
  preferenceId: string;
}

// Es crucial que esta clave pública se configure como una variable de entorno.
const MERCADO_PAGO_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;

export function CheckoutButton({ preferenceId }: CheckoutButtonProps) {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (MERCADO_PAGO_PUBLIC_KEY) {
      initMercadoPago(MERCADO_PAGO_PUBLIC_KEY, {
        locale: 'es-AR',
      });
    } else {
      console.error('La clave pública de Mercado Pago no está configurada.');
    }

    // Heurística para detectar el bloqueo del script.
    // Si el contenedor del wallet sigue vacío después de un tiempo, asumimos que fue bloqueado.
    const timer = setTimeout(() => {
      const container = document.getElementById('wallet_container');
      if (container && container.innerHTML === '') {
        setIsBlocked(true);
      }
    }, 3000); // Espera 3 segundos

    return () => clearTimeout(timer);
  }, [preferenceId]);

  if (!MERCADO_PAGO_PUBLIC_KEY) {
    return (
      <div className="text-center text-destructive">
        Error: La integración de pagos no está configurada correctamente.
      </div>
    );
  }

  if (isBlocked) {
    return (
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error al Cargar la Pasarela de Pago</AlertTitle>
        <AlertDescription>
          No pudimos mostrar el botón de pago. Es posible que el bloqueador de
          anuncios o la protección de seguimiento de tu navegador (como la de
          Edge o Brave) lo esté impidiendo.
          <br /><br />
          <strong>Soluciones:</strong>
          <ul className="list-disc pl-5 mt-2">
            <li>Desactiva temporalmente el bloqueador para este sitio.</li>
            <li>Intenta realizar el pago en otro navegador como Chrome o Firefox.</li>
          </ul>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div id="wallet_container">
      <Wallet
        initialization={{ preferenceId: preferenceId }}
        customization={{
          texts: {
            action: 'pay',
            valueProp: 'convenient',
          },
        }}
        callbacks={{
          onError: (error) => {
            console.error('Error en el brick de Mercado Pago:', error);
            setIsBlocked(true);
          },
        }}
      />
    </div>
  );
}
