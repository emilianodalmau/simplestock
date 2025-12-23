
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
  Timestamp,
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
import { Badge } from '@/components/ui/badge';
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
import { Loader2, Edit, Trash2, PlusCircle, CreditCard } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const workspaceFormSchema = z.object({
  name: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  ownerId: z.string().min(1, { message: 'Debe seleccionar un propietario.' }),
});

const subscriptionFormSchema = z.object({
    planId: z.enum(['inicial', 'crecimiento', 'empresarial', 'fullfree']),
    currentPeriodEnd: z.date(),
});


type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;
type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;

type Subscription = {
    planId: string;
    status: string;
    currentPeriodEnd: any;
};

type Workspace = {
  id: string;
  name: string;
  ownerId: string;
  subscription: Subscription;
};

type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role?: 'super-admin' | 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito';
  workspaceId?: string | null;
};

const planLimits = {
  inicial: { maxProducts: 100, maxUsers: 5, maxDeposits: 2, maxMovementsPerMonth: 100 },
  crecimiento: { maxProducts: 2000, maxUsers: 5, maxDeposits: 5, maxMovementsPerMonth: 999999 },
  empresarial: { maxProducts: 999999, maxUsers: 50, maxDeposits: 999999, maxMovementsPerMonth: 999999 },
  fullfree: { maxProducts: 999999, maxUsers: 999999, maxDeposits: 999999, maxMovementsPerMonth: 999999 },
};

const planNames: Record<string, string> = {
  inicial: 'Plan Inicial',
  crecimiento: 'Plan Crecimiento',
  empresarial: 'Plan Empresarial',
  fullfree: 'Plan Interno (Full Free)',
};

const statusTranslations: Record<string, string> = {
  active: 'Activo',
  past_due: 'Pago Vencido',
  canceled: 'Cancelado',
  free: 'Gratuito',
};

const statusColors: Record<string, 'default' | 'destructive' | 'secondary'> = {
  active: 'default',
  past_due: 'destructive',
  canceled: 'destructive',
  free: 'secondary',
};

