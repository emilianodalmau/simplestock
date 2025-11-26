
'use client';

import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { StockMovement } from '@/app/movimientos/page';
import type { AppSettings } from '@/types/settings';

interface RemitoPDFProps {
  movement: StockMovement;
  settings: AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string; } | null;
}

export function RemitoPDF({ movement, settings }: RemitoPDFProps) {
    
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  }

  const appName = settings?.workspaceAppName || settings?.appName || 'Remito';
  const logoUrl = settings?.workspaceLogoUrl || settings?.logoUrl;

  return (
    <div
      className="bg-white text-black p-10 font-sans"
      style={{ width: '210mm', minHeight: '297mm' }}
    >
      {/* Header */}
      <header className="flex justify-between items-start pb-4 border-b-2 border-gray-300">
        <div className="flex items-center gap-4">
          {logoUrl && (
            <div className="flex-shrink-0">
              <Image
                src={logoUrl}
                alt="Logo"
                width={80}
                height={80}
                className="object-contain"
              />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              {appName}
            </h1>
            <p className="text-md text-gray-500">
              Comprobante de Movimiento de Stock
            </p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-semibold text-gray-700">
            Remito Nº: {movement.remitoNumber || 'N/A'}
          </h2>
          <p className="text-sm text-gray-500">
            Fecha:{' '}
            {format(movement.createdAt.toDate(), 'dd/MM/yyyy HH:mm', {
              locale: es,
            })}
          </p>
        </div>
      </header>

      {/* Details */}
      <section className="flex justify-between mt-8 mb-8 space-x-8">
        <div className="flex-1 space-y-2">
          <h3 className="text-lg font-semibold border-b pb-1 mb-2 text-gray-700">
            Detalles del Movimiento
          </h3>
          <div className="flex justify-between">
            <span className="font-medium text-gray-600">Tipo:</span>
            <span
              className={`font-semibold ${
                movement.type === 'entrada'
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {movement.type.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-600">Depósito:</span>
            <span>{movement.depositName}</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="text-lg font-semibold border-b pb-1 mb-2 text-gray-700">
            {movement.type === 'entrada'
              ? 'Origen (Proveedor)'
              : 'Destino (Usuario)'}
          </h3>
          <p>{movement.actorName || 'No especificado'}</p>
        </div>
      </section>

      {/* Items Table */}
      <section>
        <h3 className="text-lg font-semibold mb-2 text-gray-700">Productos</h3>
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-100 border-b">
            <tr>
              <th scope="col" className="px-6 py-3 w-2/5">
                Producto
              </th>
              <th scope="col" className="px-6 py-3 text-right">
                Cantidad
              </th>
              <th scope="col" className="px-6 py-3 text-right">
                Unidad
              </th>
               <th scope="col" className="px-6 py-3 text-right">
                Precio Unit.
              </th>
               <th scope="col" className="px-6 py-3 text-right">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {movement.items.map((item, index) => (
              <tr
                key={index}
                className="bg-white border-b hover:bg-gray-50"
              >
                <th
                  scope="row"
                  className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap"
                >
                  {item.productName}
                </th>
                <td className="px-6 py-4 text-right">{item.quantity}</td>
                <td className="px-6 py-4 text-right">{item.unit}</td>
                <td className="px-6 py-4 text-right">{formatPrice(item.price || 0)}</td>
                <td className="px-6 py-4 text-right">{formatPrice(item.total || 0)}</td>
              </tr>
            ))}
          </tbody>
           <tfoot className="text-gray-700 bg-gray-100 border-t-2">
                <tr>
                    <td colSpan={4} className="px-6 py-3 text-right font-bold text-lg">VALOR TOTAL DEL REMITO</td>
                    <td className="px-6 py-3 text-right font-bold text-lg">{formatPrice(movement.totalValue || 0)}</td>
                </tr>
           </tfoot>
        </table>
      </section>

      {/* Footer */}
      <footer className="mt-8 pt-4 border-t text-center text-xs text-gray-400">
        <p>Este es un documento generado automáticamente.</p>
      </footer>
    </div>
  );
}
