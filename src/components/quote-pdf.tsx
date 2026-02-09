
'use client';

import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Quote } from '@/types/inventory';
import type { AppSettings } from '@/types/settings';

interface QuotePDFProps {
  quote: Quote;
  settings: AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string; } | null;
}

export function QuotePDF({ quote, settings }: QuotePDFProps) {
    
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  }

  const appName = settings?.workspaceAppName || settings?.appName || 'Presupuesto';
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
              Presupuesto / Cotización
            </p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-semibold text-gray-700">
            Presupuesto Nº: {quote.quoteNumber || 'N/A'}
          </h2>
          <p className="text-sm text-gray-500">
            Fecha:{' '}
            {format(quote.createdAt.toDate(), 'dd/MM/yyyy', {
              locale: es,
            })}
          </p>
           <p className="text-sm text-gray-500">
            Válido hasta:{' '}
            {format(quote.validUntil.toDate(), 'dd/MM/yyyy', {
              locale: es,
            })}
          </p>
        </div>
      </header>

      {/* Client Details */}
      <section className="mt-8 mb-8">
        <div className="flex-1 space-y-2 border p-4 rounded-md bg-gray-50">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">
            Cliente
          </h3>
          <p className="font-bold text-gray-800">{quote.clientName}</p>
          {/* Aquí podrías agregar más detalles del cliente si los tuvieras */}
        </div>
      </section>

      {/* Items Table */}
      <section>
        <h3 className="text-lg font-semibold mb-2 text-gray-700">Detalle</h3>
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
                Precio Unit.
              </th>
               <th scope="col" className="px-6 py-3 text-right">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, index) => (
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
                <td className="px-6 py-4 text-right">{item.quantity} {item.unit}</td>
                <td className="px-6 py-4 text-right">{formatPrice(item.price || 0)}</td>
                <td className="px-6 py-4 text-right">{formatPrice(item.total || 0)}</td>
              </tr>
            ))}
          </tbody>
           <tfoot className="text-gray-700 bg-gray-100 border-t-2">
                <tr>
                    <td colSpan={3} className="px-6 py-3 text-right font-bold text-lg">VALOR TOTAL</td>
                    <td className="px-6 py-3 text-right font-bold text-lg">{formatPrice(quote.totalValue || 0)}</td>
                </tr>
           </tfoot>
        </table>
      </section>

      {/* Footer */}
      <footer className="mt-8 pt-4 border-t text-center text-xs text-gray-400">
        <p>Presupuesto generado por: {quote.userName || 'Usuario del Sistema'}.</p>
        <p>{appName}. Precios sujetos a cambios sin previo aviso.</p>
      </footer>
    </div>
  );
}
