'use client';

import { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CameraOff } from 'lucide-react';

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

const qrcodeRegionId = "barcode-scanner-region";

export function BarcodeScanner({ isOpen, onClose, onScanSuccess }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    
    let html5QrCode: Html5Qrcode | null = null;
    
    // A timeout ensures that the dialog's DOM is rendered before we try to find the element.
    const scannerTimeout = setTimeout(() => {
      // Check if element exists before initializing
      const scannerRegion = document.getElementById(qrcodeRegionId);
      if (!scannerRegion) {
        console.error(`HTML Element with id=${qrcodeRegionId} not found.`);
        setError(`No se pudo inicializar el componente de escaneo.`);
        return;
      }
      
      html5QrCode = new Html5Qrcode(qrcodeRegionId);

      html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const boxWidth = Math.max(50, minEdge * 0.7);
            const boxHeight = Math.max(50, minEdge * 0.3);
            return { width: boxWidth, height: boxHeight };
          },
          aspectRatio: 1.7777778,
        },
        (decodedText, _decodedResult) => {
          // Wrap in a check to ensure we don't call stop on a null object
          // if the component unmounts right after a successful scan.
          if (html5QrCode) {
            onScanSuccess(decodedText);
          }
        },
        (_errorMessage) => {
          // This callback is for scan failures, which we can ignore to allow continuous scanning.
        }
      ).catch(err => {
          console.error("Error starting scanner:", err);
          setError("No se pudo iniciar la cámara. Asegúrate de haber otorgado los permisos necesarios. " + err.message);
      });
    }, 300);

    // This cleanup function is crucial. It runs when `isOpen` becomes false or the component unmounts.
    return () => {
      clearTimeout(scannerTimeout);
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => {
          console.error("Error al detener el escáner:", err);
        });
      }
    };
  }, [isOpen, onScanSuccess]);

  const handleClose = () => {
    setError(null); // Reset error state on close
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Escanear Código de Barras</DialogTitle>
          <DialogDescription>
            Apunta la cámara al código de barras del producto.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 rounded-lg bg-black">
          {error ? (
            <div className="text-destructive-foreground bg-destructive p-4 rounded-md flex flex-col items-center gap-4">
              <CameraOff className="h-12 w-12" />
              <p className="text-center">{error}</p>
              <Button onClick={handleClose}>Cerrar</Button>
            </div>
          ) : (
            <div id={qrcodeRegionId} className="w-full"></div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
