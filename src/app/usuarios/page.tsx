
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
import { collection, doc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Edit, Loader2 } from 'lucide-react';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const formSchema = z.object({
  firstName: z
    .string()
    .min(1, { message: 'El nombre es requerido.' }),
  lastName: z
    .string()
    .min(1, { message: 'El apellido es requerido.' }),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  photoURL?: string;
  phone?: string;
  address?: string;
  workspaceId?: string | null;
  role?: 'super-admin' | 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito';
};

const roleColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  'super-admin': 'destructive',
  administrador: 'destructive',
  editor: 'default',
  visualizador: 'secondary',
  jefe_deposito: 'secondary',
};

export default function UsuariosPage() {
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(currentUserDocRef);
  
  const usersCollectionQuery = useMemoFirebase(() => {
      if (!firestore || !currentUserProfile) return null;
      // Super-admin sees all users
      if (currentUserProfile.role === 'super-admin') {
          return collection(firestore, 'users');
      }
      // Admins see users in their own workspace
      if (currentUserProfile.workspaceId) {
          return query(collection(firestore, 'users'), where('workspaceId', '==', currentUserProfile.workspaceId));
      }
      return null;
  }, [firestore, currentUserProfile]);

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersCollectionQuery);

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
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
  
  const onEditSubmit: SubmitHandler<FormValues> = async (data) => {
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

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName) return 'U';
    const firstInitial = firstName[0] || '';
    const lastInitial = lastName ? lastName[0] : '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  const currentUserIsAdmin = currentUserProfile?.role === 'administrador' || currentUserProfile?.role === 'super-admin';
  const currentUserIsSuperAdmin = currentUserProfile?.role === 'super-admin';
  const isLoading = isLoadingProfile || isLoadingUsers;

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground">
          {currentUserIsSuperAdmin ? 'Administra todos los usuarios del sistema.' : 'Administra los usuarios de tu workspace.'}
        </p>
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
              {currentUserIsAdmin && <TableHead className="text-right">Acciones</TableHead>}
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
                  {currentUserIsAdmin && <TableCell className="text-right">
                    <Skeleton className="h-10 w-48 ml-auto" />
                  </TableCell>}
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
                  {currentUserIsAdmin && <TableCell className="text-right">
                     <>
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
                          onValueChange={(value) => handleRoleChange(user.id, value)}
                          disabled={user.id === currentUser?.uid || (user.role === 'super-admin' && !currentUserIsSuperAdmin)}
                        >
                          <SelectTrigger className="w-36 ml-auto inline-flex">
                            <SelectValue placeholder="Seleccionar rol" />
                          </SelectTrigger>
                          <SelectContent>
                            {currentUserIsSuperAdmin && <SelectItem value="super-admin">Super Admin</SelectItem>}
                            <SelectItem value="administrador">
                              Administrador
                            </SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="visualizador">Visualizador</SelectItem>
                            <SelectItem value="jefe_deposito">
                              Jefe de Depósito
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </>
                  </TableCell>}
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
    </div>
  );
}
