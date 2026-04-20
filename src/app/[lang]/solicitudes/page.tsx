
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
  collection,
  runTransaction,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  increment,
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
  Workspace,
  StockMovement,
} from '@/types/inventory';
import { useI18n } from '@/i18n/i18n-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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

const statusConfig = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-500 text-black' },
  procesado: { label: 'Procesado', color: 'bg-green-500 text-white' },
  cancelado: { label: 'Cancelado', color: 'bg-red-500 text-white' },
};


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

// --- History Component ---
function RequestHistory({ userId, collectionPrefix }: { userId: string; collectionPrefix: string | null }) {
    const firestore = useFirestore();

    const historyQuery = useMemoFirebase(() => {
        if (!firestore || !collectionPrefix) return null;
        // This query must match the firestore.rules for 'solicitante'
        return query(
            collection(firestore, `${collectionPrefix}/stockMovements`),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc')
        );
    }, [firestore, collectionPrefix, userId]);

    const { data: requests, isLoading } = useCollection<StockMovement>(historyQuery);

    const userRequests = useMemo(() => {
        if (!requests) return [];
        // Further filter client-side just in case, as the main 'type' is salida
        return requests.filter(req => req.remitoNumber?.startsWith('S-'));
    }, [requests]);
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Historial de Solicitudes</CardTitle>
                <CardDescription>
                    Aquí puedes ver el estado de todas las solicitudes que has realizado.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Pedido Nº</TableHead>
                            <TableHead>Depósito</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Nº de Ítems</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && [...Array(3)].map((_, i) => (
                             <TableRow key={i}>
                                <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                             </TableRow>
                        ))}
                        {!isLoading && userRequests.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No has realizado ninguna solicitud todavía.
                                </TableCell>
                            </TableRow>
                        )}
                        {!isLoading && userRequests.map(req => {
                            const status = req.status || 'pendiente';
                            const config = statusConfig[status as keyof typeof statusConfig] || { label: 'Desconocido', color: 'bg-gray-400' };
                            return (
                                <TableRow key={req.id}>
                                    <TableCell>{format(req.createdAt.toDate(), 'dd/MM/yyyy HH:mm')}</TableCell>
                                    <TableCell className="font-mono">{req.remitoNumber}</TableCell>
                                    <TableCell>{req.depositName}</TableCell>
                                    <TableCell>
                                        <Badge className={config.color}>{config.label}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{req.items.length}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>
    );
}

// --- Main Page Component ---
export default function SolicitudesPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { dictionary } = useI18n();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const canCreateRequest = useMemo(() => {
    if (!currentUserProfile?.role) return false;
    return ['solicitante', 'jefe_deposito'].includes(currentUserProfile.role);
  }, [currentUserProfile?.role]);

  const workspaceId = currentUserProfile?.workspaceId;

  const collectionPrefix = useMemo(() => {
    if (!workspaceId) return null;
    return `workspaces/${workspaceId}`;
  }, [workspaceId]);

  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId ? doc(firestore, `workspaces/${workspaceId}`) : null),
    [firestore, workspaceId]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

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
    isLoadingInventory ||
    isLoadingWorkspace;

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
    if (!products || !selectedDepositId) return [];
    
    // If stock visibility is off, show all products of the deposit.
    if (workspaceData?.showStockToRequesters === false) {
      return products.filter(p => !p.isArchived && (p.depositIds || []).includes(selectedDepositId));
    }

    // If stock visibility is on, only show products with stock.
    if (!inventory) return [];
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
  }, [selectedDepositId, products, inventory, workspaceData]);

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
    
    if (workspaceData?.showStockToRequesters !== false) {
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
          status: 'pendiente', // Add status
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

        // Update stats document
        const statsRef = doc(firestore, `${collectionPrefix}/metadata`, 'stats');
        transaction.set(statsRef, {
            pendingRequestsCount: increment(1),
            lastUpdated: serverTimestamp(),
        }, { merge: true });
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
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          {dictionary.pages.solicitudes.title}
        </h1>
        <p className="text-muted-foreground">
          {dictionary.pages.solicitudes.description}
        </p>
      </div>
      
      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Crear Solicitud</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
            <Card className="mt-6">
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
                                            ? 'No hay productos disponibles.'
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
                                {selectedProductId && (workspaceData?.showStockToRequesters ?? true) && (
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
        </TabsContent>
        <TabsContent value="history">
            {user && <RequestHistory userId={user.uid} collectionPrefix={collectionPrefix} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

