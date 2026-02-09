'use client';

import { useEffect, useState, useRef } from 'react';
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
  // Using a ref to hold the scanner instance is crucial.
  // It persists the instance across re-renders, preventing re-initialization
  // and allowing us to correctly call .stop() on the active scanner.
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Lazily initialize the scanner instance on first open
      if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(qrcodeRegionId);
      }
      const html5QrCode = scannerRef.current;

      const scannerTimeout = setTimeout(() => {
        if (html5QrCode && !html5QrCode.isScanning) {
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
              onScanSuccess(decodedText);
            },
            (_errorMessage) => {
              // handle scan failure, usually better to ignore and keep scanning.
            }
          ).catch(err => {
              console.error("Error starting scanner:", err);
              setError("No se pudo iniciar la cámara. Asegúrate de haber otorgado los permisos necesarios. " + err.message);
          });
        }
      }, 300);

      return () => {
        clearTimeout(scannerTimeout);
      };
    } else {
      // When the dialog is closed, stop the scanner if it's running.
      // This is the key to releasing the camera.
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => {
            console.error("Error al detener el escáner:", err);
        });
      }
    }
  }, [isOpen, onScanSuccess]);

  const handleClose = () => {
    setError(null);
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
