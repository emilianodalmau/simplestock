
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
  orderBy,
} from 'firebase/firestore';
import { getApp, getApps, initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Edit, Loader2, PlusCircle, Copy, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { deleteUser } from '@/lib/actions';

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
  disabled?: boolean;
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

// Generates a random, secure password.
const generatePassword = (length = 8): string => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};


export default function UsuariosPage() {
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
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

    const usersRef = collection(firestore, 'users');

    if (currentUserProfile.role === 'super-admin') {
      return query(usersRef, orderBy('email'));
    }

    if (
      currentUserProfile.role === 'administrador' &&
      currentUserProfile.workspaceId
    ) {
      return query(
        usersRef,
        where('workspaceId', '==', currentUserProfile.workspaceId)
      );
    }

    return null;
  }, [firestore, currentUserProfile]);

  const { data: users, isLoading: isLoadingUsers } =
    useCollection<UserProfile>(usersCollectionQuery);

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      address: '',
    },
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

  const handleStatusChange = async (userId: string, disabled: boolean) => {
    if (!firestore) return;
    const userDocRef = doc(firestore, 'users', userId);
    try {
      await updateDoc(userDocRef, { disabled });
      toast({
        title: `Usuario ${disabled ? 'desactivado' : 'activado'}`,
        description: `El estado del usuario ha sido actualizado.`,
      });
    } catch (error) {
      console.error('Error updating user status:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Permisos',
        description: 'No tienes permisos para cambiar el estado de este usuario.',
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
      toast({ variant: "destructive", title: "Error", description: "No se pudo identificar tu espacio de trabajo." });
      return;
    }
    setIsCreateSubmitting(true);
    
    // Create a temporary, secondary Firebase App instance for user creation
    const tempAppName = `temp-user-creation-${Date.now()}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getAuth(tempApp);
    
    const password = generatePassword();

    try {
      // Step 1: Create user in Auth with the temporary app instance
      const userCredential = await createUserWithEmailAndPassword(tempAuth, data.email, password);
      const newUid = userCredential.user.uid;

      // Step 2: Create the user document in Firestore using the main app instance (where the admin is logged in)
      const userDocRef = doc(firestore, 'users', newUid);
      await setDoc(userDocRef, {
        id: newUid,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || '',
        address: data.address || '',
        role: 'solicitante',
        workspaceId: currentUserProfile.workspaceId,
        createdAt: serverTimestamp(),
        disabled: false, // Default to active
      });
      
      // Step 3: Show credentials to the admin
      setNewUserCredentials({ email: data.email, password });
      createForm.reset();
      setIsCreateDialogOpen(false);

    } catch (error: any) {
      let errorMessage = 'No se pudo crear el usuario. Revisa que el email no esté en uso.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'El email proporcionado ya está en uso por otro usuario.';
      } else if (error.code === 'auth/weak-password') {
          errorMessage = 'La contraseña generada es demasiado débil. Intenta de nuevo.';
      }
      toast({
        variant: "destructive",
        title: "Error al Crear Usuario",
        description: errorMessage,
      });
    } finally {
      // Step 4: Clean up the temporary app instance
      await deleteApp(tempApp);
      setIsCreateSubmitting(false);
    }
  };

  const handleDeleteUser = async (userIdToDelete: string) => {
    setIsDeleting(userIdToDelete);
    const result = await deleteUser(userIdToDelete);
    if (result.success) {
        toast({
            title: 'Usuario Eliminado',
            description: result.message,
        });
    } else {
        toast({
            variant: 'destructive',
            title: 'Error al eliminar',
            description: result.error,
        });
    }
    setIsDeleting(null);
  }

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
            <h1 className="text-3xl font-bold tracking-tight font-headline">Usuarios</h1>
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
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
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
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </TableCell>
                   <TableCell>
                    <Skeleton className="h-6 w-20 rounded-full" />
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
                <TableRow key={user.id} className={user.disabled ? 'opacity-50' : ''}>
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
                  <TableCell>
                    {user.role ? (
                      <Badge variant={roleColors[user.role] || 'default'}>
                        {user.role}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Sin rol</span>
                    )}
                  </TableCell>
                  <TableCell>
                     <Badge variant={user.disabled ? 'destructive' : 'default'} className={user.disabled ? '' : 'bg-green-500 hover:bg-green-500/80'}>
                        {user.disabled ? 'Inactivo' : 'Activo'}
                      </Badge>
                  </TableCell>
                  {currentUserIsAdmin && (
                    <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingUser(user)}
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
                              !currentUserIsSuperAdmin)
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
                            <SelectItem value="solicitante">
                              Solicitante
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Switch
                            checked={!user.disabled}
                            onCheckedChange={(checked) => handleStatusChange(user.id, !checked)}
                            aria-label="Activar o desactivar usuario"
                            disabled={user.id === currentUser?.uid || (user.role === 'super-admin' && !currentUserIsSuperAdmin)}
                        />
                        {currentUserIsSuperAdmin && user.id !== currentUser?.uid && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" disabled={isDeleting === user.id}>
                                        {isDeleting === user.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta acción es irreversible. Se eliminará permanentemente al usuario de Firebase Authentication y su documento de Firestore.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteUser(user.id)} className="bg-destructive hover:bg-destructive/90">
                                            Sí, eliminar usuario
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
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
              Modifica los detalles del usuario. El rol y estado se gestionan desde la tabla.
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

    

    