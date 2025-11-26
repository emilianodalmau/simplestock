
'use client';

import { useState, useEffect } from 'react';
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
import Image from 'next/image';

const formSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  appName: z.string().optional(),
  logoUrl: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type UserProfile = {
  role?: 'administrador';
  workspaceId?: string | null;
};

export default function CrearWorkspacePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      appName: '',
      logoUrl: '',
    },
  });

  useEffect(() => {
    if (!isLoadingProfile) {
      if (!user || currentUserProfile?.role !== 'administrador' || currentUserProfile?.workspaceId) {
        router.replace('/dashboard');
      }
    }
  }, [isLoadingProfile, user, currentUserProfile, router]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit
        toast({
          variant: 'destructive',
          title: 'Archivo demasiado grande',
          description: 'Por favor, selecciona una imagen de menos de 1MB.',
        });
        event.target.value = ''; // Clear the input
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setLogoPreview(result);
        form.setValue('logoUrl', result); // Update form value
      };
      reader.readAsDataURL(file);
    }
  };

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

      const workspaceRef = doc(collection(firestore, 'workspaces'));
      const newWorkspace = {
        id: workspaceRef.id,
        name: data.name,
        ownerId: user.uid,
        appName: data.appName || data.name, // Use workspace name as fallback
        logoUrl: data.logoUrl || '',
        createdAt: serverTimestamp(),
      };
      batch.set(workspaceRef, newWorkspace);

      const userRef = doc(firestore, 'users', user.uid);
      batch.update(userRef, { workspaceId: workspaceRef.id });

      await batch.commit();

      toast({
        title: 'Workspace Creado',
        description: `El workspace "${data.name}" ha sido creado.`,
      });

      window.location.href = '/dashboard';
      
    } catch (error) {
      console.error('Error creating workspace:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al crear el workspace. Revisa los permisos de la base de datos.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingProfile || !currentUserProfile || (currentUserProfile.role === 'administrador' && currentUserProfile.workspaceId)) {
    return (
        <div className="container flex min-h-screen items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin" />
        </div>
    );
  }

  return (
    <div className="container flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Configura tu Espacio de Trabajo</CardTitle>
              <CardDescription>
                Dale un nombre a tu workspace y personaliza cómo se verá la aplicación para tu equipo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Workspace</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Mi Empresa"
                        {...field}
                      />
                    </FormControl>
                     <FormMessage />
                  </FormItem>
                )}
              />
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 <FormField
                    control={form.control}
                    name="appName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de la App (Opcional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: Inventario Acme"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-sm text-muted-foreground">El nombre que se mostrará en la barra lateral.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <FormLabel>Logotipo (Opcional)</FormLabel>
                    <Input
                      id="logoUrl"
                      name="logoUrl"
                      type="file"
                      accept="image/png, image/jpeg, image/gif, image/svg+xml"
                      onChange={handleFileChange}
                    />
                    <p className="text-sm text-muted-foreground">
                      Sube una imagen (máx 1MB).
                    </p>
                  </div>
               </div>
               {logoPreview && (
                  <div className="mt-4 flex flex-col items-start gap-4">
                    <span className='text-sm font-medium'>Vista Previa del Logo:</span>
                    <Image
                      src={logoPreview}
                      alt="Vista previa del logo"
                      width={80}
                      height={80}
                      className="rounded-md border p-2"
                    />
                  </div>
                )}
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
    </div>
  );
}
