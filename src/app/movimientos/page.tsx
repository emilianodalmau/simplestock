
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
  where,
  getDocs,
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
import { Loader2, Trash2, PlusCircle } from 'lucide-react';
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
  type: 'entrada' | 'salida';
  depositName: string;
  actorName?: string;
  createdAt: {
    toDate: () => Date;
  };
  items: StockMovementItem[];
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
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
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

  const movementsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'stockMovements') : null, [firestore]);
  const { data: movements, isLoading: isLoadingMovements } = useCollection<StockMovement>(movementsCollection);

  const isLoading = isLoadingProducts || isLoadingDeposits || isLoadingClients || isLoadingSuppliers || isLoadingMovements;

  // --- Form Setup ---
  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: { type: 'salida', depositId: '', items: [{ productId: '', quantity: 1 }] },
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
      await runTransaction(firestore, async (transaction) => {
        const movementRef = doc(collection(firestore, 'stockMovements'));
        const movementItems: StockMovementItem[] = [];

        for (const item of data.items) {
          const product = productsMap.get(item.productId);
          if (!product) throw new Error(`Producto no encontrado.`);
          
          movementItems.push({ productId: product.id, productName: product.name, quantity: item.quantity, unit: product.unit });

          const inventoryQuery = query(collection(firestore, 'inventory'), where('depositId', '==', data.depositId), where('productId', '==', item.productId));
          const inventorySnap = await getDocs(inventoryQuery);
          const stockDoc = inventorySnap.docs[0];

          if (data.type === 'salida') {
            if (!stockDoc || stockDoc.data().quantity < item.quantity) {
              throw new Error(`Stock insuficiente para ${product.name}.`);
            }
            transaction.update(stockDoc.ref, { quantity: increment(-item.quantity) });
          } else {
            if (stockDoc) {
              transaction.update(stockDoc.ref, { quantity: increment(item.quantity) });
            } else {
              const newStockRef = doc(collection(firestore, 'inventory'));
              transaction.set(newStockRef, { depositId: data.depositId, productId: item.productId, quantity: item.quantity, lastUpdated: serverTimestamp() });
            }
          }
        }
        
        const deposit = deposits?.find(d => d.id === data.depositId);
        const actor = actors?.find(a => a.id === data.actorId);

        transaction.set(movementRef, {
          type: data.type,
          depositId: data.depositId,
          depositName: deposit?.name || 'N/A',
          actorId: data.actorId || null,
          actorName: actor?.name || null,
          actorType: data.actorId ? (data.type === 'salida' ? 'client' : 'supplier') : null,
          createdAt: serverTimestamp(),
          userId: user.uid,
          items: movementItems,
        });
      });

      toast({ title: 'Movimiento Registrado', description: `El remito de ${data.type} ha sido registrado.` });
      form.reset({ type: 'salida', depositId: '', actorId: '', items: [{ productId: '', quantity: 1 }] });
    } catch (error: any) {
      console.error('Error procesando el movimiento:', error);
      toast({ variant: 'destructive', title: 'Error en el movimiento', description: error.message || 'Ocurrió un error.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const canManageMovements = currentUserProfile?.role === 'administrador' || currentUserProfile?.role === 'editor';

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
                      <Select onValueChange={field.onChange} value={field.value} disabled={!actors}>
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
                    {form.formState.errors.items && <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.items.root?.message}</p>}
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Origen/Destino</TableHead>
                  <TableHead>Productos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center h-24">No hay movimientos registrados.</TableCell></TableRow>}
                {movements?.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="font-medium">{format(mov.createdAt.toDate(), 'PPpp', { locale: es })}</TableCell>
                    <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${mov.type === 'entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {mov.type.charAt(0).toUpperCase() + mov.type.slice(1)}
                        </span>
                    </TableCell>
                    <TableCell>{mov.depositName}</TableCell>
                    <TableCell>{mov.actorName || '-'}</TableCell>
                    <TableCell>{mov.items.length}</TableCell>
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

