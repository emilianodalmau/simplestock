
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, useFieldArray, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import {
  collection,
  runTransaction,
  doc,
  serverTimestamp,
  query,
  where,
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, PlusCircle } from 'lucide-react';
import { ProductComboBox } from '@/components/ui/product-combobox';
import type {
  Product,
  Deposit,
  UserProfile,
  StockMovementItem,
  InventoryStock,
} from '@/types/inventory';

// --- Zod Schemas ---
const requestItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto.'),
  quantity: z.coerce.number().min(0.1, 'La cantidad debe ser mayor a 0.'),
});

const requestFormSchema = z.object({
  depositId: z.string().min(1, 'Selecciona un depósito.'),
  actorId: z.string().min(1, 'Debes ser un usuario registrado para solicitar.'),
  items: z.array(requestItemSchema).min(1, 'Debes agregar al menos un producto.'),
});

type RequestFormValues = z.infer<typeof requestFormSchema>;


// --- Skeleton Component ---
function SolicitudesPageSkeleton() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="border rounded-md p-4 space-y-4">
            <div className="grid grid-cols-[1fr_150px_auto] gap-2 items-start">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-10" />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-40" />
        </CardFooter>
      </Card>
    </div>
  );
}

// --- Main Page Component ---
export default function SolicitudesPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const canCreateRequest = useMemo(() => {
    if (!currentUserProfile?.role) return false;
    return currentUserProfile.role === 'solicitante';
  }, [currentUserProfile?.role]);

  const workspaceId = currentUserProfile?.workspaceId;

  const collectionPrefix = useMemo(() => {
    if (!workspaceId) return null;
    return `workspaces/${workspaceId}`;
  }, [workspaceId]);

  const productsCollection = useMemoFirebase(
    () =>
      firestore && collectionPrefix
        ? query(
            collection(firestore, `${collectionPrefix}/products`),
            where('isArchived', '!=', true)
          )
        : null,
    [firestore, collectionPrefix]
  );
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsCollection);

  const depositsCollection = useMemoFirebase(
    () =>
      firestore && collectionPrefix
        ? collection(firestore, `${collectionPrefix}/deposits`)
        : null,
    [firestore, collectionPrefix]
  );
  const { data: deposits, isLoading: isLoadingDeposits } =
    useCollection<Deposit>(depositsCollection);

  const inventoryCollection = useMemoFirebase(
    () =>
      firestore && collectionPrefix
        ? collection(firestore, `${collectionPrefix}/inventory`)
        : null,
    [firestore, collectionPrefix]
  );
  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryCollection);

  const isLoading =
    isLoadingProfile ||
    isLoadingProducts ||
    isLoadingDeposits ||
    isLoadingInventory;

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      depositId: '',
      actorId: user?.uid || '',
      items: [{ productId: '', quantity: 1 }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const selectedDepositId = form.watch('depositId');

  useEffect(() => {
    if (user?.uid) {
      form.setValue('actorId', user.uid);
    }
  }, [user, form]);

  useEffect(() => {
    replace([{ productId: '', quantity: 1 }]);
  }, [selectedDepositId, replace]);

  const productsMap = useMemo(
    () => new Map(products?.map((p) => [p.id, p])),
    [products]
  );

  const inventoryByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!inventory || !selectedDepositId) return map;

    inventory.forEach((stock) => {
      if (stock.depositId === selectedDepositId) {
        map.set(
          stock.productId,
          (map.get(stock.productId) || 0) + stock.quantity
        );
      }
    });
    return map;
  }, [inventory, selectedDepositId]);

  const availableProductsForRequest = useMemo(() => {
    if (!products || !selectedDepositId || !inventory) return [];

    const productsWithStock = new Set(
      inventory
        ?.filter(
          (stock) => stock.depositId === selectedDepositId && stock.quantity > 0
        )
        .map((stock) => stock.productId)
    );

    return products.filter(
      (product) => !product.isArchived && productsWithStock.has(product.id)
    );
  }, [selectedDepositId, products, inventory]);

  const onSubmit: SubmitHandler<RequestFormValues> = async (data) => {
    if (
      !firestore ||
      !user ||
      !productsMap.size ||
      !canCreateRequest ||
      !collectionPrefix ||
      !currentUserProfile
    )
      return;

    for (const item of data.items) {
      const availableStock = inventoryByProduct.get(item.productId) || 0;
      if (item.quantity > availableStock) {
        toast({
          variant: 'destructive',
          title: 'Stock Insuficiente',
          description: `No hay stock suficiente para ${
            productsMap.get(item.productId)?.name
          }. Solicitados: ${item.quantity}, Disponible: ${availableStock}.`,
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      await runTransaction(firestore, async (transaction) => {
        const counterRef = doc(
          firestore,
          `${collectionPrefix}/counters`,
          'remitoCounter'
        );
        const counterSnap = await transaction.get(counterRef);

        const lastNumber = counterSnap.exists()
          ? counterSnap.data().lastNumber
          : 0;
        const newRemitoNumber = lastNumber + 1;
        const formattedRemitoNumber = `S-${String(newRemitoNumber).padStart(
          5,
          '0'
        )}`;
        transaction.set(
          counterRef,
          { lastNumber: newRemitoNumber },
          { merge: true }
        );

        const movementItemsForDoc: StockMovementItem[] = data.items.map(
          (item) => {
            const product = productsMap.get(item.productId);
            return {
              productId: item.productId,
              productName: product?.name || 'N/A',
              quantity: item.quantity,
              unit: product?.unit || 'N/A',
              price: product?.price || 0,
              total: (product?.price || 0) * item.quantity,
            };
          }
        );

        const totalValue = movementItemsForDoc.reduce(
          (sum, item) => sum + item.total,
          0
        );

        const deposit = deposits?.find((d) => d.id === data.depositId);
        const actorName =
          `${currentUserProfile?.firstName || ''} ${
            currentUserProfile?.lastName || ''
          }`.trim();

        const movementRef = doc(
          collection(firestore, `${collectionPrefix}/stockMovements`)
        );

        transaction.set(movementRef, {
          id: movementRef.id,
          remitoNumber: formattedRemitoNumber,
          type: 'salida',
          depositId: data.depositId,
          depositName: deposit?.name || 'N/A',
          actorId: data.actorId,
          actorName: actorName,
          actorType: 'user',
          createdAt: serverTimestamp(),
          userId: user.uid,
          items: movementItemsForDoc,
          totalValue: totalValue,
        });
      });

      toast({
        title: 'Solicitud Enviada',
        description: `Tu pedido ha sido enviado para su aprobación.`,
      });
      form.reset({
        depositId: '',
        actorId: user.uid,
        items: [{ productId: '', quantity: 1 }],
      });
    } catch (error: any) {
      console.error('Error procesando la solicitud:', error);
      toast({
        variant: 'destructive',
        title: 'Error en la transacción',
        description:
          error.message || 'Ocurrió un error al procesar el pedido.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <SolicitudesPageSkeleton />;
  }

  if (!canCreateRequest) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>
              No tienes los permisos necesarios para crear solicitudes.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Portal de Solicitudes
        </h1>
        <p className="text-muted-foreground">
          Crea un pedido de productos para que un Jefe de Depósito lo apruebe.
        </p>
      </div>
      
      <Card>
          <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
              <CardTitle>Crear Pedido de Productos</CardTitle>
              <CardDescription>
                  Completa el formulario para generar una solicitud. El stock
                  disponible se mostrará al seleccionar un producto.
              </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                  control={form.control}
                  name="depositId"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Depósito de Origen</FormLabel>
                      <Select
                          onValueChange={field.onChange}
                          value={field.value}
                      >
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
                  name="actorId"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Solicitante</FormLabel>
                      <FormControl>
                          <Input
                          value={`${
                              currentUserProfile?.firstName || ''
                          } ${currentUserProfile?.lastName || ''}`.trim()}
                          disabled
                          />
                      </FormControl>
                      <FormMessage />
                      </FormItem>
                  )}
                  />
              </div>
              <Separator />
              <div>
                  <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">
                      Productos a Solicitar
                  </h3>
                  <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ productId: '', quantity: 1 })}
                      disabled={!selectedDepositId}
                  >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Agregar Producto
                  </Button>
                  </div>
                  <div className="space-y-4">
                  {fields.map((field, index) => {
                      const selectedProductId = form.watch(
                      `items.${index}.productId`
                      );
                      const availableStock =
                      inventoryByProduct.get(selectedProductId) || 0;
                      const productUnit =
                      productsMap.get(selectedProductId)?.unit || '';

                      return (
                      <div
                          key={field.id}
                          className="grid grid-cols-[1fr_120px_auto] sm:grid-cols-[1fr_150px_auto] gap-2 items-start p-4 border rounded-md relative"
                      >
                          <FormField
                          control={form.control}
                          name={`items.${index}.productId`}
                          render={({ field }) => (
                              <FormItem>
                              <FormLabel className="sr-only">
                                  Producto
                              </FormLabel>
                              <ProductComboBox
                                  products={availableProductsForRequest}
                                  value={field.value}
                                  onChange={field.onChange}
                                  disabled={!selectedDepositId}
                                  noStockMessage={
                                  !!selectedDepositId
                                      ? 'No hay productos con stock.'
                                      : 'Selecciona un depósito primero'
                                  }
                              />
                              <FormMessage />
                              </FormItem>
                          )}
                          />
                          <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                              <FormItem>
                              <FormLabel className="sr-only">
                                  Cantidad
                              </FormLabel>
                              <FormControl>
                                  <Input
                                  type="number"
                                  placeholder="Cantidad"
                                  {...field}
                                  />
                              </FormControl>
                              <FormMessage />
                              </FormItem>
                          )}
                          />
                          <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          className="text-destructive hover:bg-destructive/10"
                          >
                          <Trash2 className="h-4 w-4" />
                          </Button>
                          {selectedProductId && (
                          <div className="col-span-full text-sm text-muted-foreground pt-2">
                              Stock disponible:{' '}
                              <span className="font-medium text-foreground">
                              {availableStock} {productUnit}
                              </span>
                          </div>
                          )}
                      </div>
                      );
                  })}
                  {form.formState.errors.items && (
                      <p className="text-sm font-medium text-destructive mt-2">
                      {typeof form.formState.errors.items === 'string'
                          ? form.formState.errors.items
                          : (form.formState.errors.items as any).root?.message}
                      </p>
                  )}
                  </div>
              </div>
              </CardContent>
              <CardFooter>
              <Button
                  type="submit"
                  disabled={
                  isSubmitting ||
                  !selectedDepositId ||
                  !form.formState.isValid
                  }
              >
                  {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Enviar Solicitud
              </Button>
              </CardFooter>
          </form>
          </Form>
      </Card>
    </div>
  );
}
