
'use client';

import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { StockMovement } from '@/app/movimientos/page';
import type { AppSettings } from '@/lib/settings';

interface RemitoPDFProps {
  movement: StockMovement;
  settings: AppSettings | null;
}

export function RemitoPDF({ movement, settings }: RemitoPDFProps) {
  const totalQuantity = movement.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="bg-white text-black p-8" style={{ width: '800px' }}>
      {/* Header */}
      <header className="flex justify-between items-start mb-8 border-b-2 border-gray-300 pb-4">
        <div className="flex items-center gap-4">
          {settings?.logoUrl && (
            <div className="flex-shrink-0">
              <Image src={settings.logoUrl} alt="Logo" width={80} height={80} />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{settings?.appName || 'Remito'}</h1>
            <p className="text-sm text-gray-500">Comprobante de Movimiento de Stock</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-semibold text-gray-700">Remito Nº: {movement.remitoNumber || 'N/A'}</h2>
          <p className="text-sm text-gray-500">
            Fecha: {format(movement.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: es })}
          </p>
        </div>
      </header>

      {/* Details */}
      <section className="grid grid-cols-2 gap-8 mb-8">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold border-b pb-1 mb-2 text-gray-700">Detalles del Movimiento</h3>
          <div className="flex justify-between">
            <span className="font-medium text-gray-600">Tipo:</span>
            <span className={`font-semibold ${movement.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
              {movement.type.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-600">Depósito:</span>
            <span>{movement.depositName}</span>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold border-b pb-1 mb-2 text-gray-700">
            {movement.type === 'entrada' ? 'Origen (Proveedor)' : 'Destino (Cliente)'}
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
              <th scope="col" className="px-6 py-3">
                Producto
              </th>
              <th scope="col" className="px-6 py-3 text-right">
                Cantidad
              </th>
              <th scope="col" className="px-6 py-3 text-right">
                Unidad
              </th>
            </tr>
          </thead>
          <tbody>
            {movement.items.map((item, index) => (
              <tr key={index} className="bg-white border-b hover:bg-gray-50">
                <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                  {item.productName}
                </th>
                <td className="px-6 py-4 text-right">{item.quantity}</td>
                <td className="px-6 py-4 text-right">{item.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
       {/* Footer */}
       <footer className="mt-8 pt-4 border-t text-right">
          <p className="text-lg font-bold">Total de Ítems: {totalQuantity}</p>
       </footer>
    </div>
  );
}
