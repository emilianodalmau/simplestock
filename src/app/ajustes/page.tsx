'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Dummy data for now
const products = [
  { id: '1', name: 'Producto A' },
  { id: '2', name: 'Producto B' },
];
const deposits = [
  { id: '1', name: 'Depósito Central' },
  { id: '2', name: 'Depósito Secundario' },
];

const adjustmentSchema = z.object({
  productId: z.string().min(1, 'Debe seleccionar un producto.'),
  depositId: z.string().min(1, 'Debe seleccionar un depósito.'),
  actualQuantity: z.coerce.number().min(0, 'La cantidad no puede ser negativa.'),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

export default function AjustesPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [currentStock, setCurrentStock] = useState<number | null>(null);

  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      productId: '',
      depositId: '',
      actualQuantity: 0,
    },
  });

  const selectedProduct = form.watch('productId');
  const selectedDeposit = form.watch('depositId');

  // Simulate fetching current stock
  useState(() => {
    if (selectedProduct && selectedDeposit) {
      // In a real scenario, you would fetch this from Firestore
      const dummyStock = Math.floor(Math.random() * 100);
      setCurrentStock(dummyStock);
    } else {
      setCurrentStock(null);
    }
  });

  const onSubmit = async (data: AdjustmentFormValues) => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const stockDifference = data.actualQuantity - (currentStock ?? 0);

    toast({
      title: 'Ajuste Registrado',
      description: `Se registró un ajuste de ${stockDifference} unidades para el producto seleccionado en el depósito.`,
    });
    
    form.reset();
    setCurrentStock(null);
    setIsSubmitting(false);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Ajustes de Inventario</h1>
        <p className="text-muted-foreground">
          Corrige el stock de un producto para que coincida con el recuento físico.
        </p>
      </div>

      <Card className="max-w-2xl mx-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Nuevo Ajuste de Stock</CardTitle>
              <CardDescription>
                Selecciona el producto y el depósito, y luego ingresa la cantidad contada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Producto</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un producto" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="depositId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Depósito</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un depósito" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {deposits.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {currentStock !== null && (
                <div className="p-4 bg-secondary rounded-md">
                  <p className="text-center font-medium">
                    Stock Actual en Sistema: <span className="text-lg font-bold">{currentStock}</span>
                  </p>
                </div>
              )}

              <FormField
                control={form.control}
                name="actualQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad Real Contada</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Ingresa la cantidad física"
                        {...field}
                        disabled={!selectedProduct || !selectedDeposit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting || currentStock === null}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar Ajuste
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
