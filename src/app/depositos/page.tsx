
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
  useDoc,
} from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  deleteField,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const formSchema = z.object({
  name: z.string().min(1, { message: 'El nombre es requerido.' }),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type Deposit = {
  id: string;
  name: string;
  description?: string;
  jefeId?: string;
};

type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  role?: 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito';
};

export default function DepositosPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();

  const userDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile } = useDoc<UserProfile>(userDocRef);
  
  const usersCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersCollection);

  const depositsCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'deposits') : null),
    [firestore]
  );
  const { data: deposits, isLoading: isLoadingDeposits } =
    useCollection<Deposit>(depositsCollection);
    
  const jefesDeDeposito = useMemoFirebase(
    () => users?.filter((user) => user.role === 'jefe_deposito'),
    [users]
  );
  
  const userMap = useMemoFirebase(() => {
    if (!users) return new Map<string, string>();
    return new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));
  }, [users]);


  const createForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    if (editingDeposit) {
      editForm.reset({
        name: editingDeposit.name,
        description: editingDeposit.description || '',
      });
    }
  }, [editingDeposit, editForm]);

  const onCreateSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore) return;
    setIsSubmitting(true);
    
    const newDepositData = {
        ...data,
        createdAt: serverTimestamp(),
    };

    addDoc(collection(firestore, 'deposits'), newDepositData)
      .then(() => {
        toast({
          title: 'Depósito Creado',
          description: `El depósito "${data.name}" ha sido agregado.`,
        });
        createForm.reset();
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
            path: 'deposits',
            operation: 'create',
            requestResourceData: newDepositData,
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const onEditSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore || !editingDeposit) return;
    setIsEditSubmitting(true);
    
    const depositRef = doc(firestore, 'deposits', editingDeposit.id);
    const updatedData = {
        ...data,
        updatedAt: serverTimestamp(),
    };

    updateDoc(depositRef, updatedData)
      .then(() => {
        toast({
          title: 'Depósito Actualizado',
          description: `El depósito "${data.name}" ha sido actualizado.`,
        });
        setEditingDeposit(null);
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
            path: `deposits/${editingDeposit.id}`,
            operation: 'update',
            requestResourceData: updatedData,
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsEditSubmitting(false);
      });
  };

  const handleDeleteDeposit = async (depositId: string) => {
    if (!firestore) return;
    const depositRef = doc(firestore, 'deposits', depositId);

    deleteDoc(depositRef)
      .then(() => {
        toast({
          title: 'Depósito Eliminado',
          description: 'El depósito ha sido eliminado correctamente.',
        });
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
            path: `deposits/${depositId}`,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };
  
  const handleJefeChange = async (depositId: string, jefeId: string) => {
    if (!firestore) return;
    const depositRef = doc(firestore, 'deposits', depositId);
    
    const updateData =
      jefeId === 'unassigned' ? { jefeId: deleteField() } : { jefeId };
      
    updateDoc(depositRef, updateData)
        .then(() => {
            toast({
                title: 'Jefe de Depósito Actualizado',
                description: 'Se ha actualizado el jefe para este depósito.',
            });
        })
        .catch((error) => {
            const permissionError = new FirestorePermissionError({
                path: `deposits/${depositId}`,
                operation: 'update',
                requestResourceData: updateData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
  };


  const canManageDeposits =
    currentUserProfile?.role === 'administrador' ||
    currentUserProfile?.role === 'editor';
    
  const isAdmin = currentUserProfile?.role === 'administrador';
  
  const isLoading = isLoadingDeposits || isLoadingUsers;

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Depósitos</h1>
        <p className="text-muted-foreground">
          Administra los depósitos o almacenes donde se guarda el inventario.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {canManageDeposits && (
          <Card>
            <CardHeader>
              <CardTitle>Agregar Nuevo Depósito</CardTitle>
              <CardDescription>
                Completa el formulario para añadir un depósito.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...createForm}>
                <form
                  onSubmit={createForm.handleSubmit(onCreateSubmit)}
                  className="space-y-6"
                >
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: Depósito Central" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripción</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Una breve descripción del depósito (opcional)"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Agregar Depósito
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Lista de Depósitos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Descripción</TableHead>
                       {isAdmin && <TableHead>Jefe Asignado</TableHead>}
                      {canManageDeposits && (
                        <TableHead className="text-right">Acciones</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading &&
                      [...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Skeleton className="h-10 w-40" />
                            </TableCell>
                          )}
                          {canManageDeposits && (
                            <TableCell>
                              <Skeleton className="h-8 w-20 ml-auto" />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    {!isLoading && deposits?.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={isAdmin ? 4 : (canManageDeposits ? 3 : 2)}
                          className="text-center"
                        >
                          No hay depósitos creados.
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading &&
                      deposits?.map((deposit) => (
                        <TableRow key={deposit.id}>
                          <TableCell className="font-medium">
                            {deposit.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {deposit.description || '-'}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Select
                                value={deposit.jefeId || 'unassigned'}
                                onValueChange={(value) => handleJefeChange(deposit.id, value)}
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue placeholder="Asignar jefe..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Sin asignar</SelectItem>
                                  {jefesDeDeposito?.map(jefe => (
                                    <SelectItem key={jefe.id} value={jefe.id}>
                                      {jefe.firstName} {jefe.lastName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          {canManageDeposits && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingDeposit(deposit)}
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
                                      eliminará permanentemente el depósito.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeleteDeposit(deposit.id)
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

      {/* Edit Deposit Dialog */}
      <Dialog
        open={!!editingDeposit}
        onOpenChange={(isOpen) => !isOpen && setEditingDeposit(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Depósito</DialogTitle>
            <DialogDescription>
              Modifica los detalles del depósito.
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
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
