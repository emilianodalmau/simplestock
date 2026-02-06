
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
  orderBy,
  updateDoc,
  where,
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, PlusCircle, CalendarIcon, Edit } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Product, Client, Quote, QuoteItem, UserProfile, Workspace } from '@/types/inventory';
import { ProductComboBox } from '@/components/ui/product-combobox';
import { QuoteActions } from '@/components/quote-actions';
import type { AppSettings } from '@/types/settings';


// --- Zod Schemas ---
const quoteItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto.'),
  quantity: z.coerce.number().min(0.1, 'La cantidad debe ser mayor a 0.'),
  price: z.coerce.number(), // Will be set programmatically
});

const quoteFormSchema = z.object({
  clientId: z.string().min(1, 'Selecciona un cliente.'),
  validUntil: z.date({ required_error: 'La fecha de validez es requerida.' }),
  items: z.array(quoteItemSchema).min(1, 'Debes agregar al menos un producto.'),
});

type QuoteFormValues = z.infer<typeof quoteFormSchema>;

// --- Helper Functions and Constants ---
const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
};

const quoteStatusConfig = {
    borrador: { label: 'Borrador', color: 'bg-gray-500' },
    enviado: { label: 'Enviado', color: 'bg-blue-500' },
    aprobado: { label: 'Aprobado', color: 'bg-green-500' },
    rechazado: { label: 'Rechazado', color: 'bg-red-500' },
};