export default function WorkspacesPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [managingSubscription, setManagingSubscription] = useState<Workspace | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(currentUserDocRef);
  
  const workspacesCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'workspaces') : null),
    [firestore]
  );
  const { data: workspaces, isLoading: isLoadingWorkspaces } =
    useCollection<Workspace>(workspacesCollection);
  
  const allUsersQuery = useMemoFirebase(() => {
    if (firestore && currentUserProfile?.role === 'super-admin') {
      return collection(firestore, 'users');
    }
    return null;
  }, [firestore, currentUserProfile]);
  
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(allUsersQuery);

  const availableAdminsQuery = useMemoFirebase(() => {
    if (firestore && currentUserProfile?.role === 'super-admin') {
        return query(collection(firestore, 'users'), where('role', '==', 'administrador'), where('workspaceId', '==', null));
    }
    return null;
  }, [firestore, currentUserProfile]);

  const { data: availableAdmins, isLoading: isLoadingAdmins } = useCollection<UserProfile>(availableAdminsQuery);

  const workspaceForm = useForm<WorkspaceFormValues>({ resolver: zodResolver(workspaceFormSchema) });
  const subscriptionForm = useForm<SubscriptionFormValues>({ resolver: zodResolver(subscriptionFormSchema) });

  const userMap = useMemo(() => {
    if (!users) return new Map();
    return new Map(users.map((u) => [u.id, u]));
  }, [users]);

  useEffect(() => {
    if (editingWorkspace) {
      workspaceForm.reset({
        name: editingWorkspace.name,
        ownerId: editingWorkspace.ownerId,
      });
    }
  }, [editingWorkspace, workspaceForm]);

  useEffect(() => {
    if (managingSubscription) {
        const sub = managingSubscription.subscription;
        subscriptionForm.reset({
            planId: sub?.planId as any || 'inicial',
            currentPeriodEnd: sub?.currentPeriodEnd?.toDate() || new Date(),
        });
    }
  }, [managingSubscription, subscriptionForm]);
  
  const handleCreateSubmit: SubmitHandler<WorkspaceFormValues> = async (data) => {
    if (!firestore) return;
    setIsSubmitting(true);
    
    try {
        const batch = writeBatch(firestore);
        const workspaceRef = doc(collection(firestore, 'workspaces'));
        
        const freePlanSubscription = {
            planId: 'inicial',
            status: 'free',
            currentPeriodEnd: serverTimestamp(),
            limits: planLimits.inicial,
        };

        const newWorkspace = {
            id: workspaceRef.id,
            name: data.name,
            ownerId: data.ownerId,
            createdAt: serverTimestamp(),
            subscription: freePlanSubscription,
        };
        batch.set(workspaceRef, newWorkspace);

        const userRef = doc(firestore, 'users', data.ownerId);
        batch.update(userRef, { workspaceId: workspaceRef.id });
        
        await batch.commit();
        toast({ title: "Workspace creado", description: `El workspace "${data.name}" ha sido creado.` });
        setIsCreateDialogOpen(false);
    } catch (error) {
        console.error("Error creating workspace:", error);
        toast({ variant: 'destructive', title: 'Error', description: "Ocurrió un error al crear el workspace." });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleEditSubmit: SubmitHandler<WorkspaceFormValues> = async (data) => {
      if (!firestore || !editingWorkspace) return;
      setIsSubmitting(true);
      try {
          const workspaceRef = doc(firestore, 'workspaces', editingWorkspace.id);
          await updateDoc(workspaceRef, { name: data.name });
          toast({ title: "Workspace actualizado", description: `El workspace "${data.name}" ha sido actualizado.` });
          setEditingWorkspace(null);
      } catch (error) {
          console.error("Error updating workspace:", error);
          toast({ variant: 'destructive', title: 'Error', description: "Ocurrió un error al actualizar el workspace." });
      } finally {
          setIsSubmitting(false);
      }
  };
  
  const handleSubscriptionUpdate: SubmitHandler<SubscriptionFormValues> = async (data) => {
      if (!firestore || !managingSubscription) return;
      setIsSubmitting(true);

      const { planId, currentPeriodEnd } = data;
      const newLimits = planLimits[planId as keyof typeof planLimits];
      
      const newSubscriptionData = {
          planId: planId,
          status: planId === 'inicial' ? 'free' : 'active',
          currentPeriodEnd: Timestamp.fromDate(currentPeriodEnd),
          limits: newLimits,
      };

      try {
          const workspaceRef = doc(firestore, 'workspaces', managingSubscription.id);
          await updateDoc(workspaceRef, { subscription: newSubscriptionData });
          toast({ title: "Suscripción actualizada", description: `El plan del workspace se ha cambiado a ${planNames[planId]}.` });
          setManagingSubscription(null);
      } catch (error) {
          console.error("Error updating subscription:", error);
          toast({ variant: 'destructive', title: 'Error', description: "No se pudo actualizar la suscripción." });
      } finally {
          setIsSubmitting(false);
      }
  }

  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'workspaces', workspaceId));
      toast({ title: 'Workspace Eliminado', description: 'El workspace ha sido eliminado.' });
    } catch (error) {
      console.error('Error deleting workspace:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el workspace.' });
    }
  };
  
  const isLoading = isLoadingWorkspaces || isLoadingUsers || isLoadingProfile || isLoadingAdmins;

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">Workspaces</h1>
          <p className="text-muted-foreground">Administra los espacios de trabajo de cada administrador.</p>
        </div>
         <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild><Button><PlusCircle className="mr-2 h-4 w-4" />Crear Workspace</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Crear Nuevo Workspace</DialogTitle><DialogDescription>Asigna un nombre y un propietario.</DialogDescription></DialogHeader>
            <Form {...workspaceForm}>
              <form onSubmit={workspaceForm.handleSubmit(handleCreateSubmit)} className="space-y-6">
                 <FormField control={workspaceForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre del Workspace</FormLabel><FormControl><Input placeholder="Ej: Workspace de Acme Corp" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <FormField control={workspaceForm.control} name="ownerId" render={({ field }) => (<FormItem><FormLabel>Propietario (Administrador)</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecciona un administrador sin workspace..." /></SelectTrigger></FormControl><SelectContent>{availableAdmins && availableAdmins.length === 0 && <SelectItem value="none" disabled>No hay administradores disponibles</SelectItem>}{availableAdmins?.map((admin) => (<SelectItem key={admin.id} value={admin.id}>{admin.email}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
                <DialogFooter><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear Workspace</Button></DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Lista de Workspaces</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre del Workspace</TableHead>
                  <TableHead>Propietario</TableHead>
                  <TableHead>Suscripción</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && [...Array(3)].map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-4 w-40" /></TableCell><TableCell><Skeleton className="h-4 w-52" /></TableCell><TableCell><Skeleton className="h-6 w-32" /></TableCell><TableCell className="text-right"><Skeleton className="h-8 w-40 ml-auto" /></TableCell></TableRow>))}
                {!isLoading && workspaces?.length === 0 && (<TableRow><TableCell colSpan={4} className="text-center">No hay workspaces creados.</TableCell></TableRow>)}
                {!isLoading && workspaces?.map((ws) => { const owner = userMap.get(ws.ownerId); return (
                      <TableRow key={ws.id}>
                        <TableCell className="font-medium">{ws.name}</TableCell>
                        <TableCell className="text-muted-foreground">{owner?.email || 'Usuario no encontrado'}</TableCell>
                        <TableCell>
                          <div className='flex flex-col gap-1'>
                            <span>{planNames[ws.subscription?.planId] || ws.subscription?.planId || 'N/A'}</span>
                            <Badge variant={statusColors[ws.subscription?.status] || 'secondary'}>{statusTranslations[ws.subscription?.status] || ws.subscription?.status || 'N/A'}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditingWorkspace(ws)}><Edit className="h-4 w-4" /><span className="sr-only">Editar Nombre</span></Button>
                          <Button variant="ghost" size="icon" onClick={() => setManagingSubscription(ws)}><CreditCard className="h-4 w-4" /><span className="sr-only">Gestionar Suscripción</span></Button>
                          <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /><span className="sr-only">Eliminar</span></Button></AlertDialogTrigger>
                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Estás seguro?</AlertDialogTitle><AlertDialogDescription>Esta acción es irreversible y eliminará el workspace.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteWorkspace(ws.id)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction></AlertDialogFooter>
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
      
      <Dialog open={!!editingWorkspace} onOpenChange={() => setEditingWorkspace(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Workspace</DialogTitle><DialogDescription>Modifica el nombre del workspace.</DialogDescription></DialogHeader>
          <Form {...workspaceForm}>
            <form onSubmit={workspaceForm.handleSubmit(handleEditSubmit)} className="space-y-6">
               <FormField control={workspaceForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre del Workspace</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={workspaceForm.control} name="ownerId" render={({ field }) => (<FormItem><FormLabel>Propietario</FormLabel><FormControl><Input value={userMap.get(field.value)?.email || field.value} disabled /></FormControl></FormItem>)}/>
              <DialogFooter><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managingSubscription} onOpenChange={() => setManagingSubscription(null)}>
          <DialogContent>
              <DialogHeader><DialogTitle>Gestionar Suscripción</DialogTitle><DialogDescription>Modificar el plan para el workspace: {managingSubscription?.name}</DialogDescription></DialogHeader>
              <Form {...subscriptionForm}>
                  <form onSubmit={subscriptionForm.handleSubmit(handleSubscriptionUpdate)} className="space-y-6">
                      <FormField control={subscriptionForm.control} name="planId" render={({ field }) => (<FormItem><FormLabel>Plan</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccionar plan..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="inicial">Plan Inicial</SelectItem><SelectItem value="crecimiento">Plan Crecimiento</SelectItem><SelectItem value="empresarial">Plan Empresarial</SelectItem><SelectItem value="fullfree">Plan Interno (Full Free)</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                      <FormField
                        control={subscriptionForm.control}
                        name="currentPeriodEnd"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Fin del Periodo Actual</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant={'outline'}
                                  className={cn(
                                    'pl-3 text-left font-normal',
                                    !field.value && 'text-muted-foreground'
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, 'PPP', { locale: es })
                                  ) : (
                                    <span>Elige una fecha</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <FormControl>
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    initialFocus
                                  />
                                </FormControl>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button></DialogFooter>
                  </form>
              </Form>
          </DialogContent>
      </Dialog>
    </div>
  );
}
