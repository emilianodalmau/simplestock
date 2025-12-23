
'use client';

import { useEffect } from 'react';
import { initMercadoPago, Wallet } from '@mercadopago/sdk-react';

interface CheckoutButtonProps {
  preferenceId: string;
}

// Es crucial que esta clave pública se configure como una variable de entorno.
const MERCADO_PAGO_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;

export function CheckoutButton({ preferenceId }: CheckoutButtonProps) {
  useEffect(() => {
    if (MERCADO_PAGO_PUBLIC_KEY) {
      initMercadoPago(MERCADO_PAGO_PUBLIC_KEY, {
        locale: 'es-AR',
      });
    } else {
        console.error('La clave pública de Mercado Pago no está configurada.');
    }
  }, []);

  if (!MERCADO_PAGO_PUBLIC_KEY) {
      return <div className="text-center text-destructive">Error: La integración de pagos no está configurada correctamente.</div>
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
      />
    </div>
  );
}
