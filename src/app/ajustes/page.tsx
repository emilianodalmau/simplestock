
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
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
  FormMessage,
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
} from 'firebase/firestore';
import type {
  Product,
  Deposit,
  UserProfile,
  InventoryStock,
  StockMovement,
} from '@/types/inventory';
import { ProductComboBox } from '@/components/ui/product-combobox';
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

const adjustmentSchema = z.object({
  productId: z.string().min(1, 'Debe seleccionar un producto.'),
  depositId: z.string().min(1, 'Debe seleccionar un depósito.'),
  actualQuantity: z.coerce
    .number()
    .min(0, 'La cantidad no puede ser negativa.'),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

// --- Componente para el formulario de nuevo ajuste ---
function NewAdjustmentForm({
  currentUserProfile,
}: {
  currentUserProfile?: UserProfile | null;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  const firestore = useFirestore();
  const { user } = useUser();

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

  const isJefeDeposito = currentUserProfile?.role === 'jefe_deposito';

  const depositsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix) return null;
    const depositsRef = collection(firestore, `${collectionPrefix}/deposits`);
    if (isJefeDeposito && user?.uid) {
      // For 'jefe_deposito', filter deposits where they are the 'jefeId'.
      return query(depositsRef, where('jefeId', '==', user.uid));
    }
    // For admins, return all deposits.
    return depositsRef;
  }, [firestore, collectionPrefix, isJefeDeposito, user?.uid]);
  
  const { data: deposits, isLoading: isLoadingDeposits } =
    useCollection<Deposit>(depositsQuery);


  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      productId: '',
      depositId: '',
      actualQuantity: 0,
    },
  });

  const selectedProductId = form.watch('productId');
  const selectedDepositId = form.watch('depositId');

  useEffect(() => {
    // If the user is a 'jefe' and their single assigned deposit has loaded,
    // automatically select it in the form.
    if (isJefeDeposito && deposits?.length === 1) {
      form.setValue('depositId', deposits[0].id, { shouldValidate: true });
    }
  }, [isJefeDeposito, deposits, form]);


  useEffect(() => {
    const fetchCurrentStock = async () => {
      if (selectedProductId && selectedDepositId && firestore && collectionPrefix) {
        setIsLoadingStock(true);
        setCurrentStock(null);
        try {
          const inventoryDocId = `${selectedProductId}_${selectedDepositId}`;
          const stockDocRef = doc(
            firestore,
            `${collectionPrefix}/inventory/${inventoryDocId}`
          );
          await runTransaction(firestore, async (transaction) => {
            const stockDoc = await transaction.get(stockDocRef);
            if (stockDoc.exists()) {
              setCurrentStock(stockDoc.data().quantity);
            } else {
              setCurrentStock(0);
            }
          });
        } catch (error) {
          console.error('Error al obtener el stock:', error);
          setCurrentStock(null);
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo obtener el stock actual.',
          });
        } finally {
          setIsLoadingStock(false);
        }
      } else {
        setCurrentStock(null);
      }
    };

    fetchCurrentStock();
  }, [selectedProductId, selectedDepositId, firestore, collectionPrefix, toast]);

  const onSubmit: SubmitHandler<AdjustmentFormValues> = async (data) => {
    if (!firestore || !collectionPrefix || currentStock === null || !user)
      return;
    setIsSubmitting(true);

    const { productId, depositId, actualQuantity } = data;
    const stockDifference = actualQuantity - currentStock;

    if (stockDifference === 0) {
      toast({
        title: 'Sin Cambios',
        description:
          'La cantidad real es igual al stock del sistema. No se realizó ningún ajuste.',
      });
      setIsSubmitting(false);
      return;
    }

    try {
      await runTransaction(firestore, async (transaction) => {
        const product = products?.find((p) => p.id === productId);
        const deposit = deposits?.find((d) => d.id === depositId);

        if (!product || !deposit) {
          throw new Error('Producto o depósito no encontrado.');
        }

        // 1. Update Inventory Stock
        const inventoryDocId = `${productId}_${depositId}`;
        const stockDocRef = doc(
          firestore,
          `${collectionPrefix}/inventory/${inventoryDocId}`
        );
        transaction.set(
          stockDocRef,
          {
            quantity: actualQuantity,
            lastUpdated: serverTimestamp(),
            productId: productId,
            depositId: depositId,
          },
          { merge: true }
        );

        // 2. Create Stock Movement for Auditing
        const movementRef = doc(
          collection(firestore, `${collectionPrefix}/stockMovements`)
        );
        const movementData = {
          id: movementRef.id,
          remitoNumber: `AJ-${Date.now()}`,
          type: 'ajuste' as const,
          depositId: depositId,
          depositName: deposit.name,
          actorName: `Ajuste manual por ${user.displayName || user.email}`,
          actorId: user.uid,
          createdAt: serverTimestamp(),
          userId: user.uid,
          totalValue: product.price * stockDifference,
          items: [
            {
              productId: productId,
              productName: product.name,
              quantity: stockDifference,
              unit: product.unit,
              price: product.price,
              total: product.price * stockDifference,
            },
          ],
        };
        transaction.set(movementRef, movementData);
      });

      toast({
        title: 'Ajuste Registrado',
        description: `Se registró un ajuste de ${stockDifference} ${
          products?.find((p) => p.id === productId)?.unit || 'unidades'
        } para el producto seleccionado.`,
      });

      form.reset({
        productId: '',
        depositId: isJefeDeposito ? deposits?.[0]?.id || '' : '',
        actualQuantity: 0,
      });
      setCurrentStock(null);
    } catch (error: any) {
      console.error('Error procesando el ajuste:', error);
      const permissionError = new FirestorePermissionError({
        path: `${collectionPrefix}/inventory/${productId}_${depositId}`,
        operation: 'write',
        requestResourceData: { quantity: actualQuantity },
      });
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>Nuevo Ajuste de Stock</CardTitle>
            <CardDescription>
              Selecciona el producto y el depósito, y luego ingresa la cantidad
              contada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="depositId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depósito</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoadingDeposits || isJefeDeposito}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isJefeDeposito && deposits?.length === 0 ? "No tienes depósitos asignados" : "Selecciona un depósito"} />
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
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Producto</FormLabel>
                    <ProductComboBox
                      products={products || []}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isLoadingProducts || !selectedDepositId}
                      noStockMessage={
                        !selectedDepositId
                          ? 'Selecciona un depósito'
                          : 'Selecciona un producto'
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {(isLoadingStock || currentStock !== null) && (
              <div className="p-4 bg-secondary rounded-md text-center">
                <p className="font-medium">Stock Actual en Sistema:</p>
                {isLoadingStock ? (
                  <Loader2 className="h-6 w-6 animate-spin inline-block mt-1" />
                ) : (
                  <span className="text-lg font-bold">{currentStock}</span>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="actualQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad Real Contada</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Ingresa la cantidad física"
                      {...field}
                      disabled={currentStock === null || isLoadingStock}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={isSubmitting || currentStock === null || isLoadingStock}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Registrar Ajuste
            </Button>
          </CardFooter>
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
        <h1 className="text-3xl font-bold tracking-tight">
          Ajustes de Inventario
        </h1>
        <p className="text-muted-foreground">
          Corrige el stock de un producto o consulta el historial de ajustes.
        </p>
      </div>

      <Tabs defaultValue="create">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
          <TabsTrigger value="create">Nuevo Ajuste</TabsTrigger>
          <TabsTrigger value="history">Historial de Ajustes</TabsTrigger>
        </TabsList>
        <TabsContent value="create" className="pt-6">
          <NewAdjustmentForm currentUserProfile={currentUserProfile} />
        </TabsContent>
        <TabsContent value="history" className="pt-6">
          <AdjustmentHistory currentUserProfile={currentUserProfile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
