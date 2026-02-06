
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
  deleteField,
  query,
  where,
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, Trash2, Info } from 'lucide-react';
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

type Workspace = {
    subscription?: {
        limits?: {
            maxDeposits?: number;
        }
    }
}

type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  workspaceId?: string;
  role?: 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'vendedor';
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
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);
  
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && currentUserProfile?.workspaceId ? doc(firestore, 'workspaces', currentUserProfile.workspaceId) : null),
    [firestore, currentUserProfile]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

  const canAssignJefe =
    currentUserProfile?.role === 'administrador';

  const usersCollectionQuery = useMemoFirebase(() => {
    // IMPORTANTE: Esta query coincide con la regla: resource.data.workspaceId == getMyUserData().workspaceId
    if (firestore && currentUserProfile?.workspaceId && currentUserProfile.role === 'administrador') {
        return query(collection(firestore, 'users'), where('workspaceId', '==', currentUserProfile.workspaceId));
    }
    return null;
  }, [firestore, currentUserProfile]);

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersCollectionQuery);

  const collectionPath = useMemo(() => {
    if (!currentUserProfile?.workspaceId) return null;
    return `workspaces/${currentUserProfile.workspaceId}/deposits`;
  }, [currentUserProfile?.workspaceId]);

  const depositsCollection = useMemoFirebase(
    () => (firestore && collectionPath ? collection(firestore, collectionPath) : null),
    [firestore, collectionPath]
  );
  const { data: deposits, isLoading: isLoadingDeposits } =
    useCollection<Deposit>(depositsCollection);
    
  const jefesDeDeposito = useMemo(
    () => users?.filter((user) => user.role === 'jefe_deposito'),
    [users]
  );
  
  const depositsLimit = workspaceData?.subscription?.limits?.maxDeposits ?? 0;
  const depositCount = deposits?.length ?? 0;
  const atLimit = depositCount >= depositsLimit;

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
    if (!firestore || !depositsCollection) return;
    setIsSubmitting(true);
    
    const newDepositData = {
        ...data,
        createdAt: serverTimestamp(),
    };

    addDoc(depositsCollection, newDepositData)
      .then(() => {
        toast({
          title: 'Depósito Creado',
          description: `El depósito "${data.name}" ha sido agregado.`,
        });
        createForm.reset();
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
            path: depositsCollection.path,
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
    if (!firestore || !editingDeposit || !depositsCollection) return;
    setIsEditSubmitting(true);
    
    const depositRef = doc(depositsCollection, editingDeposit.id);
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
            path: depositRef.path,
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
    if (!firestore || !depositsCollection) return;
    const depositRef = doc(depositsCollection, depositId);

    deleteDoc(depositRef)
      .then(() => {
        toast({
          title: 'Depósito Eliminado',
          description: 'El depósito ha sido eliminado correctamente.',
        });
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
            path: depositRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };
  
  const handleJefeChange = async (depositId: string, jefeId: string) => {
    if (!firestore || !depositsCollection) return;
    const depositRef = doc(depositsCollection, depositId);
    
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
                path: depositRef.path,
                operation: 'update',
                requestResourceData: updateData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
  };

  const canManageDeposits =
    currentUserProfile?.role === 'administrador' ||
    currentUserProfile?.role === 'editor';
    
  const isLoading = isLoadingProfile || isLoadingWorkspace || isLoadingDeposits || (canAssignJefe && isLoadingUsers);
  
  if (isLoading && !deposits) {
    return (
        <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center min-h-[calc(100vh-10rem)]">
            <Loader2 className="h-12 w-12 animate-spin" />
        </div>
    )
  }
  
  const hasAccess = currentUserProfile?.role && ['administrador', 'editor', 'visualizador', 'vendedor'].includes(currentUserProfile.role);

  if (!isLoadingProfile && !hasAccess) {
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
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Depósitos</h1>
        <p className="text-muted-foreground">
          Crea y administra los lugares físicos (almacenes, bodegas, locales) donde se guardan tus productos.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {canManageDeposits && (
          <Card>
            <CardHeader>
              <CardTitle>Agregar Nuevo Depósito</CardTitle>
              <CardDescription>
                Cada depósito funciona como un inventario separado. Podrás ver el stock de tus productos en cada uno de ellos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {atLimit && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Has alcanzado el límite de {depositsLimit} depósitos para tu plan actual. Para agregar más, considera actualizar tu plan.
                  </AlertDescription>
                </Alert>
              )}
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
                          <Input placeholder="Ej: Depósito Central" {...field} disabled={atLimit} />
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
                        <FormLabel>Descripción (Opcional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Ej: Ubicado en el subsuelo, sector A."
                            {...field}
                            disabled={atLimit}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isSubmitting || atLimit}>
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
                        {canAssignJefe && <TableHead>Jefe Asignado</TableHead>}
                      {canManageDeposits && (
                        <TableHead className="text-right">Acciones</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingDeposits &&
                      [...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                          {canAssignJefe && (
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
                    {!isLoadingDeposits && deposits?.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={canAssignJefe ? 4 : (canManageDeposits ? 3 : 2)}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No has creado ningún depósito todavía.
                          {canManageDeposits && " Empieza agregando uno con el formulario de arriba."}
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoadingDeposits &&
                      deposits?.map((deposit) => (
                        <TableRow key={deposit.id}>
                          <TableCell className="font-medium">
                            {deposit.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {deposit.description || '-'}
                          </TableCell>
                          {canAssignJefe && (
                            <TableCell>
                              <Select
                                value={deposit.jefeId || 'unassigned'}
                                onValueChange={(value) => handleJefeChange(deposit.id, value)}
                                disabled={isLoadingUsers}
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue placeholder={isLoadingUsers ? "Cargando..." : "Asignar jefe..."} />
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
