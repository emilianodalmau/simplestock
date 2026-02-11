
'use client';

import { useState, useEffect, useMemo } from 'react';
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
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, Trash2, History } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Client, UserProfile, Quote } from '@/types/inventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n/i18n-provider';

const formSchema = z.object({
  name: z.string().min(1, { message: 'El nombre es requerido.' }),
  taxId: z.string().optional(),
  email: z.string().email({ message: "El email no es válido." }).optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
};

const quoteStatusConfig = {
    borrador: { label: 'Borrador', color: 'bg-gray-500' },
    enviado: { label: 'Enviado', color: 'bg-blue-500' },
    aprobado: { label: 'Aprobado', color: 'bg-green-500' },
    rechazado: { label: 'Rechazado', color: 'bg-red-500' },
};


function ClientHistoryDialog({ client, workspaceId, isOpen, onClose }: { client: Client; workspaceId: string, isOpen: boolean; onClose: () => void; }) {
    const firestore = useFirestore();
    const collectionPrefix = `workspaces/${workspaceId}`;

    const quotesQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, `${collectionPrefix}/quotes`),
            where('clientId', '==', client.id),
            orderBy('createdAt', 'desc')
        );
    }, [firestore, collectionPrefix, client.id]);
    const { data: quotes, isLoading: isLoadingQuotes } = useCollection<Quote>(quotesQuery);
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Historial de {client.name}</DialogTitle>
                    <DialogDescription>
                        Presupuestos y remitos de salida asociados a este cliente.
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[70vh] overflow-y-auto pr-4">
                    <Tabs defaultValue="quotes">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="quotes">Presupuestos ({quotes?.length ?? 0})</TabsTrigger>
                            <TabsTrigger value="movements">Remitos de Salida</TabsTrigger>
                        </TabsList>
                        <TabsContent value="quotes" className="mt-4">
                            <Card>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Nº</TableHead>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead>Estado</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoadingQuotes && [...Array(3)].map((_, i) => (
                                                <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                                            ))}
                                            {!isLoadingQuotes && quotes?.length === 0 && (
                                                <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay presupuestos para este cliente.</TableCell></TableRow>
                                            )}
                                            {!isLoadingQuotes && quotes?.map(q => {
                                                const config = quoteStatusConfig[q.status] || { label: 'Desconocido', color: 'bg-gray-400' };
                                                return (
                                                    <TableRow key={q.id}>
                                                        <TableCell className="font-mono">{q.quoteNumber}</TableCell>
                                                        <TableCell>{format(q.createdAt.toDate(), 'dd/MM/yyyy')}</TableCell>
                                                        <TableCell><Badge className={cn("text-white", config.color)}>{config.label}</Badge></TableCell>
                                                        <TableCell className="text-right font-medium">{formatPrice(q.totalValue)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="movements" className="mt-4">
                           <Card>
                                <CardContent className="p-6 text-center text-muted-foreground">
                                    <p>Funcionalidad en desarrollo.</p>
                                    <p className="text-sm">Actualmente, los remitos de salida no están vinculados directamente a los clientes.</p>
                                </CardContent>
                           </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function ClientsPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { dictionary } = useI18n();

  const userDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile } = useDoc<UserProfile>(userDocRef);

  const collectionPath = useMemo(() => {
    if (!currentUserProfile?.workspaceId) return null;
    return `workspaces/${currentUserProfile.workspaceId}/clients`;
  }, [currentUserProfile?.workspaceId]);

  const clientsCollection = useMemoFirebase(
    () => (firestore && collectionPath ? collection(firestore, collectionPath) : null),
    [firestore, collectionPath]
  );
  const { data: clients, isLoading } =
    useCollection<Client>(clientsCollection);

  const createForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      taxId: '',
      email: '',
      phone: '',
      address: '',
    },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    if (editingClient) {
      editForm.reset({
        name: editingClient.name,
        taxId: editingClient.taxId || '',
        email: editingClient.email || '',
        phone: editingClient.phone || '',
        address: editingClient.address || '',
      });
    }
  }, [editingClient, editForm]);

  const onCreateSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore || !clientsCollection) return;
    setIsSubmitting(true);
    
    const newClientData = {
        ...data,
        createdAt: serverTimestamp(),
    };

    addDoc(clientsCollection, newClientData)
      .then(() => {
        toast({
          title: 'Cliente Creado',
          description: `El cliente "${data.name}" ha sido agregado.`,
        });
        createForm.reset();
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
            path: clientsCollection.path,
            operation: 'create',
            requestResourceData: newClientData,
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const onEditSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore || !editingClient || !clientsCollection) return;
    setIsEditSubmitting(true);
    
    const clientRef = doc(clientsCollection, editingClient.id);
    const updatedData = {
        ...data,
        updatedAt: serverTimestamp(),
    };

    updateDoc(clientRef, updatedData)
      .then(() => {
        toast({
          title: 'Cliente Actualizado',
          description: `El cliente "${data.name}" ha sido actualizado.`,
        });
        setEditingClient(null);
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
            path: clientRef.path,
            operation: 'update',
            requestResourceData: updatedData,
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsEditSubmitting(false);
      });
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!firestore || !clientsCollection) return;
    const clientRef = doc(clientsCollection, clientId);

    deleteDoc(clientRef)
      .then(() => {
        toast({
          title: 'Cliente Eliminado',
          description: 'El cliente ha sido eliminado correctamente.',
        });
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
            path: clientRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const canManageClients =
    currentUserProfile?.role === 'administrador' ||
    currentUserProfile?.role === 'editor' ||
    currentUserProfile?.role === 'vendedor';

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.clientes.title}</h1>
        <p className="text-muted-foreground">
          {dictionary.pages.clientes.description}
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {canManageClients && (
          <Card>
            <CardHeader>
              <CardTitle>Agregar Nuevo Cliente</CardTitle>
              <CardDescription>
                Completa los datos para registrar un nuevo cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...createForm}>
                <form
                  onSubmit={createForm.handleSubmit(onCreateSubmit)}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <FormField
                      control={createForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre / Razón Social</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: Acme S.R.L." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="taxId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CUIT / DNI (Opcional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Identificación fiscal"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={createForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email (Opcional)</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="contacto@acme.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Teléfono (Opcional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Número de teléfono"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={createForm.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Dirección (Opcional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Av. Siempre Viva 123, Springfield"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Agregar Cliente
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Lista de Clientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>CUIT/DNI</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Teléfono</TableHead>
                      {canManageClients && (
                        <TableHead className="text-right">Acciones</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading &&
                      [...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Skeleton className="h-4 w-40" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                           <TableCell>
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                           <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                          {canManageClients && (
                            <TableCell>
                              <Skeleton className="h-8 w-20 ml-auto" />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    {!isLoading && clients?.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={canManageClients ? 5 : 4}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No has registrado ningún cliente.
                          {canManageClients && " Utiliza el formulario de arriba para empezar."}
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading &&
                      clients?.map((client) => (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium">
                            {client.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {client.taxId || '-'}
                          </TableCell>
                           <TableCell className="text-muted-foreground">
                            {client.email || '-'}
                          </TableCell>
                           <TableCell className="text-muted-foreground">
                            {client.phone || '-'}
                          </TableCell>
                          {canManageClients && (
                            <TableCell className="text-right">
                               <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewingClient(client)}
                                title="Ver Historial"
                              >
                                <History className="h-4 w-4" />
                                <span className="sr-only">Historial</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingClient(client)}
                                title="Editar Cliente"
                              >
                                <Edit className="h-4 w-4" />
                                <span className="sr-only">Editar</span>
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" title="Eliminar Cliente">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    <span className="sr-only">Eliminar</span>
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      ¿Estás seguro?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no se puede deshacer. Esto
                                      eliminará permanentemente el cliente.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeleteClient(client.id)
                                      }
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Eliminar
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
      </div>

      <Dialog
        open={!!editingClient}
        onOpenChange={(isOpen) => !isOpen && setEditingClient(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Modifica los detalles del cliente.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="space-y-6"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre / Razón Social</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT / DNI</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={editForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
                <FormField
                control={editForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={isEditSubmitting}>
                  {isEditSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
    {viewingClient && currentUserProfile?.workspaceId && (
        <ClientHistoryDialog
            client={viewingClient}
            workspaceId={currentUserProfile.workspaceId}
            isOpen={!!viewingClient}
            onClose={() => setViewingClient(null)}
        />
    )}
    </div>
  );
}
