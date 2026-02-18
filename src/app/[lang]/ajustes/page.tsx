
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray, type SubmitHandler } from 'react-hook-form';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, FileDown, ArrowDown, ArrowUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import {
  collection,
  doc,
  query,
  where,
  runTransaction,
  serverTimestamp,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import type {
  Product,
  Deposit,
  UserProfile,
  InventoryStock,
  StockMovement,
  Category,
} from '@/types/inventory';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
import * as XLSX from 'xlsx';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/components/ui/badge';

// --- ZOD Schemas ---
const adjustmentItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  categoryId: z.string(),
  productType: z.enum(['SIMPLE', 'COMBO']),
  unit: z.string(),
  currentStock: z.number(),
  // Use z.preprocess to handle empty string from input and convert to null
  actualQuantity: z.preprocess(
    (val) => (val === '' ? null : val),
    z.number().min(0, 'La cantidad no puede ser negativa.').nullable()
  ),
});

const bulkAdjustmentSchema = z.object({
  items: z.array(adjustmentItemSchema),
});

type BulkAdjustmentFormValues = z.infer<typeof bulkAdjustmentSchema>;

// --- Componente para el formulario de ajuste masivo ---
function BulkAdjustmentForm({
  currentUserProfile,
}: {
  currentUserProfile?: UserProfile | null;
}) {
  const [selectedDepositId, setSelectedDepositId] = useState<string>('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filters, setFilters] = useState({ name: '', category: 'all', type: 'all' });
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const workspaceId = currentUserProfile?.workspaceId;
  const collectionPrefix = useMemo(() => {
    if (!workspaceId) return null;
    return `workspaces/${workspaceId}`;
  }, [workspaceId]);

  const isJefeDeposito = currentUserProfile?.role === 'jefe_deposito';

  const depositsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix) return null;
    const depositsRef = collection(firestore, `${collectionPrefix}/deposits`);
    if (isJefeDeposito && user?.uid) {
      return query(depositsRef, where('jefeId', '==', user.uid));
    }
    return depositsRef;
  }, [firestore, collectionPrefix, isJefeDeposito, user?.uid]);
  const { data: deposits, isLoading: isLoadingDeposits } =
    useCollection<Deposit>(depositsQuery);
    
  const { data: categories, isLoading: isLoadingCategories } = useCollection<Category>(
    useMemoFirebase(() => (collectionPrefix ? collection(firestore, `${collectionPrefix}/categories`) : null), [collectionPrefix])
  );

  const form = useForm<BulkAdjustmentFormValues>({
    resolver: zodResolver(bulkAdjustmentSchema),
    defaultValues: {
      items: [],
    },
  });

  const { fields } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  
  useEffect(() => {
    if (isJefeDeposito && deposits?.length === 1) {
        setSelectedDepositId(deposits[0].id);
    }
  }, [isJefeDeposito, deposits]);


  useEffect(() => {
    const loadDataForDeposit = async () => {
      if (!selectedDepositId || !collectionPrefix || !firestore) {
        form.reset({ items: [] });
        return;
      }
      setIsLoadingData(true);

      try {
        const productsQuery = query(
          collection(firestore, `${collectionPrefix}/products`),
          where('isArchived', '==', false),
          where('depositIds', 'array-contains', selectedDepositId)
        );
        const productsSnapshot = await getDocs(productsQuery);
        const allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];

        const inventoryQuery = query(
          collection(firestore, `${collectionPrefix}/inventory`),
          where('depositId', '==', selectedDepositId)
        );
        const inventorySnapshot = await getDocs(inventoryQuery);
        const stockMap = new Map<string, number>();
        inventorySnapshot.forEach(doc => {
            const data = doc.data() as InventoryStock;
            stockMap.set(data.productId, data.quantity);
        });

        const formItems = allProducts.map(product => ({
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          categoryId: product.categoryId,
          productType: product.productType || 'SIMPLE',
          unit: product.unit,
          currentStock: stockMap.get(product.id) || 0,
          actualQuantity: null,
        }));
        
        form.reset({ items: formItems });

      } catch (error) {
        console.error('Error loading data for adjustment:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudieron cargar los productos para el depósito seleccionado.',
        });
      } finally {
        setIsLoadingData(false);
      }
    };

    loadDataForDeposit();
  }, [selectedDepositId, collectionPrefix, firestore, form, toast]);
  
  const fieldIndicesToShow = useMemo(() => {
    return fields
        .map((field, index) => ({...field, originalIndex: index}))
        .filter(field => {
            const nameMatch = filters.name === '' ||
                field.productName.toLowerCase().includes(filters.name.toLowerCase()) ||
                field.productCode.toLowerCase().includes(filters.name.toLowerCase());
            const categoryMatch = filters.category === 'all' || field.categoryId === filters.category;
            const typeMatch = filters.type === 'all' || field.productType === filters.type;
            return nameMatch && categoryMatch && typeMatch;
        })
        .map(field => field.originalIndex);
}, [fields, filters]);

  const onSubmit: SubmitHandler<BulkAdjustmentFormValues> = async (data) => {
    if (!firestore || !collectionPrefix || !user || !selectedDepositId) return;

    const adjustedItems = data.items.filter(item => 
        item.actualQuantity !== null && item.actualQuantity !== item.currentStock
    );

    if (adjustedItems.length === 0) {
      toast({ title: 'Sin cambios', description: 'No se ingresaron nuevos valores en el conteo.' });
      return;
    }

    setIsSubmitting(true);
    try {
        await runTransaction(firestore, async (transaction) => {
            const deposit = deposits?.find(d => d.id === selectedDepositId);
            if (!deposit) throw new Error('Depósito no encontrado.');

            const productsInvolved = await Promise.all(
                adjustedItems.map(item => transaction.get(doc(firestore, `${collectionPrefix}/products/${item.productId}`)))
            );

            // 1. Create one single Stock Movement for the entire adjustment
            const movementRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));
            const movementItems = adjustedItems.map((item, index) => {
                const productDoc = productsInvolved[index];
                const productData = productDoc.data() as Product;
                const stockDifference = item.actualQuantity! - item.currentStock;
                return {
                    productId: item.productId,
                    productName: item.productName,
                    quantity: stockDifference,
                    unit: item.unit,
                    price: productData?.price || 0,
                    total: (productData?.price || 0) * stockDifference,
                };
            });

            const totalValue = movementItems.reduce((acc, item) => acc + item.total, 0);

            const movementData = {
                id: movementRef.id,
                remitoNumber: `AJ-${Date.now()}`,
                type: 'ajuste' as const,
                depositId: selectedDepositId,
                depositName: deposit.name,
                actorName: `Ajuste masivo por ${user.displayName || user.email}`,
                actorId: user.uid,
                createdAt: serverTimestamp(),
                userId: user.uid,
                totalValue: totalValue,
                items: movementItems,
            };
            transaction.set(movementRef, movementData);

            // 2. Update the inventory stock for each adjusted item
            for (const item of adjustedItems) {
                const inventoryDocId = `${item.productId}_${selectedDepositId}`;
                const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${inventoryDocId}`);
                transaction.set(stockDocRef, {
                    quantity: item.actualQuantity,
                    lastUpdated: serverTimestamp(),
                    productId: item.productId,
                    depositId: selectedDepositId,
                }, { merge: true });
            }
        });

        toast({ title: 'Ajuste completado', description: `${adjustedItems.length} productos fueron ajustados con éxito.` });
        
        // Reload data after successful submission
         setSelectedDepositId(currentId => {
            const newId = currentId + ' ';
            return newId.trim();
        });


    } catch (error: any) {
        console.error('Error procesando el ajuste masivo:', error);
        const permissionError = new FirestorePermissionError({
            path: `${collectionPrefix}/inventory`,
            operation: 'write',
            requestResourceData: { adjustedItems },
        });
        errorEmitter.emit('permission-error', permissionError);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>Ajuste de Stock Masivo</CardTitle>
            <CardDescription>
              Selecciona un depósito para ver sus productos. Luego, ingresa la cantidad real contada para cada uno y guarda los cambios.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="max-w-sm">
                <FormLabel>Depósito</FormLabel>
                <Select
                    onValueChange={setSelectedDepositId}
                    value={selectedDepositId}
                    disabled={isLoadingDeposits || isJefeDeposito && deposits?.length === 1}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={isJefeDeposito && deposits?.length === 0 ? "No tienes depósitos asignados" : "Selecciona un depósito"} />
                    </SelectTrigger>
                    <SelectContent>
                        {deposits?.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                            {d.name}
                        </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {selectedDepositId && (
                <>
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                    <Input 
                        placeholder="Buscar por nombre o código..."
                        onChange={(e) => setFilters(f => ({...f, name: e.target.value}))}
                        className="flex-grow"
                    />
                    <Select value={filters.category} onValueChange={(value) => setFilters(f => ({...f, category: value}))} disabled={isLoadingCategories}>
                        <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">Todas las categorías</SelectItem>{categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={filters.type} onValueChange={(value) => setFilters(f => ({...f, type: value}))}>
                        <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Tipo de producto" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">Todos los tipos</SelectItem><SelectItem value="SIMPLE">Simple</SelectItem><SelectItem value="COMBO">Combo</SelectItem></SelectContent>
                    </Select>
                </div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-2/5">Producto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Stock Actual</TableHead>
                        <TableHead className="w-1/4 text-right">Cantidad Real Contada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingData ? (
                        [...Array(5)].map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                                <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                            </TableRow>
                        ))
                      ) : fieldIndicesToShow.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center h-24">No hay productos que coincidan con los filtros en este depósito.</TableCell>
                        </TableRow>
                      ) : (
                        fields.map((field, index) => (
                           fieldIndicesToShow.includes(index) && (
                            <TableRow key={field.id}>
                                <TableCell>
                                    <p className="font-medium">{field.productName}</p>
                                    <p className="text-sm text-muted-foreground font-mono">{field.productCode}</p>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={field.productType === 'COMBO' ? 'outline' : 'secondary'}>{field.productType}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                    {field.currentStock} {field.unit}
                                </TableCell>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.actualQuantity`}
                                        render={({ field: formField }) => (
                                            <Input 
                                                type="number" 
                                                placeholder="Contado..." 
                                                className="text-right" 
                                                {...formField} 
                                                value={formField.value ?? ''}
                                                disabled={isSubmitting || field.productType === 'COMBO'}
                                            />
                                        )}
                                    />
                                </TableCell>
                            </TableRow>
                           )
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                </>
            )}
          </CardContent>
          {selectedDepositId && (
            <CardFooter>
                <Button
                type="submit"
                disabled={isSubmitting || isLoadingData || fieldIndicesToShow.length === 0}
                >
                {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Guardar Ajustes
                </Button>
            </CardFooter>
           )}
        </form>
      </Form>
    </Card>
  );
}


