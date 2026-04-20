
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
import type { Deposit, Location, UserProfile } from '@/types/inventory';
import { useI18n } from '@/i18n/i18n-provider';

const formSchema = z.object({
  code: z.string().min(1, { message: 'El código es requerido.' }),
  name: z.string().min(1, { message: 'El nombre es requerido.' }),
});

type FormValues = z.infer<typeof formSchema>;

export default function UbicacionesPage() {
  const [selectedDepositId, setSelectedDepositId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { dictionary } = useI18n();

  const userDocRef = useMemoFirebase(
    () => (currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const isJefeDeposito = currentUserProfile?.role === 'jefe_deposito';
  const workspaceId = currentUserProfile?.workspaceId;
  const collectionPrefix = useMemo(() => (workspaceId ? `workspaces/${workspaceId}` : null), [workspaceId]);

  const depositsQuery = useMemoFirebase(() => {
    if (!collectionPrefix) return null;
    const depositsRef = collection(firestore, `${collectionPrefix}/deposits`);
    if (isJefeDeposito && currentUser?.uid) {
      return query(depositsRef, where('jefeId', '==', currentUser.uid));
    }
    return depositsRef;
  }, [firestore, collectionPrefix, isJefeDeposito, currentUser?.uid]);

  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsQuery);

  const locationsCollection = useMemoFirebase(
    () => (selectedDepositId ? collection(firestore, `${collectionPrefix}/deposits/${selectedDepositId}/locations`) : null),
    [collectionPrefix, selectedDepositId]
  );
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsCollection);

  const canManageCurrentDeposit = useMemo(() => {
    if (!currentUserProfile || !selectedDepositId) return false;
    if (['administrador', 'editor'].includes(currentUserProfile.role!)) return true;
    if (isJefeDeposito) {
      const selectedDeposit = deposits?.find(d => d.id === selectedDepositId);
      return selectedDeposit?.jefeId === currentUser?.uid;
    }
    return false;
  }, [currentUserProfile, selectedDepositId, deposits, isJefeDeposito, currentUser]);

  const createForm = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { code: '', name: '' } });
  const editForm = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (isJefeDeposito && deposits?.length === 1) {
      setSelectedDepositId(deposits[0].id);
    }
  }, [isJefeDeposito, deposits]);

  useEffect(() => {
    if (editingLocation) {
      editForm.reset({ name: editingLocation.name, code: editingLocation.code });
    }
  }, [editingLocation, editForm]);

  const onCreateSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!locationsCollection) return;
    setIsSubmitting(true);
    addDoc(locationsCollection, { ...data, createdAt: serverTimestamp() })
      .then(() => {
        toast({ title: 'Ubicación Creada', description: `La ubicación "${data.name}" ha sido creada.` });
        createForm.reset();
      })
      .catch(() => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: locationsCollection.path, operation: 'create', requestResourceData: data })))
      .finally(() => setIsSubmitting(false));
  };

  const onEditSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!locationsCollection || !editingLocation) return;
    setIsEditSubmitting(true);
    const locationRef = doc(locationsCollection, editingLocation.id);
    updateDoc(locationRef, { ...data, updatedAt: serverTimestamp() })
      .then(() => {
        toast({ title: 'Ubicación Actualizada', description: `La ubicación "${data.name}" ha sido actualizada.` });
        setEditingLocation(null);
      })
      .catch(() => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: locationRef.path, operation: 'update', requestResourceData: data })))
      .finally(() => setIsEditSubmitting(false));
  };

  const handleDeleteLocation = async (locationId: string) => {
    if (!locationsCollection) return;
    const locationRef = doc(locationsCollection, locationId);
    deleteDoc(locationRef)
      .then(() => toast({ title: 'Ubicación Eliminada', description: 'La ubicación ha sido eliminada.' }))
      .catch(() => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: locationRef.path, operation: 'delete' })));
  };
  
  const canAccessPage = currentUserProfile?.role && ['administrador', 'editor', 'jefe_deposito'].includes(currentUserProfile.role);

  if (isLoadingProfile || isLoadingDeposits) {
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

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.ubicaciones.title}</h1>
        <p className="text-muted-foreground">{dictionary.pages.ubicaciones.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seleccionar Depósito</CardTitle>
          <Select onValueChange={setSelectedDepositId} value={selectedDepositId || ''} disabled={isJefeDeposito && deposits?.length === 1}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="Elige un depósito para gestionar sus ubicaciones..." />
            </SelectTrigger>
            <SelectContent>
              {deposits?.sort((a, b) => a.name.localeCompare(b.name)).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
      </Card>
      
      {selectedDepositId && (
        <>
          {canManageCurrentDeposit && (
            <Card>
              <CardHeader><CardTitle>Agregar Nueva Ubicación</CardTitle><CardDescription>Ej. Código: A01-S03, Nombre: Pasillo A, Estante 3.</CardDescription></CardHeader>
              <CardContent>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={createForm.control} name="code" render={({ field }) => (<FormItem><FormLabel>Código</FormLabel><FormControl><Input placeholder="A01-S03-B02" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                      <FormField control={createForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre Descriptivo</FormLabel><FormControl><Input placeholder="Pasillo A, Estante 3, Caja 2" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    </div>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agregar Ubicación</Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Lista de Ubicaciones</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      {canManageCurrentDeposit && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingLocations && [...Array(3)].map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-48" /></TableCell>{canManageCurrentDeposit && <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>}</TableRow>))}
                    {!isLoadingLocations && locations?.length === 0 && <TableRow><TableCell colSpan={canManageCurrentDeposit ? 3 : 2} className="h-24 text-center text-muted-foreground">Este depósito no tiene ubicaciones definidas.</TableCell></TableRow>}
                    {!isLoadingLocations && locations?.map((loc) => (
                      <TableRow key={loc.id}>
                        <TableCell className="font-mono">{loc.code}</TableCell>
                        <TableCell>{loc.name}</TableCell>
                        {canManageCurrentDeposit && (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => setEditingLocation(loc)}><Edit className="h-4 w-4" /><span className="sr-only">Editar</span></Button>
                            <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /><span className="sr-only">Eliminar</span></Button></AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>¿Estás seguro?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer y eliminará la ubicación.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteLocation(loc.id)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
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
        </>
      )}

      <Dialog open={!!editingLocation} onOpenChange={(isOpen) => !isOpen && setEditingLocation(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Ubicación</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6 pt-4">
              <FormField control={editForm.control} name="code" render={({ field }) => (<FormItem><FormLabel>Código</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={editForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={isEditSubmitting}>{isEditSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
