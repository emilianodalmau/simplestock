
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm, useFieldArray, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
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
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
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
  runTransaction,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  increment,
} from 'firebase/firestore';
import type {
  Product,
  Deposit,
  UserProfile,
  InventoryStock,
  StockMovement,
  StockMovementItem,
  Category,
} from '@/types/inventory';
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
import { useI18n } from '@/i18n/i18n-provider';

// --- ZOD Schema ---
const adjustmentItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  categoryId: z.string(),
  productType: z.enum(['SIMPLE', 'COMBO']),
  unit: z.string(),
  currentStock: z.number(),
  actualQuantity: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
    z.number().min(0, 'La cantidad no puede ser negativa.').nullable()
  ),
});

const bulkAdjustmentSchema = z.object({
  items: z.array(adjustmentItemSchema),
  observation: z.string().optional(),
});

type BulkAdjustmentFormValues = z.infer<typeof bulkAdjustmentSchema>;

// --- Componente BulkAdjustmentForm ---
function BulkAdjustmentForm({
  currentUserProfile,
  deposits,
  categories,
}: {
  currentUserProfile: UserProfile | null;
  deposits: Deposit[] | null;
  categories: Category[] | null;
}) {
  const [selectedDepositId, setSelectedDepositId] = useState<string>('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filters, setFilters] = useState({ name: '', category: 'all', type: 'all' });
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const workspaceId = currentUserProfile?.workspaceId;
  const collectionPrefix = useMemo(() => workspaceId ? `workspaces/${workspaceId}` : null, [workspaceId]);

  const form = useForm<BulkAdjustmentFormValues>({
    resolver: zodResolver(bulkAdjustmentSchema),
    defaultValues: { items: [] },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: 'items',
    keyName: "_rhf_id"
  });

  const loadDataForDeposit = useCallback(async () => {
    if (!selectedDepositId || !collectionPrefix || !firestore) {
      replace([]);
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
      
      formItems.sort((a, b) => a.productName.localeCompare(b.productName));
      
      replace(formItems);
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los productos.' });
    } finally {
      setIsLoadingData(false);
    }
  }, [selectedDepositId, collectionPrefix, firestore, replace, toast]);

  useEffect(() => { loadDataForDeposit(); }, [selectedDepositId, loadDataForDeposit]);

  const visibleIndices = useMemo(() => {
    return fields.reduce((acc: number[], field, index) => {
      const nameMatch = filters.name === '' || 
        field.productName.toLowerCase().includes(filters.name.toLowerCase()) ||
        field.productCode.toLowerCase().includes(filters.name.toLowerCase());
      const categoryMatch = filters.category === 'all' || field.categoryId === filters.category;
      const typeMatch = filters.type === 'all' || field.productType === filters.type;
      if (nameMatch && categoryMatch && typeMatch) acc.push(index);
      return acc;
    }, []);
  }, [fields, filters]);

  const onSubmit: SubmitHandler<BulkAdjustmentFormValues> = async (data) => {
    if (!firestore || !collectionPrefix || !user || !selectedDepositId) return;
    const adjustedItems = data.items.filter(item => 
        item.actualQuantity !== null && item.actualQuantity !== item.currentStock
    );
    if (adjustedItems.length === 0) {
      toast({ title: 'Sin cambios', description: 'No hay diferencias de stock para guardar.' });
      return;
    }
    setIsSubmitting(true);
    const timestamp = Date.now(); // Generate timestamp before the transaction
    try {
      await runTransaction(firestore, async (transaction) => {
        const depositSnap = await transaction.get(doc(firestore, `${collectionPrefix}/deposits/${selectedDepositId}`));
        if (!depositSnap.exists()) throw new Error('Depósito no encontrado.');
        
        const movementRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));
        const movementItems = adjustedItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.actualQuantity! - item.currentStock,
          unit: item.unit,
          price: 0,
          total: 0,
        }));

        transaction.set(movementRef, {
          id: movementRef.id,
          remitoNumber: `AJ-${timestamp}`,
          type: 'ajuste',
          depositId: selectedDepositId,
          depositName: depositSnap.data().name,
          actorName: user.displayName || user.email || 'Sistema',
          actorId: user.uid,
          createdAt: serverTimestamp(),
          items: movementItems,
          totalValue: 0,
          observation: data.observation || '',
        });

        // Track stats updates
        let lowStockDelta = 0;
        let outOfStockDelta = 0;

        for (const item of adjustedItems) {
          const productRef = doc(firestore, `${collectionPrefix}/products`, item.productId);
          const productSnap = await transaction.get(productRef);
          const productData = productSnap.data();
          const minStock = productData?.minStock || 0;
          const oldTotalStock = productData?.totalStock || 0;
          
          const delta = item.actualQuantity! - item.currentStock;
          const newTotalStock = oldTotalStock + delta;

          // Update Product totalStock
          transaction.update(productRef, { 
            totalStock: newTotalStock,
            updatedAt: serverTimestamp()
          });

          // Evaluate state changes for stats
          const wasOut = oldTotalStock <= 0;
          const isNowOut = newTotalStock <= 0;
          if (wasOut && !isNowOut) outOfStockDelta -= 1;
          if (!wasOut && isNowOut) outOfStockDelta += 1;

          const wasLow = oldTotalStock > 0 && oldTotalStock < minStock;
          const isNowLow = newTotalStock > 0 && newTotalStock < minStock;
          if (wasLow && !isNowLow) lowStockDelta -= 1;
          if (!wasLow && isNowLow) lowStockDelta += 1;

          // Update Inventory
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${item.productId}_${selectedDepositId}`);
          transaction.set(stockDocRef, {
            quantity: item.actualQuantity,
            lastUpdated: serverTimestamp(),
            productId: item.productId,
            depositId: selectedDepositId,
          }, { merge: true });
        }

        // Apply stats changes
        if (lowStockDelta !== 0 || outOfStockDelta !== 0) {
          const statsRef = doc(firestore, `${collectionPrefix}/metadata`, 'stats');
          transaction.set(statsRef, {
            lowStockCount: increment(lowStockDelta),
            outOfStockCount: increment(outOfStockDelta),
            lastUpdated: serverTimestamp(),
          }, { merge: true });
        }
      });

      toast({ title: 'Ajuste completado' });
      loadDataForDeposit();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>Ajuste Masivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Select onValueChange={setSelectedDepositId} value={selectedDepositId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un depósito" /></SelectTrigger>
              <SelectContent>
                {deposits?.sort((a, b) => a.name.localeCompare(b.name)).map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedDepositId && (
              <div className="space-y-4">
                 <div className="flex flex-col sm:flex-row gap-4">
                    <Input placeholder="Filtrar por nombre o código..." onChange={(e) => setFilters(f => ({...f, name: e.target.value}))} className="flex-grow" />
                    <Select value={filters.category} onValueChange={(value) => setFilters(f => ({...f, category: value}))}>
                        <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las categorías</SelectItem>
                            {categories?.sort((a, b) => a.name.localeCompare(b.name)).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filters.type} onValueChange={(value) => setFilters(f => ({...f, type: value as any}))}>
                        <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los tipos</SelectItem>
                            <SelectItem value="SIMPLE">Simple</SelectItem>
                            <SelectItem value="COMBO">Combo</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-4 py-4 border-t">
                    <FormField
                      control={form.control}
                      name="observation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observaciones</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Escribe el motivo del ajuste aquí..." 
                              className="resize-none"
                              {...field} 
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-start pt-2">
                        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar Ajustes'}</Button>
                    </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Stock Actual</TableHead>
                      <TableHead className="text-right">Real</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingData && (
                        <TableRow>
                            <TableCell colSpan={3} className="text-center h-48">
                                <Loader2 className="animate-spin inline mr-2"/>
                                Cargando productos...
                            </TableCell>
                        </TableRow>
                    )}
                    {!isLoadingData && visibleIndices.length === 0 && (
                         <TableRow>
                            <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                No se encontraron productos para este depósito o filtros.
                            </TableCell>
                        </TableRow>
                    )}
                    {!isLoadingData && visibleIndices.map(index => (
                      <TableRow key={fields[index]._rhf_id}>
                        <TableCell>
                            <p className="font-medium">{fields[index].productName}</p>
                            <p className="text-sm text-muted-foreground font-mono">{fields[index].productCode}</p>
                        </TableCell>
                        <TableCell className="text-right">{fields[index].currentStock} {fields[index].unit}</TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`items.${index}.actualQuantity`}
                            render={({ field: f }) => (
                              <Input 
                                type="number" 
                                {...f} 
                                value={f.value ?? ''} 
                                onChange={e => f.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                className="text-right w-24 ml-auto"
                              />
                            )}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </form>
      </Form>
    </Card>
  );
}

// --- Componente AdjustmentHistory ---
function AdjustmentHistory({ 
    currentUserProfile,
    deposits
}: { 
    currentUserProfile?: UserProfile | null,
    deposits: Deposit[] | null
}) {
  const firestore = useFirestore();
  
  const workspaceId = currentUserProfile?.workspaceId;
  const isJefe = currentUserProfile?.role === 'jefe_deposito';

  const movementsQuery = useMemoFirebase(() => {
    if (!firestore || !workspaceId) return null;
    if (isJefe && !deposits) return null;

    const collectionRef = collection(firestore, `workspaces/${workspaceId}/stockMovements`);
    
    let finalQuery;
    
    if (isJefe) {
      const allowedDepositIds = deposits?.map(d => d.id) || [];
      if (allowedDepositIds.length === 0) return null;
      finalQuery = query(collectionRef, where('depositId', 'in', allowedDepositIds.slice(0, 30)));
    } else {
      finalQuery = query(collectionRef, orderBy('createdAt', 'desc'));
    }
    
    return finalQuery;

  }, [firestore, workspaceId, deposits, isJefe]);

  const { data: allMovements, isLoading, error } = useCollection<StockMovement>(movementsQuery);
  
  const adjustments = useMemo(() => {
    if (!allMovements) return null;
    return allMovements.filter(movement => movement.type === 'ajuste');
  }, [allMovements]);

  return (
    <Card>
      <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Depósito</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Observación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5}>Cargando historial...</TableCell></TableRow> : 
             error ? <TableRow><TableCell colSpan={5} className="text-destructive">Error al cargar historial: {error.message}</TableCell></TableRow> :
             adjustments?.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                        {isJefe && (!deposits || deposits.length === 0) 
                            ? "No tienes depósitos asignados." 
                            : "No hay historial de ajustes."
                        }
                    </TableCell>
                </TableRow>
             ) :
             adjustments?.map(adj => (
              <TableRow key={adj.id}>
                <TableCell>{adj.createdAt?.toDate ? format(adj.createdAt.toDate(), 'dd/MM/yy HH:mm') : 'Fecha inválida'}</TableCell>
                <TableCell>{adj.depositName}</TableCell>
                <TableCell>{adj.actorName || '-'}</TableCell>
                <TableCell>
                  {adj.items.map((it, i) => <div key={i} className="text-xs">{it.productName}: {it.quantity > 0 ? '+' : ''}{it.quantity}</div>)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground italic">
                  {adj.observation || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// --- Página Principal ---
export default function AjustesPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { dictionary } = useI18n();

  const { data: profile, isLoading: isLoadProfile } = useDoc<UserProfile>(
    useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user, firestore])
  );

  const colPrefix = useMemo(() => profile?.workspaceId ? `workspaces/${profile.workspaceId}` : null, [profile]);

  const { data: deposits, isLoading: isLoadDeps } = useCollection<Deposit>(
    useMemoFirebase(() => {
      if (!firestore || !colPrefix || !profile) return null;
      const ref = collection(firestore, `${colPrefix}/deposits`);
      // An admin can see all deposits, a jefe only sees their own.
      return profile?.role === 'jefe_deposito' && user?.uid ? query(ref, where('jefeId', '==', user.uid)) : ref;
    }, [firestore, colPrefix, profile, user])
  );

  const { data: categories, isLoading: isLoadCats } = useCollection<Category>(
    useMemoFirebase(() => {
        if (!firestore || !colPrefix) return null;
        return collection(firestore, `${colPrefix}/categories`);
    }, [firestore, colPrefix])
  );

  if (isLoadProfile || isLoadDeps || isLoadCats) return <div className="p-10 text-center"><Loader2 className="animate-spin inline mr-2"/> Cargando...</div>;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">{dictionary.pages.ajustes.title}</h1>
      <Tabs defaultValue="ajuste">
        <TabsList><TabsTrigger value="ajuste">Ajuste</TabsTrigger><TabsTrigger value="historial">Historial</TabsTrigger></TabsList>
        <TabsContent value="ajuste"><BulkAdjustmentForm currentUserProfile={profile} deposits={deposits} categories={categories} /></TabsContent>
        <TabsContent value="historial"><AdjustmentHistory currentUserProfile={profile} deposits={deposits} /></TabsContent>
      </Tabs>
    </div>
  );
}
