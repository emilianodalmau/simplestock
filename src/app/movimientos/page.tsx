
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
  increment,
  writeBatch,
  deleteDoc,
  where,
  orderBy,
  startAt,
  endAt,
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, PlusCircle, Edit } from 'lucide-react';
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
import { ProductComboBox } from '@/components/ui/product-combobox';
import { RemitoActions } from '@/components/remito-actions';
import type { AppSettings } from '@/types/settings';
import type { Product, Deposit, Supplier, UserProfile, StockMovementItem, StockMovement, InventoryStock } from '@/types/inventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';


type Workspace = {
    appName?: string;
    logoUrl?: string;
}


// --- Zod Schemas ---
const movementItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto.'),
  quantity: z.coerce.number().min(0.1, 'La cantidad debe ser mayor a 0.'),
});

const movementFormSchema = z.object({
  type: z.enum(['entrada', 'salida']),
  depositId: z.string().min(1, 'Selecciona un depósito.'),
  remitoNumber: z.string().optional(),
  actorId: z.string().optional(),
  items: z.array(movementItemSchema).min(1, 'Debes agregar al menos un producto.'),
});

type MovementFormValues = z.infer<typeof movementFormSchema>;

// --- Skeleton Component ---
function MovementPageSkeleton() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-10 w-full" />
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
export default function MovimientosPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfSettings, setPdfSettings] = useState<AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string } | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [assignedDepositId, setAssignedDepositId] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedDeposit, setSelectedDeposit] = useState('all');
  const [selectedActor, setSelectedActor] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);


  // --- Data Loading ---
  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(currentUserDocRef);
  
  const canAccessPage = useMemo(() => {
    if (!currentUserProfile) return false;
    return ['administrador', 'editor', 'jefe_deposito'].includes(currentUserProfile.role!);
  }, [currentUserProfile]);

  const isJefeDeposito = currentUserProfile?.role === 'jefe_deposito';
  const workspaceId = currentUserProfile?.workspaceId;
  
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId && canAccessPage ? doc(firestore, 'workspaces', workspaceId) : null),
    [firestore, workspaceId, canAccessPage]
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

  const collectionPrefix = useMemo(
    () => (workspaceId && canAccessPage ? `workspaces/${workspaceId}` : null),
    [workspaceId, canAccessPage]
  );

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

  const usersCollectionQuery = useMemoFirebase(() => {
    if (firestore && workspaceId && (currentUserProfile?.role === 'administrador' || currentUserProfile?.role === 'editor')) {
        return query(collection(firestore, 'users'), where('workspaceId', '==', workspaceId));
    }
    return null;
  }, [firestore, workspaceId, currentUserProfile?.role]);

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersCollectionQuery);

  const suppliersCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/suppliers`) : null),
    [firestore, collectionPrefix]
  );
  const { data: suppliers, isLoading: isLoadingSuppliers } =
    useCollection<Supplier>(suppliersCollection);

  const movementsQuery = useMemoFirebase(() => {
    // Crucial: Do not run the query if the user doesn't have access.
    if (!canAccessPage || !firestore || !collectionPrefix || !currentUserProfile) return null;
    
    const movementsCollectionRef = collection(firestore, `${collectionPrefix}/stockMovements`);
    const userRole = currentUserProfile.role;

    // For simplicity with multiple filters, we fetch all remitos and filter client-side.
    // This is less efficient for very large datasets but much simpler to implement without complex backend logic.
    return query(
        movementsCollectionRef,
        orderBy('remitoNumber'),
        startAt('R-'),
        endAt('R-\uf8ff')
    );

  }, [firestore, collectionPrefix, currentUserProfile, canAccessPage]);
    
  const { data: movements, isLoading: isLoadingMovements } =
    useCollection<StockMovement>(movementsQuery);
    
  const filteredMovements = useMemo(() => {
    let filtered = movements || [];

    // Role-based pre-filtering
    if (currentUserProfile?.role === 'jefe_deposito') {
      if (!assignedDepositId) return []; // Jefe must have an assigned deposit
      filtered = filtered.filter(mov => mov.depositId === assignedDepositId);
    }

    // Apply UI filters
    if (searchTerm) {
        const lowerCaseSearch = searchTerm.toLowerCase();
        filtered = filtered.filter(mov => 
            mov.remitoNumber?.toLowerCase().includes(lowerCaseSearch) ||
            mov.items.some(item => item.productName.toLowerCase().includes(lowerCaseSearch))
        );
    }
    if (selectedType !== 'all') {
        filtered = filtered.filter(mov => mov.type === selectedType);
    }
    if (selectedDeposit !== 'all') {
        filtered = filtered.filter(mov => mov.depositId === selectedDeposit);
    }
    if (selectedActor !== 'all') {
        filtered = filtered.filter(mov => mov.actorId === selectedActor);
    }
    if (dateRange?.from) {
        filtered = filtered.filter(mov => mov.createdAt.toDate() >= dateRange.from!);
    }
    if (dateRange?.to) {
        // Add one day to 'to' to include the whole day
        const toDate = new Date(dateRange.to);
        toDate.setDate(toDate.getDate() + 1);
        filtered = filtered.filter(mov => mov.createdAt.toDate() < toDate);
    }

    return filtered;

  }, [movements, searchTerm, selectedType, selectedDeposit, selectedActor, dateRange, currentUserProfile, assignedDepositId]);


  const inventoryCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/inventory`) : null),
    [firestore, collectionPrefix]
  );
  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryCollection);

  const isLoading =
    isLoadingProfile ||
    (canAccessPage && (
        isLoadingProducts ||
        isLoadingDeposits ||
        isLoadingUsers ||
        isLoadingSuppliers ||
        isLoadingMovements ||
        isLoadingInventory ||
        isLoadingWorkspace
    ));

  // --- Form Setup ---
  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: {
      type: 'salida',
      depositId: '',
      remitoNumber: '',
      actorId: '',
      items: [{ productId: '', quantity: 1 }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const movementType = form.watch('type');
  const selectedDepositId = form.watch('depositId');
  
  // Set the depositId if user is Jefe
  useEffect(() => {
    if (isJefeDeposito && assignedDepositId) {
        form.setValue('depositId', assignedDepositId);
    }
  }, [isJefeDeposito, assignedDepositId, form]);

  // --- Effects ---
  useEffect(() => {
    // When the selected deposit changes, reset the items array
    // to force re-evaluation of available products.
    replace([{ productId: '', quantity: 1 }]);
  }, [selectedDepositId, replace]);

  useEffect(() => {
    // Also reset when movement type changes
    replace([{ productId: '', quantity: 1 }]);
    form.setValue('actorId', ''); // Reset actor when type changes
  }, [movementType, replace, form]);

  // --- Data Memoization for UI ---
  const productsMap = useMemo(() => new Map(products?.map((p) => [p.id, p])), [
    products,
  ]);
  
  const actors = useMemo(
    () => (movementType === 'salida' ? users : suppliers),
    [movementType, users, suppliers]
  );
  const actorLabel = movementType === 'salida' ? 'Usuario' : 'Proveedor';
  
  const allActorsForFilter = useMemo(() => {
      const all = [];
      if (users) all.push(...users.map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}` })));
      if (suppliers) all.push(...suppliers.map(s => ({ id: s.id, name: s.name })));
      return all.sort((a,b) => a.name.localeCompare(b.name));
  }, [users, suppliers]);

  const availableProductsForMovement = useMemo(() => {
    if (!products || !collectionPrefix) return [];
    if (movementType === 'entrada' || !selectedDepositId || !inventory) {
      return products.filter((p) => !p.isArchived);
    }

    // For "salida", filter products that have stock > 0 in the selected deposit
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
  }, [movementType, selectedDepositId, products, inventory, collectionPrefix]);

  // --- Form Submission Logic ---
  const onSubmit: SubmitHandler<MovementFormValues> = async (data) => {
    if (!firestore || !user || !productsMap.size || !collectionPrefix) return;
    setIsSubmitting(true);

    const productChanges = new Map<string, number>();
    let totalMovementValue = 0;

    for (const item of data.items) {
      if (item.productId) {
        const change = data.type === 'salida' ? -item.quantity : item.quantity;
        productChanges.set(
          item.productId,
          (productChanges.get(item.productId) || 0) + change
        );
        const product = productsMap.get(item.productId);
        if (product) {
          totalMovementValue += (product.price || 0) * item.quantity;
        }
      }
    }

    try {
      await runTransaction(firestore, async (transaction) => {
        // --- 1. READ PHASE ---
        const stockDocRefs = new Map<string, any>();
        const stockDocs = new Map<string, any>();
        const counterRef = doc(firestore, `${collectionPrefix}/counters`, 'remitoCounter');

        // Pre-fetch all necessary stock documents
        for (const [productId] of productChanges.entries()) {
          const inventoryDocId = `${productId}_${data.depositId}`;
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory`, inventoryDocId);
          stockDocRefs.set(productId, stockDocRef);
        }
        
        const allReads = [
          transaction.get(counterRef),
          ...Array.from(stockDocRefs.values()).map(ref => transaction.get(ref))
        ];
        
        const [counterSnap, ...stockSnaps] = await Promise.all(allReads);


        // --- 2. VALIDATION PHASE ---
        for (const [productId, change] of productChanges.entries()) {
          if (change < 0) { // Only validate stock for 'salidas'
             const stockDoc = stockSnaps.shift(); // Get the corresponding snapshot
             if (!stockDoc) continue;

            const currentQuantity = stockDoc.exists()
              ? stockDoc.data().quantity
              : 0;
            const quantityToWithdraw = -change;

            if (currentQuantity < quantityToWithdraw) {
              throw new Error(
                `Stock insuficiente para ${
                  productsMap.get(productId)?.name
                }. Stock actual: ${currentQuantity}, se necesitan: ${quantityToWithdraw}.`
              );
            }
          }
        }

        // --- 3. WRITE PHASE ---
        // Increment counter
        const lastNumber = counterSnap.exists()
          ? counterSnap.data().lastNumber
          : 0;
        const newRemitoNumber = lastNumber + 1;
        const formattedRemitoNumber = `R-${String(newRemitoNumber).padStart(
          5,
          '0'
        )}`;
        transaction.set(counterRef, { lastNumber: newRemitoNumber }, { merge: true });

        // Update inventory
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

        // Create movement record
        const movementItemsForDoc: StockMovementItem[] = data.items.map(
          (item) => {
            const product = productsMap.get(item.productId);
            const price = product?.price || 0;
            return {
              productId: item.productId,
              productName: product?.name || 'N/A',
              quantity: item.quantity,
              unit: product?.unit || 'N/A',
              price: price,
              total: price * item.quantity,
            };
          }
        );

        const deposit = deposits?.find((d) => d.id === data.depositId);
        let actorName: string | null = null;
        let actorType: 'user' | 'supplier' | null = null;
        let finalActorId = data.actorId;

        if (data.type === 'salida') {
          actorType = 'user';
          // If the user is a jefe_deposito, they are the actor.
          if (isJefeDeposito) {
            finalActorId = user.uid;
            actorName = `${currentUserProfile?.firstName || ''} ${currentUserProfile?.lastName || ''}`.trim();
          } else {
            // For admins/editors, find the selected user.
            const actor = users?.find((u) => u.id === data.actorId);
            actorName = actor ? `${actor.firstName || ''} ${actor.lastName || ''}`.trim() : null;
          }
        } else { // 'entrada'
          actorType = 'supplier';
          const actor = suppliers?.find((s) => s.id === data.actorId);
          actorName = actor ? actor.name : null;
        }


        const movementRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));

        transaction.set(movementRef, {
          id: movementRef.id,
          remitoNumber: data.remitoNumber || formattedRemitoNumber,
          type: data.type,
          depositId: data.depositId,
          depositName: deposit?.name || 'N/A',
          actorId: finalActorId || null,
          actorName: actorName,
          actorType: finalActorId ? actorType : null,
          createdAt: serverTimestamp(),
          userId: user.uid,
          items: movementItemsForDoc,
          totalValue: totalMovementValue,
        });
      });

      toast({
        title: 'Movimiento Registrado',
        description: 'El remito ha sido registrado exitosamente.',
      });
      form.reset({
        type: 'salida',
        depositId: isJefeDeposito ? assignedDepositId || '' : '',
        remitoNumber: '',
        actorId: '',
        items: [{ productId: '', quantity: 1 }],
      });
    } catch (error: any) {
      console.error('Error procesando el movimiento:', error);
      toast({
        variant: 'destructive',
        title: 'Error en el movimiento',
        description:
          error.message || 'Ocurrió un error al procesar el remito.',
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

  const canManageMovements =
    currentUserProfile?.role === 'administrador' ||
    currentUserProfile?.role === 'editor' ||
    currentUserProfile?.role === 'jefe_deposito';
  
  const canSelectActor = currentUserProfile?.role === 'administrador' || currentUserProfile?.role === 'editor';
  
  const isAdmin = currentUserProfile?.role === 'administrador';
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  }

  if (isLoading) {
    return <MovementPageSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>
              No tienes los permisos necesarios para ver esta página.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }


  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
        <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Movimientos de Stock</h1>
            <p className="text-muted-foreground">
              Registra entradas y salidas de inventario o consulta el historial de remitos.
            </p>
        </div>
        <Tabs defaultValue="history">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="history">Historial de Remitos</TabsTrigger>
                <TabsTrigger value="create">Registrar Nuevo Remito</TabsTrigger>
            </TabsList>
            <TabsContent value="create">
                 {canManageMovements && (
                    <Card>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardHeader>
                            <CardTitle>Registrar Nuevo Remito</CardTitle>
                            <CardDescription>
                            Completa el formulario para registrar una entrada o salida de
                            productos.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Tipo de Movimiento</FormLabel>
                                    <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    >
                                    <FormControl>
                                        <SelectTrigger>
                                        <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="salida">Salida</SelectItem>
                                        <SelectItem value="entrada">Entrada</SelectItem>
                                    </SelectContent>
                                    </Select>
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="depositId"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Depósito</FormLabel>
                                    <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                    disabled={isJefeDeposito}
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
                            {movementType === 'entrada' || canSelectActor ? (
                                <FormField
                                control={form.control}
                                name="actorId"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>{actorLabel} (Opcional)</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value || ''}
                                    >
                                        <FormControl>
                                        <SelectTrigger>
                                            <SelectValue
                                            placeholder={`Selecciona un ${actorLabel.toLowerCase()}`}
                                            />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                        {actors?.map((a) => (
                                            <SelectItem key={a.id} value={a.id}>
                                            {movementType === 'salida' ? `${(a as UserProfile).firstName} ${(a as UserProfile).lastName}` : (a as Supplier).name}
                                            </SelectItem>
                                        ))}
                                        </SelectContent>
                                    </Select>
                                    </FormItem>
                                )}
                            ) : null}
                            <FormField
                                control={form.control}
                                name="remitoNumber"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nº Remito (Auto)</FormLabel>
                                    <FormControl>
                                    <Input
                                        placeholder="Se genera automáticamente"
                                        {...field}
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
                                Productos del Remito
                                </h3>
                                <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => append({ productId: '', quantity: 1 })}
                                disabled={!selectedDepositId && !isJefeDeposito}
                                >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Agregar Producto
                                </Button>
                            </div>
                            <div className="space-y-4">
                                {fields.map((field, index) => (
                                <div
                                    key={field.id}
                                    className="grid grid-cols-[1fr_120px_auto] sm:grid-cols-[1fr_150px_150px_auto] gap-2 items-start p-4 border rounded-md"
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
                                            products={availableProductsForMovement}
                                            value={field.value}
                                            onChange={field.onChange}
                                            disabled={!selectedDepositId}
                                            noStockMessage={
                                            movementType === 'salida' &&
                                            !!selectedDepositId
                                                ? 'No hay productos con stock en este depósito.'
                                                : 'Selecciona un producto'
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
                                    <div className="hidden sm:flex items-center justify-center h-10 px-3 text-sm text-muted-foreground font-medium bg-muted rounded-md">
                                    {productsMap.get(
                                        form.watch(`items.${index}.productId`)
                                    )?.unit || '-'}
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
                                ))}
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
                            <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Registrar Remito
                            </Button>
                        </CardFooter>
                        </form>
                    </Form>
                    </Card>
                )}
            </TabsContent>
            <TabsContent value="history">
                 <Card>
                    <CardHeader>
                    <CardTitle>Historial de Movimientos</CardTitle>
                    { isJefeDeposito ? <CardDescription>Solo se muestran los movimientos de tu depósito asignado.</CardDescription> : <CardDescription>Filtra y busca entre todos los remitos generados.</CardDescription>}
                    </CardHeader>
                    <CardContent>
                    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <Input
                            placeholder="Buscar por Nº Remito o producto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-grow"
                        />
                        <Select value={selectedType} onValueChange={setSelectedType}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Filtrar por tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los tipos</SelectItem>
                                <SelectItem value="entrada">Entrada</SelectItem>
                                <SelectItem value="salida">Salida</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={selectedDeposit} onValueChange={setSelectedDeposit} disabled={isJefeDeposito}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Filtrar por depósito" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los depósitos</SelectItem>
                                {deposits?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        
                        <Select value={selectedActor} onValueChange={setSelectedActor}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Filtrar por actor" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los actores</SelectItem>
                                {allActorsForFilter.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Popover>
                            <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                "w-full sm:w-[300px] justify-start text-left font-normal",
                                !dateRange && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                dateRange.to ? (
                                    <>
                                    {format(dateRange.from, "LLL dd, y")} -{" "}
                                    {format(dateRange.to, "LLL dd, y")}
                                    </>
                                ) : (
                                    format(dateRange.from, "LLL dd, y")
                                )
                                ) : (
                                <span>Seleccionar rango de fechas</span>
                                )}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                            />
                            </PopoverContent>
                        </Popover>

                    </div>
                    <div className="rounded-lg border">
                        <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Remito Nº</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Depósito</TableHead>
                            <TableHead>Origen/Destino</TableHead>
                            <TableHead>Productos</TableHead>
                            <TableHead className='text-right'>Valor Total</TableHead>
                            {canManageMovements && (
                                <TableHead className="text-right">Acciones</TableHead>
                            )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoadingMovements &&
                            [...Array(3)].map((_, i) => (
                                <TableRow key={i}>
                                <TableCell>
                                    <Skeleton className="h-4 w-36" />
                                </TableCell>
                                <TableCell>
                                    <Skeleton className="h-4 w-20" />
                                </TableCell>
                                <TableCell>
                                    <Skeleton className="h-6 w-16 rounded-full" />
                                </TableCell>
                                <TableCell>
                                    <Skeleton className="h-4 w-24" />
                                </TableCell>
                                <TableCell>
                                    <Skeleton className="h-4 w-24" />
                                </TableCell>
                                <TableCell>
                                    <Skeleton className="h-4 w-10" />
                                </TableCell>
                                <TableCell>
                                    <Skeleton className="h-4 w-20 ml-auto" />
                                </TableCell>
                                {canManageMovements && (
                                    <TableCell>
                                    <Skeleton className="h-8 w-20 ml-auto" />
                                    </TableCell>
                                )}
                                </TableRow>
                            ))}
                            {!isLoadingMovements && filteredMovements?.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={canManageMovements ? 8 : 7} className="text-center h-24">
                                {isJefeDeposito && !assignedDepositId ? "No tienes un depósito asignado." : "No se encontraron movimientos con los filtros aplicados."}
                                </TableCell>
                            </TableRow>
                            )}
                            {!isLoadingMovements &&
                            (filteredMovements || [])
                                ?.sort(
                                (a, b) =>
                                    b.createdAt.toDate().getTime() -
                                    a.createdAt.toDate().getTime()
                                )
                                .map((mov) => (
                                <TableRow key={mov.id}>
                                    <TableCell className="font-medium">
                                    {format(mov.createdAt.toDate(), 'PPpp', {
                                        locale: es,
                                    })}
                                    </TableCell>
                                    <TableCell className="font-mono">
                                    {mov.remitoNumber || '-'}
                                    </TableCell>
                                    <TableCell>
                                    <span
                                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                        mov.type === 'entrada'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}
                                    >
                                        {mov.type.charAt(0).toUpperCase() +
                                        mov.type.slice(1)}
                                    </span>
                                    </TableCell>
                                    <TableCell>{mov.depositName}</TableCell>
                                    <TableCell>{mov.actorName || '-'}</TableCell>
                                    <TableCell>{mov.items.length}</TableCell>
                                    <TableCell className="text-right font-medium">
                                    {formatPrice(mov.totalValue || 0)}
                                    </TableCell>
                                    {canManageMovements && (
                                    <TableCell className="text-right">
                                    <RemitoActions 
                                        movement={mov}
                                        settings={pdfSettings}
                                        canDelete={isAdmin}
                                        onDelete={() => handleDeleteMovement(mov)}
                                    />
                                    </TableCell>
                                    )}
                                </TableRow>
                                ))}
                        </TableBody>
                        </Table>
                    </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    </div>
  );
}
