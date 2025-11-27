
'use client';

import { useMemo, useEffect, useState } from 'react';
import { useForm, useFieldArray, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import {
  useFirestore,
  useUser
} from '@/firebase';
import {
  runTransaction,
  doc,
  serverTimestamp,
  increment,
  collection,
} from 'firebase/firestore';
import type { StockMovement, InventoryStock, Product, StockMovementItem } from '@/types/inventory';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


// --- Zod Schemas ---
const processItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  requested: z.number(),
  inStock: z.number(),
  unit: z.string(),
  toDeliver: z.coerce.number().min(0, 'La cantidad no puede ser negativa.'),
});

const processRequestFormSchema = z.object({
  items: z.array(processItemSchema),
}).refine(
  (data) => {
    for (const item of data.items) {
      if (item.toDeliver > item.inStock) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'La cantidad a entregar no puede superar el stock disponible.',
    path: ['items'],
  }
).refine(
    (data) => data.items.some(item => item.toDeliver > 0),
    {
        message: 'Debes entregar al menos un producto para generar el remito.',
        path: ['items'],
    }
);


type ProcessRequestFormValues = z.infer<typeof processRequestFormSchema>;

interface ProcessRequestDialogProps {
  request: StockMovement;
  inventory: InventoryStock[];
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onProcessed: () => void;
}

export function ProcessRequestDialog({
  request,
  inventory,
  products,
  isOpen,
  onClose,
  onProcessed,
}: ProcessRequestDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const preparedItems = useMemo(() => {
    const stockMap = new Map<string, number>();

    inventory.forEach(stockItem => {
        if (stockItem.depositId === request.depositId) {
            stockMap.set(stockItem.productId, (stockMap.get(stockItem.productId) || 0) + stockItem.quantity);
        }
    });

    return request.items.map(item => {
      const product = productMap.get(item.productId);
      const inStock = stockMap.get(item.productId) || 0;
      return {
        productId: item.productId,
        productName: item.productName,
        requested: item.quantity,
        inStock: inStock,
        unit: item.unit,
        toDeliver: Math.min(item.quantity, inStock), // Default to requested qty or what's in stock
      };
    });
  }, [request, inventory, productMap]);
  
  const form = useForm<ProcessRequestFormValues>({
    resolver: zodResolver(processRequestFormSchema),
    defaultValues: {
      items: preparedItems,
    },
  });

  useEffect(() => {
    if (isOpen) {
        form.reset({ items: preparedItems });
    }
  }, [isOpen, preparedItems, form]);

  const { fields } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  
  const handleFormSubmit: SubmitHandler<ProcessRequestFormValues> = async (data) => {
    if (!firestore || !user?.uid) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo autenticar al usuario.' });
        return;
    }
    
    setIsSubmitting(true);
    
    const workspaceId = request.id.split('/')[0];
    const collectionPrefix = `workspaces/${workspaceId}`;

    runTransaction(firestore, async (transaction) => {
      if (!workspaceId) throw new Error("Workspace ID no encontrado en la solicitud.");
      
      const counterRef = doc(firestore, `${collectionPrefix}/counters`, 'remitoCounter');
      const counterSnap = await transaction.get(counterRef);
      const lastNumber = counterSnap.exists() ? counterSnap.data().lastNumber : 0;
      const newRemitoNumber = lastNumber + 1;
      const formattedRemitoNumber = `R-${String(newRemitoNumber).padStart(5, '0')}`;
      transaction.set(counterRef, { lastNumber: newRemitoNumber }, { merge: true });

      const itemsToDeliver = data.items.filter(item => item.toDeliver > 0);
      let newTotalValue = 0;

      for (const item of itemsToDeliver) {
          const product = productMap.get(item.productId);
          if (!product) throw new Error(`Producto ${item.productName} no encontrado.`);

          const inventoryDocId = `${item.productId}_${request.depositId}`;
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory`, inventoryDocId);
          
          const stockSnap = await transaction.get(stockDocRef);
          const currentStock = stockSnap.exists() ? stockSnap.data().quantity : 0;
          
          if (item.toDeliver > currentStock) {
              throw new Error(`Stock insuficiente para ${item.productName}. Inténtalo de nuevo.`);
          }
          
          transaction.set(stockDocRef, {
              quantity: increment(-item.toDeliver),
              lastUpdated: serverTimestamp(),
              productId: item.productId,
              depositId: request.depositId,
          }, { merge: true });

          newTotalValue += (product.price || 0) * item.toDeliver;
      }

      const newMovementRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));
      const newMovementItems: StockMovementItem[] = itemsToDeliver.map(item => {
           const product = productMap.get(item.productId)!;
           return {
               productId: item.productId,
               productName: item.productName,
               quantity: item.toDeliver,
               unit: item.unit,
               price: product.price || 0,
               total: (product.price || 0) * item.toDeliver,
           };
      });
      
      transaction.set(newMovementRef, {
          id: newMovementRef.id,
          remitoNumber: formattedRemitoNumber,
          type: 'salida',
          depositId: request.depositId,
          depositName: request.depositName,
          actorId: request.actorId,
          actorName: request.actorName,
          actorType: 'user',
          createdAt: serverTimestamp(),
          userId: user.uid,
          items: newMovementItems,
          totalValue: newTotalValue,
          processedFromRequestId: request.id,
      });

      const originalRequestRef = doc(firestore, `${collectionPrefix}/stockMovements`, request.id);
      transaction.delete(originalRequestRef);
    })
    .then(() => {
        toast({
            title: 'Remito Generado',
            description: 'El remito de salida ha sido creado y el stock actualizado.',
        });
        onProcessed();
    })
    .catch((error: any) => {
        // Emit the contextual error instead of using console.error
        const permissionError = new FirestorePermissionError({
            path: collectionPrefix,
            operation: 'write', // 'write' is a good generic for transactions
            requestResourceData: {
                originalRequestId: request.id,
                itemsToDeliver: data.items,
            },
        });
        errorEmitter.emit('permission-error', permissionError);
    })
    .finally(() => {
        setIsSubmitting(false);
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Procesar Pedido {request.remitoNumber}</DialogTitle>
          <DialogDescription>
            Ajusta las cantidades a entregar según el stock disponible en el depósito.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-secondary">
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-center">Solicitado</TableHead>
                    <TableHead className="text-center">En Stock</TableHead>
                    <TableHead className="w-[150px] text-center">A Entregar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium">{form.getValues(`items.${index}.productName`)}</TableCell>
                      <TableCell className="text-center">
                        {form.getValues(`items.${index}.requested`)} {form.getValues(`items.${index}.unit`)}
                      </TableCell>
                      <TableCell className="text-center">
                        {form.getValues(`items.${index}.inStock`)} {form.getValues(`items.${index}.unit`)}
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`items.${index}.toDeliver`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input type="number" {...field} className="text-center"/>
                              </FormControl>
                              <FormMessage className="text-xs"/>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
             {form.formState.errors.items && (
                  <p className="text-sm font-medium text-destructive mt-2">
                    {form.formState.errors.items.root?.message}
                  </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generar Remito de Salida
              </Button>
            </DialogFooter>
          </form>
        </Form>

      </DialogContent>
    </Dialog>
  );
}
