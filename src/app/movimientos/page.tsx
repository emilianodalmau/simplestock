
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
  where,
  query,
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, PlusCircle, CalendarIcon, FileDown, FileText } from 'lucide-react';
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
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

type Workspace = {
    name?: string;
    appName?: string;
    logoUrl?: string;
}

// --- Skeleton Component ---
function MovementPageSkeleton() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
       <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin" />
       </div>
    </div>
  );
}

// --- Child Component with Data Logic ---
function MovimientosContent({ currentUserProfile }: { currentUserProfile: UserProfile }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfSettings, setPdfSettings] = useState<AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string } | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedDeposit, setSelectedDeposit] = useState('all');
  const [selectedActor, setSelectedActor] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const role = currentUserProfile?.role;
  const isJefeDeposito = role === 'jefe_deposito';
  const isSolicitante = role === 'solicitante';
  const isAdmin = role === 'administrador';
  
  const canManageMovements = useMemo(() => {
    if (!role) return false;
    return ['administrador', 'editor', 'jefe_deposito'].includes(role);
  }, [role]);

  const workspaceId = currentUserProfile?.workspaceId;
  
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId ? doc(firestore, 'workspaces', workspaceId) : null),
    [firestore, workspaceId]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

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
    () => (workspaceId ? `workspaces/${workspaceId}` : null),
    [workspaceId]
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

  const depositsForJefeQuery = useMemoFirebase(
    () => {
        if (!firestore || !collectionPrefix || !isJefeDeposito || !user) return null;
        return query(collection(firestore, `${collectionPrefix}/deposits`), where('jefeId', '==', user.uid));
    },
    [firestore, collectionPrefix, isJefeDeposito, user]
  );

  const allDepositsQuery = useMemoFirebase(
    () => {
        if (!firestore || !collectionPrefix || isJefeDeposito) return null;
        return collection(firestore, `${collectionPrefix}/deposits`);
    },
    [firestore, collectionPrefix, isJefeDeposito]
  );

  const { data: depositsForJefe, isLoading: isLoadingDepositsForJefe } = useCollection<Deposit>(depositsForJefeQuery);
  const { data: allDeposits, isLoading: isLoadingAllDeposits } = useCollection<Deposit>(allDepositsQuery);
  
  const deposits = isJefeDeposito ? depositsForJefe : allDeposits;
  const isLoadingDeposits = isJefeDeposito ? isLoadingDepositsForJefe : isLoadingAllDeposits;

  const assignedDepositIds = useMemo(() => {
    if (!isJefeDeposito || !deposits) return null;
    if (deposits.length === 0) return [];
    return deposits.map(d => d.id);
  }, [isJefeDeposito, deposits]);
  
  useEffect(() => {
    if (isJefeDeposito && deposits?.length === 1) {
      setSelectedDeposit(deposits[0].id);
    }
  }, [isJefeDeposito, deposits]);

  const suppliersCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/suppliers`) : null),
    [firestore, collectionPrefix]
  );
  const { data: suppliers, isLoading: isLoadingSuppliers } =
    useCollection<Supplier>(suppliersCollection);

  const movementsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix || !user) return null;
  
    const movementsCollectionRef = collection(firestore, `${collectionPrefix}/stockMovements`);
  
    // CASO 1: JEFE DE DEPOSITO
    if (isJefeDeposito) {
      if (assignedDepositIds === null) return null;
      if (assignedDepositIds.length === 0) return null;
      return query(
        movementsCollectionRef,
        where('depositId', 'in', assignedDepositIds)
      );
    }
  
    // CASO 2: SOLICITANTE
    if (isSolicitante) {
      return query(
        movementsCollectionRef,
        where('userId', '==', user.uid)
      );
    }
  
    // CASO 3: ADMIN/EDITOR/VISUALIZADOR
    return query(movementsCollectionRef);
  }, [firestore, collectionPrefix, isJefeDeposito, isSolicitante, user, assignedDepositIds]);

  const { data: movements, isLoading: isLoadingMovements } = useCollection<StockMovement>(movementsQuery);
    
  const filteredMovements = useMemo(() => {
    if (!movements) return [];

    let filtered = movements;

    // 1. Apply Filters
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
    if (selectedDeposit !== 'all' && !isJefeDeposito) { 
        filtered = filtered.filter(mov => mov.depositId === selectedDeposit);
    }
    if (selectedActor !== 'all') {
        filtered = filtered.filter(mov => mov.actorId === selectedActor);
    }
    if (dateRange?.from) {
        filtered = filtered.filter(mov => mov.createdAt.toDate() >= dateRange.from!);
    }
    if (dateRange?.to) {
        const toDate = new Date(dateRange.to);
        toDate.setDate(toDate.getDate() + 1);
        filtered = filtered.filter(mov => mov.createdAt.toDate() < toDate);
    }

    // 2. Apply Sorting (Client-side)
    return filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate().getTime() || 0;
        const dateB = b.createdAt?.toDate().getTime() || 0;
        return dateB - dateA; 
    });

  }, [movements, searchTerm, selectedType, selectedDeposit, selectedActor, dateRange, isJefeDeposito]);


  const inventoryCollection = useMemoFirebase(
    () => {
        if (!firestore || !collectionPrefix) return null;
        return collection(firestore, `${collectionPrefix}/inventory`);
    },
    [firestore, collectionPrefix]
  );
  
  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryCollection);

  const isLoading =
    isLoadingProducts ||
    isLoadingDeposits ||
    isLoadingSuppliers ||
    isLoadingWorkspace;

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
  
  useEffect(() => {
    if (isJefeDeposito && deposits?.length === 1) {
        form.setValue('depositId', deposits[0].id);
    }
  }, [isJefeDeposito, deposits, form]);

  useEffect(() => {
    replace([{ productId: '', quantity: 1 }]);
  }, [selectedDepositId, replace]);

  useEffect(() => {
    replace([{ productId: '', quantity: 1 }]);
    form.setValue('actorId', '');
  }, [movementType, replace, form]);

  const productsMap = useMemo(() => new Map(products?.map((p) => [p.id, p])), [
    products,
  ]);
  
  const allActorsForFilter = useMemo(() => {
      if (!movements) return [];
      const actorsMap = new Map<string, string>();
      movements.forEach(mov => {
        if (mov.actorId && mov.actorName) {
            actorsMap.set(mov.actorId, mov.actorName);
        }
      });
      return Array.from(actorsMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a,b) => a.name.localeCompare(b.name));
  }, [movements]);

  const availableProductsForMovement = useMemo(() => {
    if (!products || !selectedDepositId) return [];

    const productsInDeposit = products.filter(
        (p) => !p.isArchived && p.depositIds?.includes(selectedDepositId)
    );

    if (movementType === 'entrada') {
        return productsInDeposit;
    }

    if (movementType === 'salida') {
        if (!inventory) return []; 
        const productsWithStockInDeposit = new Set(
            inventory
                .filter(stockItem => stockItem.depositId === selectedDepositId && stockItem.quantity > 0)
                .map(stockItem => stockItem.productId)
        );
        return productsInDeposit.filter(product => productsWithStockInDeposit.has(product.id));
    }
    
    return [];
  }, [movementType, selectedDepositId, products, inventory]);


  const onSubmit: SubmitHandler<MovementFormValues> = async (data) => {
    if (!firestore || !user || !productsMap.size || !collectionPrefix) return;
    setIsSubmitting(true);

    let movementDocRef: any; 
    try {
        await runTransaction(firestore, async (transaction) => {
        movementDocRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));
        const counterRef = doc(firestore, `${collectionPrefix}/counters/remitoCounter`);
        const counterSnap = await transaction.get(counterRef);

        const stockReads = await Promise.all(
          data.items.map(item => {
            const inventoryDocId = `${item.productId}_${data.depositId}`;
            const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${inventoryDocId}`);
            return transaction.get(stockDocRef);
          })
        );
        
        const lastNumber = counterSnap.exists() ? counterSnap.data().lastNumber : 0;
        const newRemitoNumber = lastNumber + 1;
        const formattedRemitoNumber = `R-${String(newRemitoNumber).padStart(5, '0')}`;

        let totalMovementValue = 0;
        const productChanges = new Map<string, number>();

        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          const stockSnap = stockReads[i];
          const product = productsMap.get(item.productId);

          if (!product) throw new Error(`Producto con ID ${item.productId} no encontrado.`);

          totalMovementValue += (product.price || 0) * item.quantity;
          const change = data.type === 'salida' ? -item.quantity : item.quantity;
          productChanges.set(item.productId, (productChanges.get(item.productId) || 0) + change);

          if (data.type === 'salida') {
            const currentQuantity = stockSnap.exists() ? stockSnap.data().quantity : 0;
            if (currentQuantity < item.quantity) {
              throw new Error(`Stock insuficiente para ${product.name}. Stock actual: ${currentQuantity}, se necesitan: ${item.quantity}.`);
            }
          }
        }
        
        transaction.set(counterRef, { lastNumber: newRemitoNumber }, { merge: true });

        for (const [productId, change] of productChanges.entries()) {
          const inventoryDocId = `${productId}_${data.depositId}`;
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${inventoryDocId}`);
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
          if (isJefeDeposito) {
            finalActorId = user.uid;
            actorName = `${currentUserProfile?.firstName || ''} ${currentUserProfile?.lastName || ''}`.trim();
          } else {
             // Fallback
             actorName = "Usuario (Salida)"; 
          }
        } else {
          actorType = 'supplier';
          const actor = suppliers?.find((s) => s.id === data.actorId);
          actorName = actor ? actor.name : null;
        }
        
        transaction.set(movementDocRef, {
          id: movementDocRef.id,
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
        depositId: isJefeDeposito && deposits?.length === 1 ? deposits[0].id : '',
        remitoNumber: '',
        actorId: '',
        items: [{ productId: '', quantity: 1 }],
      });
    } catch(error: any) {
        const permissionError = new FirestorePermissionError({
            path: movementDocRef ? movementDocRef.path : `${collectionPrefix}/stockMovements`,
            operation: 'create',
            requestResourceData: form.getValues(),
        });
        errorEmitter.emit('permission-error', permissionError);
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteMovement = (movement: StockMovement) => {
    if (!firestore || !collectionPrefix) return;
    
    let movementDocRef: any = doc(firestore, `${collectionPrefix}/stockMovements/${movement.id}`);
    
    runTransaction(firestore, async (transaction) => {
        for (const item of movement.items) {
          const inventoryDocId = `${item.productId}_${movement.depositId}`;
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${inventoryDocId}`);
          const change = movement.type === 'entrada' ? -item.quantity : item.quantity;
          transaction.set(stockDocRef, { quantity: increment(change), lastUpdated: serverTimestamp() }, { merge: true });
        }
        transaction.delete(movementDocRef);
    }).then(() => {
        toast({
            title: 'Remito Anulado',
            description: `El remito ${movement.remitoNumber} ha sido anulado y el stock ha sido revertido.`,
        });
    }).catch((error: any) => {
        const permissionError = new FirestorePermissionError({
            path: movementDocRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleExportToExcel = () => {
    const dataToExport = filteredMovements.flatMap(mov => 
        mov.items.map(item => ({
            'Fecha': format(mov.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: es }),
            'Remito Nº': mov.remitoNumber || '-',
            'Tipo': mov.type,
            'Depósito': mov.depositName,
            'Origen/Destino': mov.actorName || '-',
            'ID Usuario': mov.userId,
            'Producto (Nombre)': item.productName,
            'Producto (ID)': item.productId,
            'Cantidad': item.quantity,
            'Unidad': item.unit,
            'Precio Unitario': item.price,
            'Subtotal': item.total,
            'Valor Total Remito': mov.totalValue,
        }))
    );

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');
    XLSX.writeFile(workbook, 'Movimientos.xlsx');
  };

  const handleExportToPdf = () => {
    if (!filteredMovements || filteredMovements.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No hay datos',
        description: 'No hay movimientos filtrados para exportar.',
      });
      return;
    }

    setIsGeneratingPdf(true);
    
    const doc = new jsPDF();
    
    const tableData = filteredMovements.flatMap(mov => 
      mov.items.map(item => [
        format(mov.createdAt.toDate(), 'dd/MM/yy', { locale: es }),
        mov.remitoNumber || '-',
        mov.type,
        item.productName,
        `${item.quantity} ${item.unit}`,
        mov.actorName || mov.userId, 
      ])
    );
    
    const appName = workspaceData?.name || workspaceData?.appName || 'Reporte de Movimientos';
    const date = format(new Date(), 'dd/MM/yyyy');

    doc.setFontSize(18);
    doc.text(appName, 14, 22);
    doc.setFontSize(11);
    doc.text('Reporte de Movimientos de Stock', 14, 30);
    doc.text(`Fecha: ${date}`, 150, 30);

    autoTable(doc, {
      startY: 35,
      head: [['Fecha', 'Remito Nº', 'Tipo', 'Producto', 'Cantidad', 'Actor/Usuario']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 160, 133] },
    });
    
    doc.save('Reporte_Movimientos.pdf');
    setIsGeneratingPdf(false);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  };
  
  const isDataLoading = isLoading || isLoadingMovements;
  
  if (isDataLoading && !movements) {
    return <MovementPageSkeleton />;
  }


  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Movimientos de Stock</h1>
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
                              disabled={isJefeDeposito && deposits?.length === 1}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona un depósito" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {deposits?.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {movementType === 'entrada' && (
                        <FormField
                          control={form.control}
                          name="actorId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Proveedor (Opcional)</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue
                                      placeholder="Selecciona un proveedor"
                                    />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {suppliers?.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      )}
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
                                      !selectedDepositId
                                        ? 'Selecciona un depósito primero'
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
                  <CardFooter className="flex items-center gap-4">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Registrar Remito
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => append({ productId: '', quantity: 1 })}
                      disabled={!selectedDepositId && !isJefeDeposito}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Agregar Producto
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
              {isJefeDeposito ? <CardDescription>Solo se muestran los movimientos de tus depósitos asignados.</CardDescription> : <CardDescription>Filtra y busca entre todos los remitos generados.</CardDescription>}
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
                    <SelectItem value="ajuste">Ajuste</SelectItem>
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
                 <Button onClick={handleExportToExcel} variant="outline" className="w-full sm:w-auto">
                  <FileDown className="mr-2 h-4 w-4" />
                  Excel
                </Button>
                <Button onClick={handleExportToPdf} variant="outline" className="w-full sm:w-auto" disabled={isGeneratingPdf}>
                  {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  PDF
                </Button>
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
                          {isJefeDeposito && (assignedDepositIds === null || assignedDepositIds.length === 0)
                            ? "No tienes depósitos asignados para ver movimientos."
                            : "No se encontraron movimientos con los filtros aplicados."
                          }
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoadingMovements &&
                      (filteredMovements || [])
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
                                    : mov.type === 'salida'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-blue-100 text-blue-800'
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
                               {mov.type === 'ajuste' && mov.items[0]?.quantity < 0 ? '-' : ''}
                               {formatPrice(Math.abs(mov.totalValue || 0))}
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

// --- Main Page Component (Wrapper) ---
export default function MovimientosPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const canAccessPage = useMemo(() => {
    if (!currentUserProfile?.role) return false;
    return ['administrador', 'editor', 'jefe_deposito', 'solicitante', 'visualizador'].includes(currentUserProfile.role);
  }, [currentUserProfile?.role]);

  if (isUserLoading || isLoadingProfile) {
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

  return <MovimientosContent currentUserProfile={currentUserProfile!} />;
}

    