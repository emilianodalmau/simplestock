
'use client';

import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser } from '@/firebase';
import {
  doc,
  writeBatch,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

const formSchema = z.object({
  workspaceName: z
    .string()
    .min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateWorkspaceForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      workspaceName: '',
    },
  });

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Usuario no autenticado. Por favor, inicia sesión de nuevo.',
      });
      return;
    }
    setIsSubmitting(true);

    try {
      const batch = writeBatch(firestore);

      // 1. Define la referencia al nuevo workspace
      const workspaceRef = doc(collection(firestore, 'workspaces'));
      
      const freePlanSubscription = {
        planId: 'inicial',
        status: 'free',
        currentPeriodEnd: serverTimestamp(),
        limits: {
          maxProducts: 100,
          maxUsers: 5,
          maxDeposits: 2,
          maxMovementsPerMonth: 100,
        },
      };

      // 2. Prepara los datos del nuevo workspace
      const newWorkspace = {
        id: workspaceRef.id,
        name: data.workspaceName,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        subscription: freePlanSubscription,
      };

      // 3. Añade la creación del workspace al batch
      batch.set(workspaceRef, newWorkspace);

      // 4. Define la referencia al documento del usuario y prepara la actualización
      const userDocRef = doc(firestore, 'users', user.uid);
      batch.update(userDocRef, { workspaceId: workspaceRef.id });

      // 5. Ejecuta el batch
      await batch.commit();

      toast({
        title: '¡Workspace Creado!',
        description: `Tu espacio de trabajo "${data.workspaceName}" ha sido creado.`,
      });
      
      // Forzar una recarga de la página para que el layout se actualice con los nuevos datos
      window.location.reload();

    } catch (error) {
      console.error('Error creando el workspace:', error);
      toast({
        variant: 'destructive',
        title: 'Error al crear el Workspace',
        description: 'No se pudo crear el espacio de trabajo. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Crea tu Espacio de Trabajo</CardTitle>
            <CardDescription>
              Para empezar, dale un nombre a tu workspace. Podrás cambiarlo más tarde.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="workspaceName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Workspace</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Mi Negocio" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear Workspace
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
