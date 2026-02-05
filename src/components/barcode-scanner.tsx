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

    const html5QrCode = new Html5Qrcode(qrcodeRegionId);
    let scannerIsRunning = false;

    const startScanner = async () => {
      try {
        await Html5Qrcode.getCameras();
        scannerIsRunning = true;
        html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
                width: Math.min(viewfinderWidth, viewfinderHeight) * 0.7,
                height: Math.min(viewfinderWidth, viewfinderHeight) * 0.3,
            }),
            aspectRatio: 1.7777778,
          },
          (decodedText, _decodedResult) => {
            onScanSuccess(decodedText);
            stopScanner(); // Stop after a successful scan
          },
          (_errorMessage) => {
            // handle scan failure, usually better to ignore and keep scanning.
          }
        ).catch(err => {
            console.error("Error starting scanner:", err);
            setError("No se pudo iniciar la cámara. Asegúrate de haber otorgado los permisos necesarios. " + err.message);
        });
      } catch (err: any) {
        console.error("Camera permission error:", err);
        setError("No se encontraron cámaras o no se otorgaron los permisos. " + err.message);
      }
    };

    const stopScanner = () => {
      // Check if the scanner is in a state where it can be stopped.
      if (scannerIsRunning && html5QrCode.getState() === 2) { // 2 is SCANNING state
        html5QrCode.stop().then(() => {
          scannerIsRunning = false;
        }).catch((err) => {
          console.error("Error stopping scanner:", err);
        });
      }
    };

    startScanner();

    // Cleanup function
    return () => {
      stopScanner();
    };
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
