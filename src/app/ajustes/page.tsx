
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
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
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import {
  collection,
  doc,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type { Product, Deposit, UserProfile, InventoryStock } from '@/types/inventory';
import { ProductComboBox } from '@/components/ui/product-combobox';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


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
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  const firestore = useFirestore();
  const { user } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile } = useDoc<UserProfile>(currentUserDocRef);
  const workspaceId = currentUserProfile?.workspaceId;

  const collectionPrefix = useMemo(() => {
    if (!workspaceId) return null;
    return `workspaces/${workspaceId}`;
  }, [workspaceId]);

  const productsCollection = useMemoFirebase(
    () =>
      firestore && collectionPrefix
        ? query(collection(firestore, `${collectionPrefix}/products`), where('isArchived', '!=', true))
        : null,
    [firestore, collectionPrefix]
  );
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(productsCollection);

  const depositsCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/deposits`) : null),
    [firestore, collectionPrefix]
  );
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsCollection);


  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      productId: '',
      depositId: '',
      actualQuantity: 0,
    },
  });

  const selectedProductId = form.watch('productId');
  const selectedDepositId = form.watch('depositId');

  useEffect(() => {
    const fetchCurrentStock = async () => {
      if (selectedProductId && selectedDepositId && firestore && collectionPrefix) {
        setIsLoadingStock(true);
        setCurrentStock(null);
        try {
          const inventoryDocId = `${selectedProductId}_${selectedDepositId}`;
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${inventoryDocId}`);
          await runTransaction(firestore, async (transaction) => {
            const stockDoc = await transaction.get(stockDocRef);
            if (stockDoc.exists()) {
              setCurrentStock(stockDoc.data().quantity);
            } else {
              setCurrentStock(0);
            }
          });
        } catch (error) {
          console.error("Error al obtener el stock:", error);
          setCurrentStock(null);
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo obtener el stock actual.',
          });
        } finally {
          setIsLoadingStock(false);
        }
      } else {
        setCurrentStock(null);
      }
    };

    fetchCurrentStock();
  }, [selectedProductId, selectedDepositId, firestore, collectionPrefix, toast]);

  const onSubmit: SubmitHandler<AdjustmentFormValues> = async (data) => {
    if (!firestore || !collectionPrefix || currentStock === null || !user) return;
    setIsSubmitting(true);
    
    const { productId, depositId, actualQuantity } = data;
    const stockDifference = actualQuantity - currentStock;

    if (stockDifference === 0) {
      toast({
        title: 'Sin Cambios',
        description: 'La cantidad real es igual al stock del sistema. No se realizó ningún ajuste.',
      });
      setIsSubmitting(false);
      return;
    }

    try {
      await runTransaction(firestore, async (transaction) => {
        const product = products?.find(p => p.id === productId);
        const deposit = deposits?.find(d => d.id === depositId);
        
        if (!product || !deposit) {
            throw new Error("Producto o depósito no encontrado.");
        }

        // 1. Update Inventory Stock
        const inventoryDocId = `${productId}_${depositId}`;
        const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${inventoryDocId}`);
        transaction.set(stockDocRef, 
            { 
                quantity: actualQuantity,
                lastUpdated: serverTimestamp(),
                productId: productId,
                depositId: depositId,
            }, 
            { merge: true }
        );

        // 2. Create Stock Movement for Auditing
        const movementRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));
        const movementData = {
          id: movementRef.id,
          remitoNumber: `AJ-${Date.now()}`,
          type: 'ajuste' as const,
          depositId: depositId,
          depositName: deposit.name,
          actorName: `Ajuste manual por ${user.displayName || user.email}`,
          actorId: user.uid,
          createdAt: serverTimestamp(),
          userId: user.uid,
          totalValue: 0, 
          items: [{
            productId: productId,
            productName: product.name,
            quantity: stockDifference, 
            unit: product.unit,
            price: product.price,
            total: product.price * stockDifference,
          }],
        };
        transaction.set(movementRef, movementData);
      });
      
      toast({
        title: 'Ajuste Registrado',
        description: `Se registró un ajuste de ${stockDifference} ${products?.find(p => p.id === productId)?.unit || 'unidades'} para el producto seleccionado.`,
      });
      
      form.reset({
        productId: '',
        depositId: '',
        actualQuantity: 0
      });
      setCurrentStock(null);

    } catch (error: any) {
        console.error("Error procesando el ajuste:", error);
        const permissionError = new FirestorePermissionError({
            path: `${collectionPrefix}/inventory/${productId}_${depositId}`,
            operation: 'write',
            requestResourceData: { quantity: actualQuantity },
        });
        errorEmitter.emit('permission-error', permissionError);
    } finally {
        setIsSubmitting(false);
    }
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
                  name="depositId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Depósito</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingDeposits}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un depósito" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {deposits?.map((d) => (
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
                <FormField
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Producto</FormLabel>
                       <ProductComboBox
                          products={products || []}
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isLoadingProducts || !selectedDepositId}
                          noStockMessage={!selectedDepositId ? "Selecciona un depósito" : "Selecciona un producto"}
                        />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {(isLoadingStock || currentStock !== null) && (
                <div className="p-4 bg-secondary rounded-md text-center">
                  <p className="font-medium">
                    Stock Actual en Sistema:
                  </p>
                  {isLoadingStock ? <Loader2 className="h-6 w-6 animate-spin inline-block mt-1" /> : <span className="text-lg font-bold">{currentStock}</span>}
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
                        disabled={currentStock === null || isLoadingStock}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting || currentStock === null || isLoadingStock}>
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
