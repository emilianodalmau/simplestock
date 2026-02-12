'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Batch } from '@/types/inventory';

interface BatchSelection {
  batchId: string;
  loteId: string;
  quantity: number;
}

interface SelectBatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selections: BatchSelection[]) => void;
  productId: string | null;
  productName: string | null;
  depositId: string | null;
  workspaceId: string | null;
  totalNeeded: number;
}

export function SelectBatchDialog({
  isOpen,
  onClose,
  onConfirm,
  productId,
  productName,
  depositId,
  workspaceId,
  totalNeeded,
}: SelectBatchDialogProps) {
  const firestore = useFirestore();
  const [selections, setSelections] = useState<Record<string, number>>({});

  const batchesQuery = useMemoFirebase(() => {
    if (!firestore || !workspaceId || !depositId || !productId) return null;
    return query(
      collection(firestore, `workspaces/${workspaceId}/batches`),
      where('depositId', '==', depositId),
      where('productId', '==', productId),
      where('quantity', '>', 0),
      orderBy('expirationDate', 'asc')
    );
  }, [firestore, workspaceId, depositId, productId]);

  const { data: availableBatches, isLoading } = useCollection<Batch>(batchesQuery);

  useEffect(() => {
    // Reset selections when the dialog is opened or the product changes
    if (isOpen) {
      setSelections({});
    }
  }, [isOpen, productId]);

  const totalAssigned = useMemo(() => {
    return Object.values(selections).reduce((sum, qty) => sum + (qty || 0), 0);
  }, [selections]);

  const handleQuantityChange = (batchId: string, value: string, maxQuantity: number) => {
    const newQuantity = Number(value);
    if (!isNaN(newQuantity) && newQuantity >= 0 && newQuantity <= maxQuantity) {
      setSelections(prev => ({ ...prev, [batchId]: newQuantity }));
    } else if (value === '') {
       setSelections(prev => ({ ...prev, [batchId]: 0 }));
    }
  };

  const handleConfirm = () => {
    const finalSelections = Object.entries(selections)
      .filter(([, qty]) => qty > 0)
      .map(([batchId, quantity]) => {
        const batch = availableBatches?.find(b => b.id === batchId);
        return {
          batchId,
          loteId: batch?.loteId || 'N/A',
          quantity,
        };
      });
    onConfirm(finalSelections);
  };
  
  const isConfirmDisabled = useMemo(() => {
    if (totalNeeded > 0) {
        return totalAssigned !== totalNeeded;
    }
    return totalAssigned === 0;
  }, [totalAssigned, totalNeeded]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Seleccionar Lotes para: {productName}</DialogTitle>
          <DialogDescription>
            Asigna las cantidades a entregar desde los lotes disponibles. Total Requerido: {totalNeeded}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="animate-spin h-8 w-8" /></div>
          ) : !availableBatches || availableBatches.length === 0 ? (
            <p className="text-center text-muted-foreground p-8">No hay lotes con stock disponible para este producto en el depósito seleccionado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Lote</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Stock Disponible</TableHead>
                  <TableHead className="w-[150px] text-right">Cantidad a Entregar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableBatches.map(batch => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-mono">{batch.loteId}</TableCell>
                    <TableCell>{format(batch.expirationDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-right">{batch.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={selections[batch.id] || ''}
                        onChange={(e) => handleQuantityChange(batch.id, e.target.value, batch.quantity)}
                        placeholder="0"
                        max={batch.quantity}
                        min={0}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="mt-4">
          <Alert variant={totalAssigned !== totalNeeded ? 'destructive' : 'default'}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Requerido: <strong>{totalNeeded}</strong> / Asignado: <strong>{totalAssigned}</strong>.
              {totalAssigned !== totalNeeded && " Las cantidades no coinciden."}
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isConfirmDisabled}>
            Confirmar Selección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
