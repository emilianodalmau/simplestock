
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
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { StockMovement, InventoryStock, Product, StockMovementItem } from '@/types/inventory';

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
);


type ProcessRequestFormValues = z.infer<typeof processRequestFormSchema>;

interface ProcessRequestDialogProps {
  request: StockMovement;
  inventory: InventoryStock[];
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: ProcessRequestFormValues) => void;
}

export function ProcessRequestDialog({
  request,
  inventory,
  products,
  isOpen,
  onClose,
  onSubmit,
}: ProcessRequestDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const preparedItems = useMemo(() => {
    const productMap = new Map(products.map(p => [p.id, p]));
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
  }, [request, inventory, products]);
  
  const form = useForm<ProcessRequestFormValues>({
    resolver: zodResolver(processRequestFormSchema),
    defaultValues: {
      items: preparedItems,
    },
  });

  useEffect(() => {
    form.reset({ items: preparedItems });
  }, [preparedItems, form]);

  const { fields } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  
  const handleFormSubmit: SubmitHandler<ProcessRequestFormValues> = (data) => {
    // In the next step, this will trigger the Firestore transaction.
    onSubmit(data);
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
                    {form.formState.errors.items.message}
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
