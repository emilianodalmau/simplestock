
'use client';

import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
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
import { Loader2, Edit, Trash2 } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(1, { message: 'El nombre es requerido.' }),
  contact: z.string().optional(),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type Supplier = {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
};

type UserProfile = {
  id: string;
  role?: 'administrador' | 'editor' | 'visualizador';
};

export default function ProveedoresPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();

  const usersCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  const { data: users } = useCollection<UserProfile>(usersCollection);

  const suppliersCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'suppliers') : null),
    [firestore]
  );
  const { data: suppliers, isLoading } =
    useCollection<Supplier>(suppliersCollection);

  const createForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      contact: '',
      phone: '',
    },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    if (editingSupplier) {
      editForm.reset({
        name: editingSupplier.name,
        contact: editingSupplier.contact || '',
        phone: editingSupplier.phone || '',
      });
    }
  }, [editingSupplier, editForm]);

  const onCreateSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(firestore, 'suppliers'), {
        ...data,
        createdAt: serverTimestamp(),
      });
      toast({
        title: 'Proveedor Creado',
        description: `El proveedor "${data.name}" ha sido agregado.`,
      });
      createForm.reset();
    } catch (error) {
      console.error('Error creating supplier:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          'Ocurrió un error al crear el proveedor. Revisa los permisos.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEditSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore || !editingSupplier) return;
    setIsEditSubmitting(true);
    try {
      const supplierRef = doc(firestore, 'suppliers', editingSupplier.id);
      await updateDoc(supplierRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      toast({
        title: 'Proveedor Actualizado',
        description: `El proveedor "${data.name}" ha sido actualizado.`,
      });
      setEditingSupplier(null);
    } catch (error) {
      console.error('Error updating supplier:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al actualizar el proveedor.',
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'suppliers', supplierId));
      toast({
        title: 'Proveedor Eliminado',
        description: 'El proveedor ha sido eliminado correctamente.',
      });
    } catch (error) {
      console.error('Error deleting supplier:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al eliminar el proveedor.',
      });
    }
  };

  const currentUserProfile = users?.find((u) => u.id === currentUser?.uid);
  const canManageSuppliers =
    currentUserProfile?.role === 'administrador' ||
    currentUserProfile?.role === 'editor';

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Proveedores</h1>
        <p className="text-muted-foreground">
          Administra los proveedores de productos y servicios.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {canManageSuppliers && (
          <Card>
            <CardHeader>
              <CardTitle>Agregar Nuevo Proveedor</CardTitle>
              <CardDescription>
                Completa el formulario para añadir un proveedor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...createForm}>
                <form
                  onSubmit={createForm.handleSubmit(onCreateSubmit)}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                    <FormField
                      control={createForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: Ferretería Central S.A." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="contact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contacto</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Nombre de la persona de contacto"
                              {...field}
                            />
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
                          <FormLabel>Teléfono</FormLabel>
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
                  </div>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Agregar Proveedor
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Lista de Proveedores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Teléfono</TableHead>
                      {canManageSuppliers && (
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
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                           <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                          {canManageSuppliers && (
                            <TableCell>
                              <Skeleton className="h-8 w-20 ml-auto" />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    {!isLoading && suppliers?.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={canManageSuppliers ? 4 : 3}
                          className="text-center"
                        >
                          No hay proveedores creados.
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading &&
                      suppliers?.map((supplier) => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">
                            {supplier.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {supplier.contact || '-'}
                          </TableCell>
                           <TableCell className="text-muted-foreground">
                            {supplier.phone || '-'}
                          </TableCell>
                          {canManageSuppliers && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingSupplier(supplier)}
                              >
                                <Edit className="h-4 w-4" />
                                <span className="sr-only">Editar</span>
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon">
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
                                      eliminará permanentemente el proveedor.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeleteSupplier(supplier.id)
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

      {/* Edit Supplier Dialog */}
      <Dialog
        open={!!editingSupplier}
        onOpenChange={(isOpen) => !isOpen && setEditingSupplier(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Proveedor</DialogTitle>
            <DialogDescription>
              Modifica los detalles del proveedor.
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
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contacto</FormLabel>
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
    </div>
  );
}
