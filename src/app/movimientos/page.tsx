
'use client';

import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
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
  writeBatch,
  doc,
  serverTimestamp,
  query,
  where,
  getDocs,
  increment,
  runTransaction,
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
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

// Schemas and Types
const movementSchema = z.object({
  type: z.enum(['entrada', 'salida'], {
    required_error: 'El tipo de movimiento es requerido.',
  }),
  productId: z.string().min(1, 'Debe seleccionar un producto.'),
  depositId: z.string().min(1, 'Debe seleccionar un depósito.'),
  quantity: z.coerce.number().min(1, 'La cantidad debe ser mayor a 0.'),
  reason: z.string().min(3, 'El motivo es requerido.'),
});

type MovementFormValues = z.infer<typeof movementSchema>;

type Product = { id: string; name: string, code: string };
type Deposit = { id: string; name: string };
type StockMovement = {
  id: string;
  type: 'entrada' | 'salida';
  date: { seconds: number };
  reason: string;
  productName: string;
  depositName: string;
  quantity: number;
};
type UserProfile = { id: string; role?: 'administrador' | 'editor' | 'visualizador' };

export default function MovimientosPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();

  // Data fetching
  const userDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingUser } = useDoc<UserProfile>(userDocRef);

  const canManageMovements = currentUserProfile?.role === 'administrador' || currentUserProfile?.role === 'editor';

  const productsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'products') : null, [firestore]);
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(productsCollection);

  const depositsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'deposits') : null, [firestore]);
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsCollection);

  const movementsCollection = useMemoFirebase(() => (firestore && canManageMovements) ? collection(firestore, 'stockMovements') : null, [firestore, canManageMovements]);
  const { data: movements, isLoading: isLoadingMovements } = useCollection<StockMovement>(movementsCollection);

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: {
      type: 'entrada',
      productId: '',
      depositId: '',
      quantity: 1,
      reason: '',
    },
  });

  const onSubmit: SubmitHandler<MovementFormValues> = async (data) => {
    if (!firestore || !currentUser) return;
    setIsSubmitting(true);
    
    try {
      await runTransaction(firestore, async (transaction) => {
        const { productId, depositId, quantity, type, reason } = data;

        // 1. Find the specific inventory stock document
        const inventoryQuery = query(
          collection(firestore, 'inventory'),
          where('productId', '==', productId),
          where('depositId', '==', depositId)
        );
        const inventorySnap = await getDocs(inventoryQuery);
        const stockDoc = inventorySnap.docs[0];

        let currentStock = 0;
        if(stockDoc && stockDoc.exists()) {
            currentStock = stockDoc.data().quantity;
        }

        // 2. Check for sufficient stock on 'salida'
        if (type === 'salida' && currentStock < quantity) {
          throw new Error('Stock insuficiente para realizar la salida.');
        }

        // 3. Create the stock movement record
        const movementRef = doc(collection(firestore, 'stockMovements'));
        const productName = products?.find(p => p.id === productId)?.name || 'Desconocido';
        const depositName = deposits?.find(d => d.id === depositId)?.name || 'Desconocido';

        transaction.set(movementRef, {
            type,
            reason,
            date: serverTimestamp(),
            userId: currentUser.uid,
            productName, // Denormalized for easy display
            depositName, // Denormalized
            quantity,
            productId,
            depositId,
        });

        // 4. Update the inventory stock document
        const stockAmount = type === 'entrada' ? quantity : -quantity;
        if (stockDoc && stockDoc.exists()) {
          // If stock record exists, update it
          transaction.update(stockDoc.ref, {
            quantity: increment(stockAmount),
            lastUpdated: serverTimestamp(),
          });
        } else {
          // If not, create it (only for 'entrada')
          if (type === 'salida') throw new Error('No se puede dar salida a un producto sin stock inicial.');
          const newStockRef = doc(collection(firestore, 'inventory'));
          transaction.set(newStockRef, {
            productId,
            depositId,
            quantity,
            lastUpdated: serverTimestamp(),
          });
        }
      });

      toast({
        title: 'Movimiento Registrado',
        description: `El movimiento de ${data.type} ha sido registrado con éxito.`,
      });
      form.reset();
    } catch (error: any) {
      console.error('Error processing movement:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Ocurrió un error al procesar el movimiento.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isLoadingProducts || isLoadingDeposits || isLoadingUser;
  
  if (!isLoadingUser && !canManageMovements) {
    return (
        <div className="container mx-auto p-4 sm:p-6 md:p-8">
             <Card>
                <CardHeader>
                    <CardTitle className="text-destructive">Acceso Denegado</CardTitle>
                    <CardDescription>
                        No tienes los permisos necesarios para gestionar movimientos de stock.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Movimientos de Stock</h1>
        <p className="text-muted-foreground">
          Registra entradas y salidas de productos del inventario.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Registrar Movimiento</CardTitle>
              <CardDescription>
                Completa el formulario para registrar un movimiento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Movimiento</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="entrada">Entrada</SelectItem>
                            <SelectItem value="salida">Salida</SelectItem>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingProducts}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un producto" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {products?.map((prod) => (
                              <SelectItem key={prod.id} value={prod.id}>{prod.name} ({prod.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="depositId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Depósito</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingDeposits}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un depósito" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {deposits?.map((dep) => (
                              <SelectItem key={dep.id} value={dep.id}>{dep.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cantidad</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Motivo</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: Compra a proveedor" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isSubmitting || isLoading}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Registrar Movimiento
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-3">
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
                      <TableHead>Producto</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Depósito</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingMovements ? (
                        [...Array(5)].map((_, i) => (
                            <TableRow key={i}><TableCell colSpan={6} className="p-2"><div className="h-5 bg-muted rounded-md animate-pulse" /></TableCell></TableRow>
                        ))
                    ) : movements?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center h-24">
                          No hay movimientos registrados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      movements?.map((mov) => (
                        <TableRow key={mov.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {mov.date ? format(new Date(mov.date.seconds * 1000), "Ppp", { locale: es }) : '-'}
                          </TableCell>
                          <TableCell>
                            <span className={`font-semibold ${mov.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                              {mov.type.charAt(0).toUpperCase() + mov.type.slice(1)}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">{mov.productName}</TableCell>
                          <TableCell>{mov.quantity}</TableCell>
                          <TableCell className="text-muted-foreground">{mov.depositName}</TableCell>
                          <TableCell className="text-muted-foreground">{mov.reason}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

    