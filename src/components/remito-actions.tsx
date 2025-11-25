'use client';

import { useState } from 'react';
import ReactDOM from 'react-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Edit, Trash2, Download, Loader2 } from 'lucide-react';
import type { StockMovement } from '@/app/movimientos/page';
import type { AppSettings } from '@/lib/settings';
import { RemitoPDF } from '@/components/remito-pdf';

interface RemitoActionsProps {
  movement: StockMovement;
  settings: AppSettings | null;
  canDelete: boolean;
  onDelete: () => void;
}

export function RemitoActions({
  movement,
  settings,
  canDelete,
  onDelete,
}: RemitoActionsProps) {
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
          scale: 2, // Increase resolution
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
        const pdfAspectRatio = pdfWidth / pdfHeight;

        let renderWidth = pdfWidth - 20; // 10mm margin on each side
        let renderHeight = renderWidth / canvasAspectRatio;
        
        let x = 10; // 10mm margin
        let y = 10; // 10mm margin
        
        if (renderHeight > pdfHeight - 20) {
            renderHeight = pdfHeight - 20;
            renderWidth = renderHeight * canvasAspectRatio;
            x = (pdfWidth - renderWidth) / 2;
        }

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight);
        pdf.save(`remito-${movement.remitoNumber || movement.id}.pdf`);
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
        <RemitoPDF movement={movement} settings={settings} />,
        pdfComponentContainer
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleGeneratePdf}
        disabled={isGeneratingPdf || !settings}
        title="Descargar PDF"
      >
        {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        <span className="sr-only">Descargar PDF</span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        disabled={true}
        title="La edición de remitos está deshabilitada para mantener la integridad del historial."
      >
        <Edit className="h-4 w-4" />
        <span className="sr-only">Editar</span>
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canDelete}
            title={!canDelete ? 'Solo los administradores pueden anular remitos' : 'Anular Remito'}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
            <span className="sr-only">Eliminar</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Estás seguro de que quieres anular este remito?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se anulará el remito{' '}
              <strong>{movement.remitoNumber}</strong> y se revertirán los cambios de
              stock asociados a él.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sí, anular remito
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
