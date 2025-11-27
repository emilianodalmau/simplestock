
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
  updateDoc,
  serverTimestamp,
  query,
  where,
  setDoc,
} from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Edit, Loader2, PlusCircle, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAuthUser } from '@/lib/auth-actions';

const editFormSchema = z.object({
  firstName: z.string().min(1, { message: 'El nombre es requerido.' }),
  lastName: z.string().min(1, { message: 'El apellido es requerido.' }),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

const createFormSchema = z.object({
  email: z.string().email({ message: 'El email no es válido.' }),
  firstName: z.string().min(1, { message: 'El nombre es requerido.' }),
  lastName: z.string().min(1, { message: 'El apellido es requerido.' }),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createFormSchema>;

type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  photoURL?: string;
  phone?: string;
  address?: string;
  workspaceId?: string | null;
  role?: 'super-admin' | 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'solicitante';
};

type NewUserCredentials = {
  email: string;
  password?: string;
};


const roleColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  'super-admin': 'destructive',
  administrador: 'destructive',
  editor: 'default',
  visualizador: 'secondary',
  jefe_deposito: 'secondary',
  solicitante: 'secondary',
};

export default function UsuariosPage() {
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newUserCredentials, setNewUserCredentials] = useState<NewUserCredentials | null>(null);
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();

  const currentUserDocRef = useMemoFirebase(
    () =>
      firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null,
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const usersCollectionQuery = useMemoFirebase(() => {
    if (!firestore || !currentUserProfile) return null;

    if (currentUserProfile.role === 'super-admin') {
      return collection(firestore, 'users');
    }

    if (
      currentUserProfile.role === 'administrador' &&
      currentUserProfile.workspaceId
    ) {
      return query(
        collection(firestore, 'users'),
        where('workspaceId', '==', currentUserProfile.workspaceId)
      );
    }

    return null;
  }, [firestore, currentUserProfile]);

  const { data: users, isLoading: isLoadingUsers } =
    useCollection<UserProfile>(usersCollectionQuery);

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
  });
  
  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        address: '',
    },
  });

  useEffect(() => {
    if (editingUser) {
      editForm.reset({
        firstName: editingUser.firstName || '',
        lastName: editingUser.lastName || '',
        phone: editingUser.phone || '',
        address: editingUser.address || '',
      });
    }
  }, [editingUser, editForm]);

  const handleRoleChange = async (userId: string, role: string) => {
    if (!firestore) return;
    const userDocRef = doc(firestore, 'users', userId);
    try {
      await updateDoc(userDocRef, { role });
      toast({
        title: 'Rol actualizado',
        description: `El rol del usuario ha sido cambiado a ${role}.`,
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Permisos',
        description: 'No tienes permisos para cambiar el rol de este usuario.',
      });
    }
  };

  const onEditSubmit: SubmitHandler<EditFormValues> = async (data) => {
    if (!firestore || !editingUser) return;
    setIsEditSubmitting(true);
    try {
      const userRef = doc(firestore, 'users', editingUser.id);
      await updateDoc(userRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      toast({
        title: 'Usuario Actualizado',
        description: `Los datos del usuario han sido actualizados.`,
      });
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al actualizar el usuario.',
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };
  
  const onCreateSubmit: SubmitHandler<CreateFormValues> = async (data) => {
    if (!currentUserProfile?.workspaceId || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se ha podido identificar tu espacio de trabajo.',
      });
      return;
    }
    setIsCreateSubmitting(true);
    try {
      // Step 1: Call server action to create user in Auth
      const result = await createAuthUser({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
      });

      if (result.error || !result.uid) {
        throw new Error(result.error || 'No se pudo obtener el UID del nuevo usuario.');
      }

      // Step 2: Create the user document in Firestore from the client
      const userDocRef = doc(firestore, 'users', result.uid);
      await setDoc(userDocRef, {
        id: result.uid,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || '',
        address: data.address || '',
        role: 'solicitante',
        workspaceId: currentUserProfile.workspaceId,
        createdAt: serverTimestamp(),
      });
      
      setNewUserCredentials({
        email: data.email,
        password: result.password,
      });

      createForm.reset();
      setIsCreateDialogOpen(false);

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Crear Usuario',
        description: error.message || 'No se pudo crear el usuario. Revisa que el email no esté en uso.',
      });
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName) return 'U';
    const firstInitial = firstName[0] || '';
    const lastInitial = lastName ? lastName[0] : '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  const currentUserIsAdmin =
    currentUserProfile?.role === 'administrador' ||
    currentUserProfile?.role === 'super-admin';
  const currentUserIsSuperAdmin = currentUserProfile?.role === 'super-admin';
  const isLoading = isLoadingProfile || isLoadingUsers;

  return (
    <>
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
            <p className="text-muted-foreground">
            {currentUserIsSuperAdmin
                ? 'Administra todos los usuarios del sistema.'
                : 'Administra los usuarios de tu workspace.'}
            </p>
        </div>
        {currentUserProfile?.role === 'administrador' && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                    <Button>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Crear Usuario
                    </Button>
                </DialogTrigger>
                <DialogContent>
                     <DialogHeader>
                        <DialogTitle>Crear Nuevo Usuario Solicitante</DialogTitle>
                        <DialogDescription>
                            Completa los datos para crear un nuevo usuario con rol 'solicitante'. Se generará una contraseña aleatoria.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...createForm}>
                        <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                            <FormField control={createForm.control} name="email" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl><Input placeholder="usuario@ejemplo.com" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                             <div className="grid grid-cols-2 gap-4">
                                <FormField control={createForm.control} name="firstName" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre</FormLabel>
                                        <FormControl><Input placeholder="Juan" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={createForm.control} name="lastName" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Apellido</FormLabel>
                                        <FormControl><Input placeholder="Pérez" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                             </div>
                             <FormField control={createForm.control} name="phone" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Teléfono (Opcional)</FormLabel>
                                    <FormControl><Input placeholder="1122334455" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={createForm.control} name="address" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Dirección (Opcional)</FormLabel>
                                    <FormControl><Input placeholder="Av. Siempre Viva 123" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                                <Button type="submit" disabled={isCreateSubmitting}>
                                    {isCreateSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Crear Usuario
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Rol</TableHead>
              {currentUserIsAdmin && (
                <TableHead className="text-right">Acciones</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </TableCell>
                  {currentUserIsAdmin && (
                    <TableCell className="text-right">
                      <Skeleton className="h-10 w-48 ml-auto" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            {!isLoading &&
              users?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={user.photoURL} />
                        <AvatarFallback>
                          {getInitials(user.firstName, user.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {user.firstName || ''} {user.lastName || 'Sin Nombre'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.phone || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.address || '-'}
                  </TableCell>
                  <TableCell>
                    {user.role ? (
                      <Badge variant={roleColors[user.role] || 'default'}>
                        {user.role}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Sin rol</span>
                    )}
                  </TableCell>
                  {currentUserIsAdmin && (
                    <TableCell className="text-right">
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingUser(user)}
                          disabled={user.role === 'solicitante' && !currentUserIsSuperAdmin}
                        >
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Editar</span>
                        </Button>
                        <Select
                          defaultValue={user.role}
                          onValueChange={(value) =>
                            handleRoleChange(user.id, value)
                          }
                          disabled={
                            user.id === currentUser?.uid ||
                            (user.role === 'super-admin' &&
                              !currentUserIsSuperAdmin) ||
                            (user.role === 'solicitante' && !currentUserIsSuperAdmin)
                          }
                        >
                          <SelectTrigger className="w-40 ml-auto inline-flex">
                            <SelectValue placeholder="Seleccionar rol" />
                          </SelectTrigger>
                          <SelectContent>
                            {currentUserIsSuperAdmin && (
                              <SelectItem value="super-admin">
                                Super Admin
                              </SelectItem>
                            )}
                            <SelectItem value="administrador">
                              Administrador
                            </SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="visualizador">
                              Visualizador
                            </SelectItem>
                            <SelectItem value="jefe_deposito">
                              Jefe de Depósito
                            </SelectItem>
                            <SelectItem value="solicitante" disabled={!currentUserIsSuperAdmin}>
                              Solicitante
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </>
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit User Dialog */}
      <Dialog
        open={!!editingUser}
        onOpenChange={(isOpen) => !isOpen && setEditingUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Modifica los detalles del usuario.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="firstName"
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
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellido</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
      
      {/* New User Credentials Dialog */}
      <Dialog
        open={!!newUserCredentials}
        onOpenChange={() => setNewUserCredentials(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usuario Creado Exitosamente</DialogTitle>
            <DialogDescription>
              Comparte estas credenciales con el nuevo usuario. Esta es la única vez que se mostrará la contraseña.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" readOnly value={newUserCredentials?.email} />
             </div>
              <div className="space-y-1">
                <Label htmlFor="password">Contraseña Generada</Label>
                <div className="flex items-center gap-2">
                    <Input id="password" readOnly value={newUserCredentials?.password} />
                    <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(newUserCredentials?.password || '')}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
             </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
