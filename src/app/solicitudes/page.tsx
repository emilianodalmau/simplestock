
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
  increment,
  query,
  where,
  deleteDoc,
  startAt,
  endAt,
  orderBy,
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
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RemitoActions } from '@/components/remito-actions';
import type { AppSettings } from '@/types/settings';

// --- Data Types ---
type Product = {
  id: string;
  name: string;
  unit: string;
  code: string;
  price: number;
  isArchived?: boolean;
};
type Deposit = { id: string; name: string; jefeId?: string; };
type UserProfile = { 
  id: string;
  firstName?: string;
  lastName?: string;
  role?: 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'solicitante';
  workspaceId?: string;
};
export type StockMovementItem = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
};
export type StockMovement = {
  id: string;
  remitoNumber?: string;
  type: 'entrada' | 'salida';
  depositId: string;
  depositName: string;
  actorName?: string;
  userId: string;
  createdAt: {
    toDate: () => Date;
  };
  items: StockMovementItem[];
  totalValue: number;
};
type InventoryStock = {
  id: string;
  productId: string;
  depositId: string;
  quantity: number;
};
type Workspace = {
    appName?: string;
    logoUrl?: string;
}

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
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/3" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main Page Component ---
export default function SolicitudesPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfSettings, setPdfSettings] = useState<AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string } | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [assignedDepositId, setAssignedDepositId] = useState<string | null>(null);


  // --- Data Loading ---
  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(currentUserDocRef);
  const isJefeDeposito = currentUserProfile?.role === 'jefe_deposito';
  const workspaceId = currentUserProfile?.workspaceId;
  
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId ? doc(firestore, 'workspaces', workspaceId) : null),
    [firestore, workspaceId]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);
  
  // --- Settings Loading for PDF ---
  useEffect(() => {
    if (!isLoadingWorkspace) {
        setPdfSettings({
            appName: workspaceData?.appName || 'Inventario',
            logoUrl: workspaceData?.logoUrl || '',
            workspaceAppName: workspaceData?.appName,
            workspaceLogoUrl: workspaceData?.logoUrl,
        });
    }
  }, [workspaceData, isLoadingWorkspace]);


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
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsCollection);

  const depositsCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/deposits`) : null),
    [firestore, collectionPrefix]
  );
  const { data: deposits, isLoading: isLoadingDeposits } =
    useCollection<Deposit>(depositsCollection);
    
  useEffect(() => {
    if (isJefeDeposito && deposits) {
      const assignedDeposit = deposits.find(d => d.jefeId === user?.uid);
      setAssignedDepositId(assignedDeposit?.id || null);
    }
  }, [isJefeDeposito, deposits, user]);


  const inventoryCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/inventory`) : null),
    [firestore, collectionPrefix]
  );
  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryCollection);

 const movementsQuery = useMemoFirebase(() => {
    if (!firestore || !user || !collectionPrefix || !currentUserProfile) return null;

    const movementsCollectionRef = collection(firestore, `${collectionPrefix}/stockMovements`);
    const userRole = currentUserProfile.role;

    if (userRole === 'administrador' || userRole === 'editor') {
      // Admins and Editors can see all 'S-' movements
      return query(
        movementsCollectionRef,
        orderBy('remitoNumber'),
        startAt('S-'),
        endAt('S-\uf8ff')
      );
    }
    
    if (userRole === 'solicitante' || userRole === 'jefe_deposito') {
        // Solicitantes and Jefes MUST query by their own userId to comply with security rules
        return query(movementsCollectionRef, where('userId', '==', user.uid));
    }
    
    return null; // Default to no query if no appropriate role
 }, [firestore, user, currentUserProfile, collectionPrefix]);

 const { data: movements, isLoading: isLoadingMovements } = useCollection<StockMovement>(movementsQuery);

  const filteredMovements = useMemo(() => {
      if (!movements || !currentUserProfile) return [];
      
      const userRole = currentUserProfile.role;
      // For non-admins/editors, we need to manually filter for 'S-' remitos
      // because their queries might fetch other types of movements (e.g., 'R-')
      if (userRole === 'solicitante' || userRole === 'jefe_deposito') {
          return movements.filter(mov => mov.remitoNumber?.startsWith('S-'));
      }
      
      // Admins/Editors already have their data pre-filtered by the query
      return movements;
  }, [movements, currentUserProfile]);
  
  const isLoading =
    isLoadingProfile ||
    isLoadingProducts ||
    isLoadingDeposits ||
    isLoadingInventory ||
    isLoadingMovements ||
    isLoadingWorkspace;

  // --- Form Setup ---
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
  
  // Set the actorId and depositId if user is Jefe
  useEffect(() => {
    if (user?.uid) {
        form.setValue('actorId', user.uid);
    }
    if (isJefeDeposito && assignedDepositId) {
        form.setValue('depositId', assignedDepositId);
    }
  }, [user, form, isJefeDeposito, assignedDepositId]);

  // --- Effects ---
  useEffect(() => {
    replace([{ productId: '', quantity: 1 }]);
  }, [selectedDepositId, replace]);

  // --- Data Memoization for UI ---
  const productsMap = useMemo(() => new Map(products?.map((p) => [p.id, p])), [
    products,
  ]);
  
  const inventoryByProduct = useMemo(() => {
      const map = new Map<string, number>();
      if (!inventory || !selectedDepositId) return map;
      
      inventory.forEach(stock => {
          if (stock.depositId === selectedDepositId) {
              map.set(stock.productId, (map.get(stock.productId) || 0) + stock.quantity);
          }
      });
      return map;
  }, [inventory, selectedDepositId]);

  const availableProductsForRequest = useMemo(() => {
    if (!products) return [];
    if (!selectedDepositId || !inventory) {
       // Return empty if jefe de deposito has no deposit selected yet.
      if (isJefeDeposito) return [];
      return products.filter((p) => !p.isArchived);
    }

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
  }, [selectedDepositId, products, inventory, isJefeDeposito]);
  
  const canCreateRequest = currentUserProfile?.role && ['administrador', 'editor', 'solicitante', 'jefe_deposito'].includes(currentUserProfile.role);
  const isAdmin = currentUserProfile?.role === 'administrador';

  // --- Form Submission Logic ---
  const onSubmit: SubmitHandler<RequestFormValues> = async (data) => {
    if (!firestore || !user || !productsMap.size || !canCreateRequest || !collectionPrefix || !currentUserProfile) return;
    
    // --- 1. Client-side Validation ---
    for (const item of data.items) {
      const availableStock = inventoryByProduct.get(item.productId) || 0;
      if (item.quantity > availableStock) {
        toast({
          variant: 'destructive',
          title: 'Stock Insuficiente',
          description: `No hay stock suficiente para ${productsMap.get(item.productId)?.name}. Solicitados: ${item.quantity}, Disponible: ${availableStock}.`,
        });
        return; // Stop the submission
      }
    }

    setIsSubmitting(true);

    const productChanges = new Map<string, number>();
    for (const item of data.items) {
      if (item.productId) {
        const change = -item.quantity; // All requests are 'salida'
        productChanges.set(
          item.productId,
          (productChanges.get(item.productId) || 0) + change
        );
      }
    }

    try {
      await runTransaction(firestore, async (transaction) => {
        // --- 2. Server-side Read & Validation (as a safeguard) ---
        const stockDocRefs = new Map<string, any>();
        const counterRef = doc(firestore, `${collectionPrefix}/counters`, 'remitoCounter');

        // Pre-fetch all necessary stock documents
        for (const [productId] of productChanges.entries()) {
          const inventoryDocId = `${productId}_${data.depositId}`;
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory`, inventoryDocId);
          stockDocRefs.set(productId, stockDocRef);
        }
        
        const stockSnaps = await Promise.all(
          Array.from(stockDocRefs.values()).map((ref) => transaction.get(ref))
        );

        // This validation is a final check. The main feedback is given on the client.
        stockSnaps.forEach((snap, index) => {
          const productId = Array.from(stockDocRefs.keys())[index];
          const change = productChanges.get(productId)!;
          const currentQuantity = snap.exists() ? snap.data().quantity : 0;
          if (currentQuantity < -change) {
            throw new Error(
              `Stock insuficiente para ${productsMap.get(productId)?.name}.`
            );
          }
        });

        const counterSnap = await transaction.get(counterRef);

        // --- 3. WRITE PHASE ---
        const lastNumber = counterSnap.exists() ? counterSnap.data().lastNumber : 0;
        const newRemitoNumber = lastNumber + 1;
        const formattedRemitoNumber = `S-${String(newRemitoNumber).padStart(5, '0')}`;
        transaction.set(counterRef, { lastNumber: newRemitoNumber }, { merge: true });

        for (const [productId, change] of productChanges.entries()) {
          const stockDocRef = stockDocRefs.get(productId);
          transaction.set(
            stockDocRef,
            {
              quantity: increment(change),
              lastUpdated: serverTimestamp(),
              productId: productId,
              depositId: data.depositId,
            },
            { merge: true }
          );
        }

        const movementItemsForDoc: StockMovementItem[] = data.items.map((item) => {
            const product = productsMap.get(item.productId);
            return {
              productId: item.productId,
              productName: product?.name || 'N/A',
              quantity: item.quantity,
              unit: product?.unit || 'N/A',
              price: product?.price || 0,
              total: (product?.price || 0) * item.quantity
            };
        });
        
        const totalValue = movementItemsForDoc.reduce((sum, item) => sum + item.total, 0);

        const deposit = deposits?.find((d) => d.id === data.depositId);
        const actorName = `${currentUserProfile?.firstName || ''} ${currentUserProfile?.lastName || ''}`.trim();

        const movementRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));
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
        title: 'Solicitud Registrada',
        description: 'El pedido ha sido registrado como un remito de salida.',
      });
      form.reset({
        depositId: isJefeDeposito ? assignedDepositId || '' : '',
        actorId: user.uid,
        items: [{ productId: '', quantity: 1 }],
      });
    } catch (error: any) {
      console.error('Error procesando la solicitud:', error);
      toast({
        variant: 'destructive',
        title: 'Error en la transacción',
        description: error.message || 'Ocurrió un error al procesar el pedido.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMovement = async (movement: StockMovement) => {
    if (!firestore || !collectionPrefix) return;

    try {
      await runTransaction(firestore, async (transaction) => {
        // 1. Revert stock for each item in the movement
        for (const item of movement.items) {
          const inventoryDocId = `${item.productId}_${movement.depositId}`;
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory`, inventoryDocId);

          // The change is the opposite of the original movement type
          const change =
            movement.type === 'entrada' ? -item.quantity : item.quantity;

          transaction.set(
            stockDocRef,
            {
              quantity: increment(change),
              lastUpdated: serverTimestamp(),
            },
            { merge: true }
          );
        }

        // 2. Delete the movement document itself
        const movementDocRef = doc(firestore, `${collectionPrefix}/stockMovements`, movement.id);
        transaction.delete(movementDocRef);
      });

      toast({
        title: 'Remito Anulado',
        description: `El remito ${movement.remitoNumber} ha sido anulado y el stock ha sido revertido.`,
      });
    } catch (error: any) {
      console.error('Error deleting movement:', error);
      toast({
        variant: 'destructive',
        title: 'Error al Anular',
        description:
          error.message || 'No se pudo anular el remito. Revisa los permisos.',
      });
    }
  };

  if (isLoading) {
    return <SolicitudesPageSkeleton />;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
       <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Solicitudes de Productos
        </h1>
        <p className="text-muted-foreground">
          Crea un pedido de productos desde un depósito.
        </p>
      </div>
      
      {canCreateRequest ? (
        <Card>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle>Crear Pedido de Productos</CardTitle>
                <CardDescription>
                  {isJefeDeposito && !assignedDepositId 
                    ? 'Debes tener un depósito asignado para poder crear pedidos.' 
                    : 'Completa el formulario para generar un remito de salida. El stock disponible se mostrará al seleccionar un producto.'}
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
                        <Select onValueChange={field.onChange} value={field.value} disabled={isJefeDeposito}>
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
                            value={`${currentUserProfile?.firstName || ''} ${currentUserProfile?.lastName || ''}`.trim()}
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
                    <h3 className="text-lg font-medium">Productos a Solicitar</h3>
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
                        const selectedProductId = form.watch(`items.${index}.productId`);
                        const availableStock = inventoryByProduct.get(selectedProductId) || 0;
                        const productUnit = productsMap.get(selectedProductId)?.unit || '';

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
                                    <FormLabel className="sr-only">Producto</FormLabel>
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
                                    <FormLabel className="sr-only">Cantidad</FormLabel>
                                    <FormControl>
                                        <Input type="number" placeholder="Cantidad" {...field} />
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
                                        Stock disponible: <span className="font-medium text-foreground">{availableStock} {productUnit}</span>
                                     </div>
                                )}
                            </div>
                        )
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
                <Button type="submit" disabled={isSubmitting || !selectedDepositId || !form.formState.isValid}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Generar Pedido
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
       ) : (
        <Card>
            <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>
                No tienes los permisos necesarios para crear solicitudes.
            </CardDescription>
            </CardHeader>
        </Card>
       )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de Pedidos</CardTitle>
          <CardDescription>
             {isAdmin ? 'Como administrador, puedes ver todos los pedidos.' : 'Aquí puedes ver los pedidos que has generado o los de tu depósito.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Remito Nº</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingMovements &&
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                {!isLoadingMovements && filteredMovements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      {isJefeDeposito && !assignedDepositId ? "No tienes un depósito asignado para ver pedidos." : "No se encontraron pedidos."}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoadingMovements &&
                  filteredMovements
                    .sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime())
                    .map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell className="font-medium">
                          {format(mov.createdAt.toDate(), 'PPpp', { locale: es })}
                        </TableCell>
                        <TableCell className="font-mono">{mov.remitoNumber || '-'}</TableCell>
                        <TableCell>{mov.depositName}</TableCell>
                        <TableCell>{mov.actorName || '-'}</TableCell>
                        <TableCell>{mov.items.length}</TableCell>
                        <TableCell className="text-right">
                           <RemitoActions 
                             movement={mov}
                             settings={pdfSettings}
                             canDelete={isAdmin}
                             onDelete={() => handleDeleteMovement(mov)}
                           />
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
