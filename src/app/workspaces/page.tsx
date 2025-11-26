
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
  writeBatch,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
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
import { Loader2, Edit, Trash2, PlusCircle } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  ownerId: z.string().min(1, { message: 'Debe seleccionar un propietario.' }),
});

type FormValues = z.infer<typeof formSchema>;

type Workspace = {
  id: string;
  name: string;
  ownerId: string;
};

type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role?: 'super-admin' | 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito';
  workspaceId?: string | null;
};

export default function WorkspacesPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const firestore = useFirestore();

  // --- Data Loading ---
  const workspacesCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'workspaces') : null),
    [firestore]
  );
  const { data: workspaces, isLoading: isLoadingWorkspaces } =
    useCollection<Workspace>(workspacesCollection);

  const usersCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  const { data: users, isLoading: isLoadingUsers } =
    useCollection<UserProfile>(usersCollection);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  // --- Memos for derived data ---
  const userMap = useMemo(() => {
    if (!users) return new Map();
    return new Map(users.map((u) => [u.id, u]));
  }, [users]);
  
  const availableAdmins = useMemo(() => {
    if (!users) return [];
    // Admins that don't have a workspaceId yet
    return users.filter(u => u.role === 'administrador' && !u.workspaceId);
  }, [users]);

  // --- Effects ---
  useEffect(() => {
    if (editingWorkspace) {
      form.reset({
        name: editingWorkspace.name,
        ownerId: editingWorkspace.ownerId,
      });
    }
  }, [editingWorkspace, form]);
  
  useEffect(() => {
    // Reset form when create dialog is opened
    if (isCreateDialogOpen) {
      form.reset({ name: '', ownerId: '' });
    }
  }, [isCreateDialogOpen, form]);


  // --- CRUD Handlers ---
  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore) return;
    setIsSubmitting(true);
    
    const action = editingWorkspace ? 'actualizado' : 'creado';

    try {
        if (editingWorkspace) {
            // --- Update Logic ---
            const workspaceRef = doc(firestore, 'workspaces', editingWorkspace.id);
            await updateDoc(workspaceRef, { name: data.name });
            // Owner change is complex, not handled in this simple edit form
        } else {
            // --- Create Logic ---
            const batch = writeBatch(firestore);
            
            // 1. Create the workspace document
            const workspaceRef = doc(collection(firestore, 'workspaces'));
            const newWorkspace = {
                id: workspaceRef.id,
                name: data.name,
                ownerId: data.ownerId,
                createdAt: serverTimestamp(),
            };
            batch.set(workspaceRef, newWorkspace);

            // 2. Update the assigned admin user to link them to the new workspace
            const userRef = doc(firestore, 'users', data.ownerId);
            batch.update(userRef, { workspaceId: workspaceRef.id });
            
            await batch.commit();
        }

        toast({
            title: `Workspace ${action}`,
            description: `El workspace "${data.name}" ha sido ${action}.`,
        });

        setIsCreateDialogOpen(false);
        setEditingWorkspace(null);
        setIsEditDialogOpen(false);

    } catch (error) {
        console.error(`Error ${action} workspace:`, error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: `Ocurrió un error al ${action} el workspace.`,
        });
    } finally {
        setIsSubmitting(false);
    }
  };


  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!firestore) return;
    // This is a placeholder for a much more complex operation.
    // Deleting a workspace should involve deleting all its sub-collections,
    // which requires a Cloud Function for proper cleanup.
    // For now, we just delete the workspace doc itself.
    try {
      await deleteDoc(doc(firestore, 'workspaces', workspaceId));
      toast({
        title: 'Workspace Eliminado',
        description: 'El workspace ha sido eliminado. (Nota: Los datos anidados pueden requerir limpieza manual).',
      });
    } catch (error) {
      console.error('Error deleting workspace:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el workspace.',
      });
    }
  };
  
  const openEditDialog = (workspace: Workspace) => {
    setEditingWorkspace(workspace);
    setIsEditDialogOpen(true);
  };
  
  const closeDialogs = () => {
    setEditingWorkspace(null);
    setIsEditDialogOpen(false);
    setIsCreateDialogOpen(false);
  }

  const isLoading = isLoadingWorkspaces || isLoadingUsers;

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspaces</h1>
          <p className="text-muted-foreground">
            Administra los espacios de trabajo de cada administrador.
          </p>
        </div>
         <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Crear Workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Workspace</DialogTitle>
              <DialogDescription>
                Asigna un nombre y un propietario. El propietario debe ser un usuario con rol 'administrador' que no tenga ya un workspace.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                 <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del Workspace</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: Workspace de Acme Corp" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ownerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Propietario (Administrador)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                           <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un administrador sin workspace..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                             {availableAdmins.length === 0 && <SelectItem value="none" disabled>No hay administradores disponibles</SelectItem>}
                             {availableAdmins.map((admin) => (
                                <SelectItem key={admin.id} value={admin.id}>
                                  {admin.email}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear Workspace
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre del Workspace</TableHead>
                  <TableHead>Propietario</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-52" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                {!isLoading && workspaces?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">
                      No hay workspaces creados.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  workspaces?.map((ws) => {
                    const owner = userMap.get(ws.ownerId);
                    return (
                      <TableRow key={ws.id}>
                        <TableCell className="font-medium">{ws.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {owner?.email || 'Usuario no encontrado'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(ws)}>
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
                                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción no se puede deshacer. Esto eliminará permanentemente el workspace. La limpieza de datos anidados requiere una Cloud Function.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteWorkspace(ws.id)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Workspace</DialogTitle>
              <DialogDescription>
                Modifica el nombre del workspace. Cambiar el propietario es una operación avanzada no disponible aquí.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                 <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del Workspace</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ownerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Propietario</FormLabel>
                        <FormControl>
                          <Input value={userMap.get(field.value)?.email || field.value} disabled />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" onClick={closeDialogs}>Cancelar</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