// --- Componente para el historial de ajustes ---
function AdjustmentHistory({
  currentUserProfile,
}: {
  currentUserProfile?: UserProfile | null;
}) {
  const firestore = useFirestore();
  const { user } = useUser();

  const collectionPrefix = useMemo(
    () =>
      currentUserProfile?.workspaceId
        ? `workspaces/${currentUserProfile.workspaceId}`
        : null,
    [currentUserProfile]
  );
  
  const isJefeDeposito = currentUserProfile?.role === 'jefe_deposito';
  const isAdmin = currentUserProfile?.role === 'administrador';


  // Find the deposits assigned to the 'jefe_deposito'
  const depositsCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/deposits`) : null),
    [firestore, collectionPrefix]
  );
  const { data: allDeposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsCollection);
  
  const assignedDepositIds = useMemo(() => {
    if (!allDeposits) return null;
    if (isAdmin) {
      // Admin gets all deposit IDs
      return allDeposits.map(d => d.id);
    }
    if (isJefeDeposito) {
      // Jefe gets only their assigned deposits
      return allDeposits.filter(d => d.jefeId === user?.uid).map(d => d.id);
    }
    return null;
  }, [isAdmin, isJefeDeposito, allDeposits, user?.uid]);


  const adjustmentsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix || assignedDepositIds === null) return null;
    if (assignedDepositIds.length === 0) return null; // Don't query if no deposits to look into

    const movementsCollectionRef = collection(
      firestore,
      `${collectionPrefix}/stockMovements`
    );
    
    // The query is now the same for both admin and jefe, just the list of IDs changes
    return query(
      movementsCollectionRef,
      where('type', '==', 'ajuste'),
      where('depositId', 'in', assignedDepositIds),
      orderBy('createdAt', 'desc')
    );
    
  }, [firestore, collectionPrefix, assignedDepositIds]);

  const { data: adjustments, isLoading: isLoadingAdjustments } =
    useCollection<StockMovement>(adjustmentsQuery);
    
  const isLoading = isLoadingAdjustments || isLoadingDeposits;

  const handleExportToExcel = () => {
    const dataToExport = (adjustments || []).map((adj) => {
      const item = adj.items[0]; // Adjustments have only one item
      return {
        'Fecha': format(adj.createdAt.toDate(), 'dd/MM/yyyy HH:mm', {
          locale: es,
        }),
        'Remito Nº': adj.remitoNumber || '-',
        'Depósito': adj.depositName,
        'Producto': item.productName,
        'Ajuste': item.quantity,
        'Unidad': item.unit,
        'Realizado Por': adj.actorName,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial de Ajustes');
    XLSX.writeFile(workbook, 'Historial_Ajustes.xlsx');
  };

  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between'>
        <div>
            <CardTitle>Movimientos de Ajuste</CardTitle>
            <CardDescription>
                Cada fila representa una corrección de stock.
            </CardDescription>
        </div>
        <Button
            onClick={handleExportToExcel}
            variant="outline"
            disabled={!adjustments || adjustments.length === 0}
        >
            <FileDown className="mr-2 h-4 w-4" />
            Exportar
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Remito Nº</TableHead>
                <TableHead>Depósito</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Ajuste</TableHead>
                <TableHead>Realizado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-36" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && adjustments?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">
                    {(isJefeDeposito || isAdmin) && (!assignedDepositIds || assignedDepositIds.length === 0)
                      ? "No tienes depósitos asignados para ver el historial."
                      : "No se han registrado ajustes de inventario."
                    }
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                adjustments?.map((adj) => {
                  const item = adj.items[0]; // Adjustments only have one item
                  const isPositive = item.quantity > 0;
                  return (
                    <TableRow key={adj.id}>
                      <TableCell className="font-medium">
                        {format(adj.createdAt.toDate(), 'PPpp', { locale: es })}
                      </TableCell>
                      <TableCell className="font-mono">
                        {adj.remitoNumber || '-'}
                      </TableCell>
                      <TableCell>{adj.depositName}</TableCell>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell
                        className={`text-right font-bold ${
                          isPositive ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {isPositive ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )}
                          {isPositive ? '+' : ''}
                          {item.quantity} {item.unit}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {adj.actorName}
                      </TableCell>
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

// --- Página Principal ---
export default function AjustesPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { dictionary } = useI18n();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);
    
  const canAccessPage = useMemo(() => {
    if (!currentUserProfile) return false;
    return ['administrador', 'jefe_deposito'].includes(
      currentUserProfile.role!
    );
  }, [currentUserProfile]);

  if (isLoadingProfile) {
     return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
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
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          {dictionary.pages.ajustes.title}
        </h1>
        <p className="text-muted-foreground">
          {dictionary.pages.ajustes.description}
        </p>
      </div>

      <Tabs defaultValue="create">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
          <TabsTrigger value="create">Nuevo Ajuste Masivo</TabsTrigger>
          <TabsTrigger value="history">Historial de Ajustes</TabsTrigger>
        </TabsList>
        <TabsContent value="create" className="pt-6">
          <BulkAdjustmentForm currentUserProfile={currentUserProfile} />
        </TabsContent>
        <TabsContent value="history" className="pt-6">
          <AdjustmentHistory currentUserProfile={currentUserProfile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
