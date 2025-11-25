
'use client';

import { useState, useMemo } from 'react';
import {
  useForm,
  useFieldArray,
  type SubmitHandler,
} from 'react-hook-form';
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

// --- Data Types ---
type Product = { id: string; name: string; unit: string; code: string };
type Deposit = { id: string; name: string };
type Client = { id: string; name: string };
type Supplier = { id: string; name: string };
type UserProfile = { role?: 'administrador' | 'editor' | 'visualizador' };
type StockMovementItem = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
};
type StockMovement = {
  id: string;
  remitoNumber?: string;
  type: 'entrada' | 'salida';
  depositId: string;
  depositName: string;
  actorName?: string;
  createdAt: {
    toDate: () => Date;
  };
  items: StockMovementItem[];
};
type InventoryStock = {
  productId: string;
  depositId: string;
  quantity: number;
};

// --- Zod Schemas ---
const movementItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto.'),
  quantity: z.coerce.number().min(0.1, 'La cantidad debe ser mayor a 0.'),
});

const movementFormSchema = z.object({
  type: z.enum(['entrada', 'salida']),
  depositId: z.string().min(1, 'Selecciona un depósito.'),
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
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  // --- Data Loading ---
  const userDocRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: currentUserProfile } = useDoc<UserProfile>(userDocRef);
  
  const productsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'products') : null, [firestore]);
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(productsCollection);

  const depositsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'deposits') : null, [firestore]);
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsCollection);

  const clientsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'clients') : null, [firestore]);
  const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsCollection);

  const suppliersCollection = useMemoFirebase(() => firestore ? collection(firestore, 'suppliers') : null, [firestore]);
  const { data: suppliers, isLoading: isLoadingSuppliers } = useCollection<Supplier>(suppliersCollection);

  const movementsCollection = useMemoFirebase(() => firestore ? query(collection(firestore, 'stockMovements')) : null, [firestore]);
  const { data: movements, isLoading: isLoadingMovements } = useCollection<StockMovement>(movementsCollection);

  const isLoading = isLoadingProducts || isLoadingDeposits || isLoadingClients || isLoadingSuppliers || isLoadingMovements;

  // --- Form Setup ---
  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: { type: 'salida', depositId: '', actorId: '', items: [{ productId: '', quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const movementType = form.watch('type');

  // --- Data Memoization for UI ---
  const productsMap = useMemo(() => new Map(products?.map(p => [p.id, p])), [products]);
  const actors = useMemo(() => (movementType === 'salida' ? clients : suppliers), [movementType, clients, suppliers]);
  const actorLabel = movementType === 'salida' ? 'Cliente' : 'Proveedor';

  // --- Form Submission Logic ---
  const onSubmit: SubmitHandler<MovementFormValues> = async (data) => {
    if (!firestore || !user) return;
    setIsSubmitting(true);

    try {
      // --- PHASE 1: AGGREGATE QUANTITIES (outside transaction) ---
      // This is the key change to correctly handle multiple lines for the same product.
      const productChanges = new Map<string, number>();
      for (const item of data.items) {
        if (item.productId) {
          const change = data.type === 'salida' ? -item.quantity : item.quantity;
          productChanges.set(
            item.productId,
            (productChanges.get(item.productId) || 0) + change
          );
        }
      }

      await runTransaction(firestore, async (transaction) => {
        const stockChecks = [];

        // --- PHASE 2.1: READ all necessary documents ---
        for (const [productId, change] of productChanges.entries()) {
          const product = productsMap.get(productId);
          if (!product) throw new Error(`Producto con ID ${productId} no encontrado.`);

          const inventoryDocId = `${productId}_${data.depositId}`;
          const stockDocRef = doc(firestore, 'inventory', inventoryDocId);
          const stockDocSnap = await transaction.get(stockDocRef);
          
          stockChecks.push({
            ref: stockDocRef,
            snap: stockDocSnap,
            change: change,
            productName: product.name,
            productId: product.id
          });
        }
        
        // --- PHASE 2.2: VALIDATE all reads ---
        if (data.type === 'salida') {
            for (const check of stockChecks) {
                const currentQuantity = check.snap.exists() ? check.snap.data().quantity : 0;
                const quantityToWithdraw = -check.change; // change is negative for salidas

                if (currentQuantity < quantityToWithdraw) {
                    throw new Error(`Stock insuficiente para ${check.productName}. Stock actual: ${currentQuantity}, se necesitan: ${quantityToWithdraw}.`);
                }
            }
        }
        
        // --- PHASE 2.3: GET NEW REMITO NUMBER ---
        const counterRef = doc(firestore, 'counters', 'remitoCounter');
        const counterSnap = await transaction.get(counterRef);
        const lastNumber = counterSnap.exists() ? counterSnap.data().lastNumber : 0;
        const newRemitoNumber = lastNumber + 1;
        const formattedRemitoNumber = `R-${String(newRemitoNumber).padStart(5, '0')}`;

        // --- PHASE 3: WRITE all changes ---
        transaction.set(counterRef, { lastNumber: newRemitoNumber }, { merge: true });

        for (const check of stockChecks) {
          transaction.set(
            check.ref,
            {
              quantity: increment(check.change),
              lastUpdated: serverTimestamp(),
              productId: check.productId,
              depositId: data.depositId,
            },
            { merge: true }
          );
        }

        // Prepare final movement document data from original form data
        const movementItemsForDoc: StockMovementItem[] = data.items.map(item => {
            const product = productsMap.get(item.productId);
            return {
                productId: item.productId,
                productName: product?.name || 'N/A',
                quantity: item.quantity,
                unit: product?.unit || 'N/A',
            };
        });

        const deposit = deposits?.find((d) => d.id === data.depositId);
        const actor = actors?.find((a) => a.id === data.actorId);
        const movementRef = doc(collection(firestore, 'stockMovements'));

        transaction.set(movementRef, {
            id: movementRef.id,
            remitoNumber: formattedRemitoNumber,
            type: data.type,
            depositId: data.depositId,
            depositName: deposit?.name || 'N/A',
            actorId: data.actorId || null,
            actorName: actor?.name || null,
            actorType: data.actorId ? (data.type === 'salida' ? 'client' : 'supplier') : null,
            createdAt: serverTimestamp(),
            userId: user.uid,
            items: movementItemsForDoc,
        });
      });

      toast({
          title: 'Movimiento Registrado',
          description: `El remito ha sido registrado exitosamente.`,
      });
      form.reset({
          type: 'salida',
          depositId: '',
          actorId: '',
          items: [{ productId: '', quantity: 1 }],
      });
    } catch (error: any) {
        console.error('Error procesando el movimiento:', error);
        toast({
            variant: 'destructive',
            title: 'Error en el movimiento',
            description: error.message || 'Ocurrió un error al procesar el remito.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteMovement = async (movement: StockMovement) => {
    if (!firestore) return;

    try {
        await runTransaction(firestore, async (transaction) => {
            // 1. Revert stock for each item in the movement
            for (const item of movement.items) {
                const inventoryDocId = `${item.productId}_${movement.depositId}`;
                const stockDocRef = doc(firestore, 'inventory', inventoryDocId);
                
                // The change is the opposite of the original movement type
                const change = movement.type === 'entrada' ? -item.quantity : item.quantity;
                
                transaction.set(stockDocRef, {
                    quantity: increment(change),
                    lastUpdated: serverTimestamp(),
                }, { merge: true });
            }

            // 2. Delete the movement document itself
            const movementDocRef = doc(firestore, 'stockMovements', movement.id);
            transaction.delete(movementDocRef);
        });

        toast({
            title: 'Remito Eliminado',
            description: `El remito ${movement.remitoNumber} ha sido eliminado y el stock ha sido revertido.`,
        });

    } catch (error: any) {
        console.error('Error deleting movement:', error);
        toast({
            variant: 'destructive',
            title: 'Error al Eliminar',
            description: error.message || 'No se pudo eliminar el remito. Revisa los permisos.',
        });
    }
};

  
  const canManageMovements = currentUserProfile?.role === 'administrador' || currentUserProfile?.role === 'editor';
  const isAdmin = currentUserProfile?.role === 'administrador';


  if (isLoading) {
    return <MovementPageSkeleton />;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      {canManageMovements && (
        <Card>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle>Registrar Nuevo Remito</CardTitle>
                <CardDescription>Completa el formulario para registrar una entrada o salida de productos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField control={form.control} name="type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Movimiento</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="salida">Salida</SelectItem>
                          <SelectItem value="entrada">Entrada</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="depositId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Depósito</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un depósito" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {deposits?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                   <FormField control={form.control} name="actorId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{actorLabel} (Opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl><SelectTrigger><SelectValue placeholder={`Selecciona un ${actorLabel.toLowerCase()}`} /></SelectTrigger></FormControl>
                        <SelectContent>
                           {actors?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">Productos del Remito</h3>
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: '', quantity: 1 })}><PlusCircle className="mr-2 h-4 w-4" />Agregar Producto</Button>
                  </div>
                  <div className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-[1fr_120px_auto] sm:grid-cols-[1fr_150px_150px_auto] gap-2 items-start p-4 border rounded-md">
                        <FormField control={form.control} name={`items.${index}.productId`} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="sr-only">Producto</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un producto" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {products?.map((p) => <SelectItem key={p.id} value={p.id}>{`${p.name} (${p.code})`}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="sr-only">Cantidad</FormLabel>
                            <FormControl><Input type="number" placeholder="Cantidad" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="hidden sm:flex items-center justify-center h-10 px-3 text-sm text-muted-foreground font-medium bg-muted rounded-md">
                          {productsMap.get(form.watch(`items.${index}.productId`))?.unit || '-'}
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    {form.formState.errors.items && <p className="text-sm font-medium text-destructive mt-2">{typeof form.formState.errors.items === 'string' ? form.formState.errors.items : (form.formState.errors.items as any).root?.message}</p>}
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar Remito</Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de Movimientos</CardTitle>
        </CardHeader>
        <CardContent>
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
                  {canManageMovements && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingMovements && [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        {canManageMovements && <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>}
                    </TableRow>
                ))}
                {!isLoadingMovements && movements?.length === 0 && (
                    <TableRow><TableCell colSpan={canManageMovements ? 7 : 6} className="text-center h-24">No hay movimientos registrados.</TableCell></TableRow>
                )}
                {!isLoadingMovements && movements?.sort((a,b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime()).map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="font-medium">{format(mov.createdAt.toDate(), 'PPpp', { locale: es })}</TableCell>
                    <TableCell className="font-mono">{mov.remitoNumber || '-'}</TableCell>
                    <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${mov.type === 'entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {mov.type.charAt(0).toUpperCase() + mov.type.slice(1)}
                        </span>
                    </TableCell>
                    <TableCell>{mov.depositName}</TableCell>
                    <TableCell>{mov.actorName || '-'}</TableCell>
                    <TableCell>{mov.items.length}</TableCell>
                    {canManageMovements && (
                        <TableCell className="text-right">
                             <Button
                                variant="ghost"
                                size="icon"
                                disabled={true} // La edición es compleja y riesgosa, se prioriza anular y recrear.
                                title="La edición de remitos está deshabilitada para mantener la integridad del historial."
                              >
                                <Edit className="h-4 w-4" />
                                <span className="sr-only">Editar</span>
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" disabled={!isAdmin} title={!isAdmin ? "Solo los administradores pueden eliminar remitos" : "Eliminar Remito"}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                        <span className="sr-only">Eliminar</span>
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      ¿Estás seguro de que quieres anular este remito?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no se puede deshacer. Se anulará el remito <strong>{mov.remitoNumber}</strong> y se revertirán los cambios de stock asociados a él.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteMovement(mov)}
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Sí, anular remito
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                        </TableCell>
                    )}
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

    