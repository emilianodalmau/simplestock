
'use client';

import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const formSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
});

type FormValues = z.infer<typeof formSchema>;

type UserProfile = {
  role?: 'administrador' | 'super-admin';
  workspaceId?: string | null;
};

// Componente para crear el workspace
function CreateWorkspaceForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '' },
  });

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se ha podido verificar tu identidad. Intenta de nuevo.',
      });
      return;
    }
    setIsSubmitting(true);

    try {
      const batch = writeBatch(firestore);

      // 1. Create the workspace document
      const workspaceRef = doc(collection(firestore, 'workspaces'));
      const newWorkspace = {
        id: workspaceRef.id,
        name: data.name,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      };
      batch.set(workspaceRef, newWorkspace);

      // 2. Update the user to link them to the new workspace
      const userRef = doc(firestore, 'users', user.uid);
      batch.update(userRef, { workspaceId: workspaceRef.id });

      await batch.commit();

      toast({
        title: 'Workspace Creado',
        description: `El workspace "${data.name}" ha sido creado.`,
      });

      // Reload the page to reflect the new state.
      router.refresh();
      
    } catch (error: any) {
      console.error('Error creando el workspace:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Permisos',
        description: 'No se pudo crear el workspace. Verifica las reglas de Firestore.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-lg">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>Crea tu Espacio de Trabajo</CardTitle>
            <CardDescription>
              Para comenzar, dale un nombre a tu workspace. Esto te permitirá
              gestionar tus datos de forma aislada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Workspace</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Mi Empresa" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear y Continuar
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}


// Contenido principal del Dashboard
function MainDashboard() {
    return (
        <>
         <h1 className="text-3xl font-bold tracking-tight font-headline">Panel de Control</h1>
         <p className="text-muted-foreground">Bienvenido a tu panel de control.</p>
        </>
    );
}

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const isLoading = isUserLoading || isLoadingProfile;
  
  if (isLoading) {
    return (
       <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin" />
        </div>
    )
  }

  // Si el usuario es administrador pero no tiene workspace, muestra el formulario de creación.
  if (currentUserProfile?.role === 'administrador' && !currentUserProfile.workspaceId) {
    return (
        <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center">
            <CreateWorkspaceForm />
        </div>
    );
  }

  // Para todos los demás casos (super-admin, o admin con workspace), muestra el dashboard normal.
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <MainDashboard />
    </div>
  );
}
