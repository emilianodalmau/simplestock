
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
});

type BulkAdjustmentFormValues = z.infer<typeof bulkAdjustmentSchema>;

// --- Componente BulkAdjustmentForm ---
function BulkAdjustmentForm({
  currentUserProfile,
  deposits,
}: {
  currentUserProfile: UserProfile | null;
  deposits: Deposit[] | null;
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
          remitoNumber: `AJ-${timestamp}`, // Use stable timestamp
          type: 'ajuste',
          depositId: selectedDepositId,
          depositName: depositSnap.data().name,
          actorName: user.displayName || user.email || 'Sistema',
          actorId: user.uid,
          createdAt: serverTimestamp(),
          items: movementItems,
          totalValue: 0,
        });

        for (const item of adjustedItems) {
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${item.productId}_${selectedDepositId}`);
          transaction.set(stockDocRef, {
            quantity: item.actualQuantity,
            lastUpdated: serverTimestamp(),
            productId: item.productId,
            depositId: selectedDepositId,
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
                {deposits?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedDepositId && (
              <div className="space-y-4">
                <Input placeholder="Filtrar..." onChange={(e) => setFilters(f => ({...f, name: e.target.value}))} />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Stock Actual</TableHead>
                      <TableHead className="text-right">Real</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleIndices.map(index => (
                      <TableRow key={fields[index]._rhf_id}>
                        <TableCell>{fields[index].productName}</TableCell>
                        <TableCell className="text-right">{fields[index].currentStock}</TableCell>
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
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar Ajustes'}</Button>
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

  const adjustmentsQuery = useMemoFirebase(() => {
    if (!firestore || !workspaceId) return null;
    
    // For 'jefe_deposito', we must have the list of their allowed deposits.
    if (isJefe && !deposits) return null;

    const collectionRef = collection(firestore, `workspaces/${workspaceId}/stockMovements`);
    
    const filters = [where('type', '==', 'ajuste')];
    
    if (isJefe) {
      const allowedDepositIds = deposits?.map(d => d.id);
      // If a 'jefe' has no assigned deposits, they can't see any history.
      if (!allowedDepositIds || allowedDepositIds.length === 0) {
        return null;
      }
      // Firestore 'in' query supports up to 30 elements.
      filters.push(where('depositId', 'in', allowedDepositIds.slice(0, 30)));
    }
    
    return query(
      collectionRef,
      ...filters,
      orderBy('createdAt', 'desc')
    );
  }, [firestore, workspaceId, deposits, isJefe]);

  const { data: adjustments, isLoading, error } = useCollection<StockMovement>(adjustmentsQuery);

  if (error) console.error("Error en Historial:", error);

  return (
    <Card>
      <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Depósito</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={3}>Cargando...</TableCell></TableRow> : 
             adjustments?.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
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
                <TableCell>
                  {adj.items.map((it, i) => <div key={i} className="text-xs">{it.productName}: {it.quantity > 0 ? '+' : ''}{it.quantity}</div>)}
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

  if (isLoadProfile || isLoadDeps) return <div className="p-10 text-center"><Loader2 className="animate-spin inline mr-2"/> Cargando perfil...</div>;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">{dictionary.pages.ajustes.title}</h1>
      <Tabs defaultValue="ajuste">
        <TabsList><TabsTrigger value="ajuste">Ajuste</TabsTrigger><TabsTrigger value="historial">Historial</TabsTrigger></TabsList>
        <TabsContent value="ajuste"><BulkAdjustmentForm currentUserProfile={profile} deposits={deposits} /></TabsContent>
        <TabsContent value="historial"><AdjustmentHistory currentUserProfile={profile} deposits={deposits} /></TabsContent>
      </Tabs>
    </div>
  );
}