// --- Form Component ---
function QuoteForm({ 
    currentUserProfile,
    editingQuote,
    onFinish
}: { 
    currentUserProfile: UserProfile,
    editingQuote: Quote | null,
    onFinish: () => void;
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const firestore = useFirestore();
    const { user } = useUser();
    const workspaceId = currentUserProfile?.workspaceId;
    const collectionPrefix = useMemo(() => workspaceId ? `workspaces/${workspaceId}` : null, [workspaceId]);

    const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(
        useMemoFirebase(() => collectionPrefix ? collection(firestore, `${collectionPrefix}/clients`) : null, [collectionPrefix, firestore])
    );
    const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(
        useMemoFirebase(() => collectionPrefix ? query(collection(firestore, `${collectionPrefix}/products`), where('isArchived', '!=', true)) : null, [collectionPrefix, firestore])
    );
    const productsMap = useMemo(() => new Map(products?.map(p => [p.id, p])), [products]);

    const isEditMode = !!editingQuote;

    const form = useForm<QuoteFormValues>({
        resolver: zodResolver(quoteFormSchema),
        defaultValues: isEditMode ? {
            clientId: editingQuote.clientId,
            validUntil: editingQuote.validUntil.toDate(),
            items: editingQuote.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price
            }))
        } : {
            clientId: '',
            validUntil: addDays(new Date(), 15),
            items: [],
        },
    });


    const { fields, append, remove, update } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const watchedItems = form.watch('items');
    const totalValue = useMemo(() => {
        return watchedItems.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 0)), 0);
    }, [watchedItems]);

    const handleProductChange = (index: number, productId: string) => {
        const product = productsMap.get(productId);
        const price = product?.price || 0;
        update(index, { ...form.getValues(`items.${index}`), productId, price });
    };
    
    const handleAddProduct = () => {
        append({ productId: '', quantity: 1, price: 0 });
    };

    const onSubmit: SubmitHandler<QuoteFormValues> = async (data) => {
        if (!firestore || !collectionPrefix || !clients || !user) return;
        setIsSubmitting(true);

        if (isEditMode) {
            // --- UPDATE LOGIC ---
            const quoteRef = doc(firestore, `${collectionPrefix}/quotes/${editingQuote.id}`);
            try {
                const client = clients.find(c => c.id === data.clientId);
                if (!client) throw new Error("Cliente no encontrado.");

                const finalItems: QuoteItem[] = data.items.map(item => {
                    const product = productsMap.get(item.productId);
                    if (!product) throw new Error("Producto no encontrado en el presupuesto.");
                    return {
                        productId: item.productId,
                        productName: product.name,
                        quantity: item.quantity,
                        unit: product.unit,
                        price: item.price,
                        total: item.price * item.quantity,
                    }
                });
                
                const quoteTotalValue = finalItems.reduce((acc, item) => acc + item.total, 0);

                await updateDoc(quoteRef, {
                    clientId: data.clientId,
                    clientName: client.name,
                    validUntil: data.validUntil,
                    items: finalItems,
                    totalValue: quoteTotalValue,
                    updatedAt: serverTimestamp(),
                });

                toast({ title: 'Presupuesto Actualizado', description: 'Los cambios en el presupuesto se han guardado.' });
                onFinish();

            } catch (error: any) {
                const permissionError = new FirestorePermissionError({
                    path: quoteRef.path,
                    operation: 'update',
                    requestResourceData: data,
                });
                errorEmitter.emit('permission-error', permissionError);
            } finally {
                setIsSubmitting(false);
            }

        } else {
            // --- CREATE LOGIC ---
            let quoteDocRef: any;
            try {
                await runTransaction(firestore, async (transaction) => {
                    const counterRef = doc(firestore, `${collectionPrefix}/counters/quoteCounter`);
                    const counterSnap = await transaction.get(counterRef);
                    const lastNumber = counterSnap.exists() ? counterSnap.data().lastNumber : 0;
                    const newQuoteNumber = lastNumber + 1;
                    const formattedQuoteNumber = `P-${String(newQuoteNumber).padStart(5, '0')}`;
                    
                    const client = clients.find(c => c.id === data.clientId);
                    if (!client) throw new Error("Cliente no encontrado.");

                    const finalItems: QuoteItem[] = data.items.map(item => {
                        const product = productsMap.get(item.productId);
                        if (!product) throw new Error("Producto no encontrado en el presupuesto.");
                        return {
                            productId: item.productId,
                            productName: product.name,
                            quantity: item.quantity,
                            unit: product.unit,
                            price: item.price,
                            total: item.price * item.quantity,
                        }
                    });
                    
                    const quoteTotalValue = finalItems.reduce((acc, item) => acc + item.total, 0);

                    quoteDocRef = doc(collection(firestore, `${collectionPrefix}/quotes`));
                    transaction.set(quoteDocRef, {
                        id: quoteDocRef.id,
                        quoteNumber: formattedQuoteNumber,
                        clientId: data.clientId,
                        clientName: client.name,
                        status: 'borrador',
                        createdAt: serverTimestamp(),
                        validUntil: data.validUntil,
                        items: finalItems,
                        totalValue: quoteTotalValue,
                        userId: user.uid,
                    });

                    transaction.set(counterRef, { lastNumber: newQuoteNumber }, { merge: true });
                });

                toast({ title: 'Presupuesto Creado', description: 'El presupuesto se guardó como borrador.' });
                onFinish();
            } catch (error: any) {
                 const permissionError = new FirestorePermissionError({
                    path: quoteDocRef ? quoteDocRef.path : `${collectionPrefix}/quotes`,
                    operation: 'create',
                    requestResourceData: data,
                });
                errorEmitter.emit('permission-error', permissionError);
            } finally {
                setIsSubmitting(false);
            }
        }
    };
    
    return (
        <Card className="max-w-5xl mx-auto">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardHeader>
                        <CardTitle>{isEditMode ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</CardTitle>
                        <CardDescription>{isEditMode ? `Modificando presupuesto Nº ${editingQuote.quoteNumber}` : 'Selecciona un cliente y añade los productos para generar una cotización.'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="clientId" render={({ field }) => (
                                <FormItem><FormLabel>Cliente</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingClients}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger></FormControl>
                                    <SelectContent>{clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                                </Select><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="validUntil" render={({ field }) => (
                                <FormItem className="flex flex-col"><FormLabel>Válido Hasta</FormLabel>
                                <Popover><PopoverTrigger asChild>
                                    <FormControl><Button variant="outline" className={cn(!field.value && "text-muted-foreground")}>
                                        {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Elige una fecha</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button></FormControl>
                                </PopoverTrigger><PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                </PopoverContent></Popover><FormMessage /></FormItem>
                            )}/>
                        </div>
                        <Separator />
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium">Ítems del Presupuesto</h3>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddProduct}><PlusCircle className="mr-2 h-4 w-4" />Agregar Ítem</Button>
                            </div>
                            <div className="space-y-4">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-[1fr_100px_100px_120px_auto] gap-2 items-start p-3 border rounded-md">
                                        <FormField control={form.control} name={`items.${index}.productId`} render={({ field: productField }) => (
                                            <FormItem><FormLabel className="sr-only">Producto</FormLabel>
                                            <ProductComboBox products={products || []} value={productField.value} onChange={(value) => handleProductChange(index, value)} disabled={isLoadingProducts} noStockMessage="Selecciona un producto" />
                                            <FormMessage /></FormItem>
                                        )}/>
                                        <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                                            <FormItem><FormLabel className="sr-only">Cantidad</FormLabel><FormControl><Input type="number" placeholder="Cant." {...field} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                        <div className="pt-2">
                                            <p className="font-mono text-sm">{formatPrice(form.watch(`items.${index}.price`))}</p>
                                            <p className="text-xs text-muted-foreground">Precio Unit.</p>
                                        </div>
                                         <div className="pt-2">
                                            <p className="font-mono text-sm font-bold">{formatPrice(form.watch(`items.${index}.price`) * form.watch(`items.${index}.quantity`))}</p>
                                            <p className="text-xs text-muted-foreground">Subtotal</p>
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </div>
                                ))}
                                {form.formState.errors.items && <p className="text-sm font-medium text-destructive">{form.formState.errors.items.root?.message}</p>}
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between items-center bg-muted/50 p-6 rounded-b-lg">
                        <span className="text-2xl font-bold">Total: {formatPrice(totalValue)}</span>
                        <div className="flex gap-2">
                            {isEditMode && <Button type="button" variant="outline" onClick={onFinish}>Cancelar</Button>}
                            <Button type="submit" disabled={isSubmitting || isLoadingClients || isLoadingProducts}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isEditMode ? 'Guardar Cambios' : 'Guardar Presupuesto'}
                            </Button>
                        </div>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    )
}

