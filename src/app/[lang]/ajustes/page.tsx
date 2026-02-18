
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
  actualQuantity: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
    z.number().min(0, 'La cantidad no puede ser negativa.').nullable()
  ),
});

const bulkAdjustmentSchema = z.object({
  items: z.array(adjustmentItemSchema),
});

type BulkAdjustmentFormValues = z.infer<typeof bulkAdjustmentSchema>;

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
  const collectionPrefix = useMemo(() => workspaceId ? `workspaces/${workspaceId}` : null, [workspaceId]);
  const isJefeDeposito = currentUserProfile?.role === 'jefe_deposito';

  // Queries
  const depositsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix) return null;
    const depositsRef = collection(firestore, `${collectionPrefix}/deposits`);
    return isJefeDeposito && user?.uid ? query(depositsRef, where('jefeId', '==', user.uid)) : depositsRef;
  }, [firestore, collectionPrefix, isJefeDeposito, user?.uid]);

  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsQuery);
  
  const { data: categories, isLoading: isLoadingCategories } = useCollection<Category>(
    useMemoFirebase(() => (collectionPrefix ? collection(firestore, `${collectionPrefix}/categories`) : null), [collectionPrefix])
  );

  const form = useForm<BulkAdjustmentFormValues>({
    resolver: zodResolver(bulkAdjustmentSchema),
    defaultValues: { items: [] },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: 'items',
    keyName: "_rhf_id"
  });

  useEffect(() => {
    if (isJefeDeposito && deposits?.length === 1) {
      setSelectedDepositId(deposits[0].id);
    }
  }, [isJefeDeposito, deposits]);

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
      toast({ title: 'Sin cambios', description: 'No se ingresaron nuevos valores diferentes al stock actual.' });
      return;
    }

    setIsSubmitting(true);
    const timestamp = Date.now(); 

    try {
      await runTransaction(firestore, async (transaction) => {
        const depositSnap = await transaction.get(doc(firestore, `${collectionPrefix}/deposits/${selectedDepositId}`));
        if (!depositSnap.exists()) throw new Error('Depósito no encontrado.');
        const deposit = depositSnap.data();

        const movementRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));
        
        const movementItems: StockMovementItem[] = [];

        for (const item of adjustedItems) {
            const productRef = doc(firestore, `${collectionPrefix}/products/${item.productId}`);
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) {
                throw new Error(`El producto "${item.productName}" ya no existe.`);
            }
            const productData = productSnap.data() as Product;
            const stockDifference = item.actualQuantity! - item.currentStock;
            movementItems.push({
                productId: item.productId,
                productName: item.productName,
                quantity: stockDifference,
                unit: item.unit,
                price: productData.price || 0,
                total: (productData.price || 0) * stockDifference,
            });
        }
        
        const totalValue = movementItems.reduce((acc, item) => acc + item.total, 0);

        const movementData: Omit<StockMovement, 'id' | 'createdAt'> = {
          remitoNumber: `AJ-${timestamp}`,
          type: 'ajuste',
          depositId: selectedDepositId,
          depositName: deposit.name,
          actorName: user.displayName || user.email || 'Sistema',
          actorId: user.uid,
          userId: user.uid,
          totalValue,
          items: movementItems,
        };

        transaction.set(movementRef, { ...movementData, id: movementRef.id, createdAt: serverTimestamp() });

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

      toast({ title: 'Ajuste completado', description: 'Inventario actualizado correctamente.' });
      loadDataForDeposit();
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error al Guardar Ajuste', description: error.message || 'No se pudo completar la operación.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, (errors) => console.log("Errores de validación:", errors))}>
          <CardHeader>
            <CardTitle>Ajuste de Stock Masivo</CardTitle>
            <CardDescription>Ingrese la cantidad real contada para cada producto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="max-w-sm">
              <FormLabel>Depósito</FormLabel>
              <Select onValueChange={setSelectedDepositId} value={selectedDepositId} disabled={isLoadingData}>
                <SelectTrigger><SelectValue placeholder="Selecciona un depósito" /></SelectTrigger>
                <SelectContent>
                  {deposits?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {selectedDepositId && (
              <>
                <div className="flex flex-col gap-4 sm:flex-row items-center">
                  <Input placeholder="Buscar..." onChange={(e) => setFilters(f => ({...f, name: e.target.value}))} className="flex-grow" />
                  <Button type="submit" disabled={isSubmitting || isLoadingData}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Ajustes
                  </Button>
                </div>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Stock Actual</TableHead>
                        <TableHead className="w-1/4 text-right">Cantidad Real</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingData ? (
                        <TableRow><TableCell colSpan={3}><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                      ) : visibleIndices.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center">No hay productos.</TableCell></TableRow>
                      ) : (
                        visibleIndices.map((index) => {
                          const field = fields[index];
                          return (
                            <TableRow key={field._rhf_id}>
                              <TableCell>
                                <p className="font-medium">{field.productName}</p>
                                <p className="text-xs text-muted-foreground">{field.productCode}</p>
                              </TableCell>
                              <TableCell className="text-right">{field.currentStock} {field.unit}</TableCell>
                              <TableCell>
                                <FormField
                                  control={form.control}
                                  name={`items.${index}.actualQuantity`}
                                  render={({ field: formField }) => (
                                    <Input 
                                      {...formField}
                                      type="number"
                                      className="text-right"
                                      value={formField.value ?? ''}
                                      onChange={(e) => formField.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                      disabled={isSubmitting || field.productType === 'COMBO'}
                                    />
                                  )}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </form>
      </Form>
    </Card>
  );
}

function AdjustmentHistory({ currentUserProfile }: { currentUserProfile?: UserProfile | null; }) {
  const firestore = useFirestore();
  const workspaceId = currentUserProfile?.workspaceId;
  const collectionPrefix = useMemo(() => workspaceId ? `workspaces/${workspaceId}` : null, [workspaceId]);

  const adjustmentsQuery = useMemoFirebase(() => {
    if (!collectionPrefix) return null;
    return query(
      collection(firestore, `${collectionPrefix}/stockMovements`),
      where('type', '==', 'ajuste'),
      orderBy('createdAt', 'desc')
    );
  }, [collectionPrefix, firestore]);

  const { data: adjustments, isLoading } = useCollection<StockMovement>(adjustmentsQuery);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de Ajustes</CardTitle>
        <CardDescription>Consulta los ajustes de stock realizados anteriormente.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Remito Nº</TableHead>
                <TableHead>Depósito</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5}><Skeleton className="h-20 w-full" /></TableCell></TableRow>}
              {!isLoading && (!adjustments || adjustments.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center h-24">No hay ajustes registrados.</TableCell></TableRow>
              )}
              {!isLoading && adjustments?.map(adj => (
                <TableRow key={adj.id}>
                  <TableCell>{format(adj.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: es })}</TableCell>
                  <TableCell className="font-mono">{adj.remitoNumber}</TableCell>
                  <TableCell>{adj.depositName}</TableCell>
                  <TableCell>{adj.actorName}</TableCell>
                  <TableCell>
                     <ul className="list-disc list-inside">
                      {adj.items.map((item, index) => (
                        <li key={index} className="text-sm">
                          {item.productName}: <span className="font-medium">{item.quantity > 0 ? '+' : ''}{item.quantity} {item.unit}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AjustesPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { dictionary } = useI18n();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const isLoading = isUserLoading || isLoadingProfile;

  const canAccessPage = useMemo(() => {
    if (!currentUserProfile?.role) return false;
    return ['administrador', 'jefe_deposito'].includes(currentUserProfile.role);
  }, [currentUserProfile?.role]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 flex justify-center items-center">
        <Loader2 className="animate-spin h-12 w-12" />
      </div>
    );
  }

  if (!canAccessPage) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>No tienes permisos para ver esta página.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
       <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.ajustes.title}</h1>
        <p className="text-muted-foreground">{dictionary.pages.ajustes.description}</p>
      </div>
      <Tabs defaultValue="ajuste">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="ajuste">Ajuste Masivo</TabsTrigger>
          <TabsTrigger value="historial">Historial de Ajustes</TabsTrigger>
        </TabsList>
        <TabsContent value="ajuste" className="pt-6">
          <BulkAdjustmentForm currentUserProfile={currentUserProfile} />
        </TabsContent>
        <TabsContent value="historial" className="pt-6">
          <AdjustmentHistory currentUserProfile={currentUserProfile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

    