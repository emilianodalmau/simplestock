
'use client';

import { useState, useMemo } from 'react';
import {
  useForm,
  useFieldArray,
  type SubmitHandler,
  Controller,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import {
  collection,
  writeBatch,
  doc,
  serverTimestamp,
  runTransaction,
  query,
  where,
  getDocs,
  increment,
  addDoc,
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

// Data types from Firestore
type Product = { id: string; name: string; unit: string };
type Deposit = { id: string; name: string };
type InventoryStock = { id: string; productId: string; depositId: string; quantity: number };

// Zod schema for a single item in the movement
const movementItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto.'),
  quantity: z.coerce.number().min(0.1, 'La cantidad debe ser mayor a 0.'),
});

// Zod schema for the main form
const movementFormSchema = z.object({
  type: z.enum(['entrada', 'salida'], {
    required_error: 'El tipo de movimiento es requerido.',
  }),
  depositId: z.string().min(1, 'Selecciona un depósito.'),
  items: z.array(movementItemSchema).min(1, 'Debes agregar al menos un producto.'),
});

type MovementFormValues = z.infer<typeof movementFormSchema>;

// Component for the loading state
function MovementFormSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Separator />
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <Skeleton className="h-6 w-1/4" />
                <Skeleton className="h-9 w-24" />
            </div>
            <div className="border rounded-md p-4">
                <div className="grid grid-cols-3 gap-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-10" />
                </div>
            </div>
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-10 w-32" />
      </CardFooter>
    </Card>
  );
}

// Main page component
export default function MovimientosPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  // --- Data Loading ---
  const productsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'products') : null, [firestore]);
  const depositsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'deposits') : null, [firestore]);
  const inventoryCollection = useMemoFirebase(() => firestore ? collection(firestore, 'inventory') : null, [firestore]);
  
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(productsCollection);
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsCollection);
  const { data: inventory, isLoading: isLoadingInventory } = useCollection<InventoryStock>(inventoryCollection);

  const isLoading = isLoadingProducts || isLoadingDeposits || isLoadingInventory;

  // --- Form Setup ---
  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: {
      type: 'salida',
      depositId: '',
      items: [{ productId: '', quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const selectedDepositId = form.watch('depositId');
  const movementType = form.watch('type');

  // --- Data Processing for UI ---
  const productsMap = useMemo(() => new Map(products?.map(p => [p.id, p])), [products]);
  
  const stockByDepositAndProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!inventory) return map;
    inventory.forEach(stock => {
      const key = `${stock.depositId}-${stock.productId}`;
      map.set(key, stock.quantity);
    });
    return map;
  }, [inventory]);

  // --- Form Submission Logic ---
  const onSubmit: SubmitHandler<MovementFormValues> = async (data) => {
    if (!firestore || !user) return;
    setIsSubmitting(true);

    try {
      await runTransaction(firestore, async (transaction) => {
        const movementRef = doc(collection(firestore, 'stockMovements'));
        const movementItems = [];
        
        // Step 1: Validate stock and prepare inventory updates
        for (const item of data.items) {
          const product = productsMap.get(item.productId);
          if (!product) throw new Error(`Producto no encontrado: ${item.productId}`);
          
          movementItems.push({
            productId: product.id,
            productName: product.name,
            quantity: item.quantity,
            unit: product.unit,
          });

          const inventoryQuery = query(
            collection(firestore, 'inventory'),
            where('depositId', '==', data.depositId),
            where('productId', '==', item.productId)
          );

          const inventorySnap = await getDocs(inventoryQuery);
          const stockDoc = inventorySnap.docs[0];

          if (data.type === 'salida') {
            if (!stockDoc || stockDoc.data().quantity < item.quantity) {
              throw new Error(`Stock insuficiente para ${product.name} en el depósito seleccionado.`);
            }
            transaction.update(stockDoc.ref, { quantity: increment(-item.quantity) });
          } else { // entrada
            if (stockDoc) {
              transaction.update(stockDoc.ref, { quantity: increment(item.quantity) });
            } else {
              // This is the first entry of this product in this deposit
              const newStockRef = doc(collection(firestore, 'inventory'));
              transaction.set(newStockRef, {
                depositId: data.depositId,
                productId: item.productId,
                quantity: item.quantity,
                lastUpdated: serverTimestamp(),
              });
            }
          }
        }
        
        // Step 2: Create the movement document
        const deposit = deposits?.find(d => d.id === data.depositId);

        transaction.set(movementRef, {
          type: data.type,
          depositId: data.depositId,
          depositName: deposit?.name || 'N/A',
          createdAt: serverTimestamp(),
          userId: user.uid,
          items: movementItems,
        });
      });

      toast({
        title: 'Movimiento Registrado',
        description: `El movimiento de ${data.type} ha sido registrado correctamente.`,
      });
      form.reset({
        type: 'salida',
        depositId: '',
        items: [{ productId: '', quantity: 1 }],
      });

    } catch (error: any) {
      console.error('Error procesando el movimiento:', error);
      toast({
        variant: 'destructive',
        title: 'Error en el movimiento',
        description: error.message || 'Ocurrió un error al procesar la transacción.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
        <div className="container mx-auto p-4 sm:p-6 md:p-8">
            <MovementFormSkeleton />
        </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Registrar Movimiento de Stock</CardTitle>
              <CardDescription>
                Completa el formulario para registrar una entrada o salida de productos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Movimiento</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="salida">Salida</SelectItem>
                          <SelectItem value="entrada">Entrada</SelectItem>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un depósito" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {deposits?.map((deposit) => (
                            <SelectItem key={deposit.id} value={deposit.id}>
                              {deposit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">Productos del Remito</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ productId: '', quantity: 1 })}
                    disabled={!selectedDepositId}
                  >
                    Agregar Producto
                  </Button>
                </div>

                {!selectedDepositId && (
                    <p className="text-sm text-center text-muted-foreground p-4 border rounded-md">
                        Selecciona un depósito para poder agregar productos.
                    </p>
                )}

                {selectedDepositId && (
                    <div className="space-y-4">
                    {fields.map((field, index) => {
                        const selectedProductId = form.watch(`items.${index}.productId`);
                        const product = productsMap.get(selectedProductId);
                        const stock = stockByDepositAndProduct.get(`${selectedDepositId}-${selectedProductId}`) || 0;

                        return (
                        <div key={field.id} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_150px_150px_auto] gap-2 items-start border p-4 rounded-md relative">
                            <FormField
                            control={form.control}
                            name={`items.${index}.productId`}
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="sr-only">Producto</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un producto" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                    {products?.map((p) => (
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
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="sr-only">Cantidad</FormLabel>
                                    <FormControl>
                                        <Input type="number" placeholder="Cantidad" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                            />
                            <div className="hidden sm:flex items-center h-10 px-3 text-sm text-muted-foreground">
                                {product ? `${product.unit}` : ''}
                                {movementType === 'salida' && product && ` (Stock: ${stock})`}
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                className="text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        );
                    })}
                    </div>
                )}

                {form.formState.errors.items?.root && (
                     <p className="text-sm font-medium text-destructive mt-2">
                        {form.formState.errors.items.root.message}
                    </p>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar Movimiento
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