// --- History Component ---
function QuoteHistory({ currentUserProfile, onEdit }: { currentUserProfile: UserProfile, onEdit: (quote: Quote) => void }) {
    const firestore = useFirestore();
    const workspaceId = currentUserProfile.workspaceId;
    const collectionPrefix = useMemo(() => workspaceId ? `workspaces/${workspaceId}` : null, [workspaceId]);
    
    const [pdfSettings, setPdfSettings] = useState<AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string } | null>(null);

    const { data: quotes, isLoading, forceRefetch } = useCollection<Quote>(
        useMemoFirebase(() => collectionPrefix ? query(collection(firestore, `${collectionPrefix}/quotes`), orderBy('createdAt', 'desc')) : null, [collectionPrefix, firestore])
    );
    
    const workspaceDocRef = useMemoFirebase(
      () => (firestore && workspaceId ? doc(firestore, 'workspaces', workspaceId) : null),
      [firestore, workspaceId]
    );
    const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

    useEffect(() => {
        if (!isLoadingWorkspace && workspaceData) {
            setPdfSettings({
                appName: workspaceData?.appName || 'Presupuesto',
                logoUrl: workspaceData?.logoUrl || '',
                workspaceAppName: workspaceData?.name, // Use workspace name for PDF title
                workspaceLogoUrl: workspaceData?.logoUrl,
            });
        }
    }, [workspaceData, isLoadingWorkspace]);


    const { toast } = useToast();

    const handleChangeStatus = async (quoteId: string, newStatus: Quote['status']) => {
        if (!collectionPrefix) return;
        const quoteRef = doc(firestore, `${collectionPrefix}/quotes/${quoteId}`);
        try {
            await updateDoc(quoteRef, { status: newStatus });
            toast({ title: "Estado Actualizado", description: `El presupuesto ahora está marcado como ${quoteStatusConfig[newStatus].label}.` });
        } catch (error) {
            console.error("Error updating status:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
        }
    };
    
    const finalIsLoading = isLoading || isLoadingWorkspace;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Listado de Presupuestos</CardTitle>
                <CardDescription>Historial de todas las cotizaciones generadas.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nº</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Validez</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {finalIsLoading && [...Array(5)].map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)}
                            {!finalIsLoading && quotes?.length === 0 && <TableRow><TableCell colSpan={7} className="text-center h-24">No se han creado presupuestos.</TableCell></TableRow>}
                            {!finalIsLoading && quotes?.map(q => {
                                const config = quoteStatusConfig[q.status] || { label: 'Desconocido', color: 'bg-gray-400' };
                                return (
                                    <TableRow key={q.id}>
                                        <TableCell className="font-mono">{q.quoteNumber}</TableCell>
                                        <TableCell>{q.clientName}</TableCell>
                                        <TableCell>{format(q.createdAt.toDate(), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>{format(q.validUntil.toDate(), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell><Badge className={cn("text-white", config.color)}>{config.label}</Badge></TableCell>
                                        <TableCell className="text-right font-medium">{formatPrice(q.totalValue)}</TableCell>
                                        <TableCell className="text-right">
                                            <QuoteActions
                                                quote={q}
                                                settings={pdfSettings}
                                                onStatusChange={handleChangeStatus}
                                                onEdit={() => onEdit(q)}
                                            />
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

// --- Main Page Component ---
export default function PresupuestosPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [activeTab, setActiveTab] = useState("list");
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);

  const handleStartEdit = (quote: Quote) => {
    setEditingQuote(quote);
    setActiveTab("create");
  };

  const handleFinishEditing = () => {
    setEditingQuote(null);
    setActiveTab("list");
    // forceRefetch on history component might be needed if useCollection doesn't update immediately
  };

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);
      
  const canAccessPage = useMemo(() => {
    if (!currentUserProfile?.role) return false;
    return ['administrador', 'editor', 'visualizador', 'vendedor'].includes(currentUserProfile.role);
  }, [currentUserProfile?.role]);

  const isLoading = isUserLoading || isLoadingProfile;

  if (isLoading) {
    return <div className="container mx-auto p-8 flex justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }
  
  if (!canAccessPage) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader><CardTitle>Acceso Denegado</CardTitle><CardDescription>No tienes permisos para ver esta página.</CardDescription></CardHeader>
        </Card>
      </div>
    );
  }
  
  const canCreate = currentUserProfile?.role === 'administrador' || currentUserProfile?.role === 'editor' || currentUserProfile?.role === 'vendedor';

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Presupuestos</h1>
        <p className="text-muted-foreground">Crea y gestiona cotizaciones de productos para tus clientes.</p>
      </div>
      <Tabs value={activeTab} onValueChange={(value) => {
          if (value === 'list') {
              setEditingQuote(null);
          }
          setActiveTab(value);
      }}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="list">Listado</TabsTrigger>
            {canCreate && <TabsTrigger value="create" >{editingQuote ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</TabsTrigger>}
        </TabsList>
        <TabsContent value="list" className="pt-6">
            <QuoteHistory currentUserProfile={currentUserProfile!} onEdit={handleStartEdit} />
        </TabsContent>
        {canCreate && 
            <TabsContent value="create" className="pt-6">
                <QuoteForm 
                  key={editingQuote?.id || 'new'}
                  currentUserProfile={currentUserProfile!} 
                  editingQuote={editingQuote} 
                  onFinish={handleFinishEditing} 
                />
            </TabsContent>
        }
      </Tabs>
    </div>
  );
}
