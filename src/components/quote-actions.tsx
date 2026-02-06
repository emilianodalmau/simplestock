'use client';

import { useState } from 'react';
import ReactDOM from 'react-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Download, Loader2, Edit } from 'lucide-react';
import type { Quote } from '@/types/inventory';
import type { AppSettings } from '@/types/settings';
import { QuotePDF } from '@/components/quote-pdf';

interface QuoteActionsProps {
  quote: Quote;
  settings: AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string } | null;
  onStatusChange: (quoteId: string, newStatus: Quote['status']) => void;
  onEdit: () => void;
}

export function QuoteActions({
  quote,
  settings,
  onStatusChange,
  onEdit,
}: QuoteActionsProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfComponentContainer, setPdfComponentContainer] = useState<HTMLDivElement | null>(null);

  const handleGeneratePdf = async () => {
    if (!settings || isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);
    setPdfComponentContainer(container);
    
    setTimeout(async () => {
      if (container) {
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
        });
        
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const canvasAspectRatio = canvasWidth / canvasHeight;

        let renderWidth = pdfWidth - 20; // 10mm margin on each side
        let renderHeight = renderWidth / canvasAspectRatio;
        
        if (renderHeight > pdfHeight - 20) {
            renderHeight = pdfHeight - 20;
            renderWidth = renderHeight * canvasAspectRatio;
        }

        const x = (pdfWidth - renderWidth) / 2;
        const y = 10;

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight);
        pdf.save(`presupuesto-${quote.quoteNumber || quote.id}.pdf`);
      }
      
      if (container) {
        document.body.removeChild(container);
      }
      setPdfComponentContainer(null);
      setIsGeneratingPdf(false);
    }, 500);
  };

  return (
    <>
       {pdfComponentContainer && ReactDOM.createPortal(
        <QuotePDF quote={quote} settings={settings} />,
        pdfComponentContainer
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Abrir menú</span>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" />
                <span>Editar</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleGeneratePdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? <Loader2 className="mr-2 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Descargar PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onStatusChange(quote.id, 'enviado')}>Marcar como Enviado</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(quote.id, 'aprobado')}>Marcar como Aprobado</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(quote.id, 'rechazado')} className="text-red-500 focus:text-red-500">Marcar como Rechazado</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
