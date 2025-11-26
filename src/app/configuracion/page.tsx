
'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getSettings, updateSettings, type AppSettings } from '@/lib/settings';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
} from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

type UserProfile = {
  role?: 'super-admin' | 'administrador';
  workspaceId?: string;
};

type Workspace = {
    appName?: string;
    logoUrl?: string;
}

export default function ConfiguracionPage() {
  // Global settings state (for super-admin)
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [globalAppName, setGlobalAppName] = useState('');
  const [globalLogoPreview, setGlobalLogoPreview] = useState<string | null>(null);

  // Workspace settings state (for admin)
  const [workspaceAppName, setWorkspaceAppName] = useState('');
  const [workspaceLogoPreview, setWorkspaceLogoPreview] = useState<string | null>('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const firestore = useFirestore();

  // Get current user's profile
  const userDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  // Get workspace data if user is an admin
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && currentUserProfile?.workspaceId ? doc(firestore, 'workspaces', currentUserProfile.workspaceId) : null),
    [firestore, currentUserProfile]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

  const isSuperAdmin = currentUserProfile?.role === 'super-admin';
  const isWorkspaceAdmin = currentUserProfile?.role === 'administrador';

  // Effect to load initial settings based on role
  useEffect(() => {
    async function fetchInitialSettings() {
      setIsLoading(true);
      if (isSuperAdmin) {
        const settings = await getSettings();
        setGlobalSettings(settings);
        setGlobalAppName(settings.appName);
        setGlobalLogoPreview(settings.logoUrl);
      }
      setIsLoading(false);
    }
    fetchInitialSettings();
  }, [isSuperAdmin]);

  // Effect to populate form when workspace data loads
  useEffect(() => {
    if (isWorkspaceAdmin && workspaceData) {
      setWorkspaceAppName(workspaceData.appName || '');
      setWorkspaceLogoPreview(workspaceData.logoUrl || '');
    }
  }, [isWorkspaceAdmin, workspaceData]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, isGlobal: boolean) => {
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
        if (isGlobal) {
            setGlobalLogoPreview(reader.result as string);
        } else {
            setWorkspaceLogoPreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleRemoveLogo = (isGlobal: boolean) => {
      if (isGlobal) {
          setGlobalLogoPreview(null);
      } else {
          setWorkspaceLogoPreview(null);
      }
  }


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (isSuperAdmin) {
        // --- Super Admin: Update global settings file ---
        const formData = new FormData();
        formData.append('appName', globalAppName);
        formData.append('logoUrl', globalLogoPreview || '');
        await updateSettings(formData);
      } else if (isWorkspaceAdmin && workspaceDocRef) {
        // --- Workspace Admin: Update workspace document ---
        await updateDoc(workspaceDocRef, {
            appName: workspaceAppName,
            logoUrl: workspaceLogoPreview || '',
            updatedAt: serverTimestamp(),
        });
      }
      
      toast({
        title: 'Configuración guardada',
        description: 'Los cambios se han guardado correctamente y se reflejarán en toda la aplicación.',
      });
      // Force a reload to see changes everywhere, especially the layout.
      window.location.reload();

    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: 'No se pudieron guardar los cambios.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalIsLoading = isLoading || isLoadingProfile || (isWorkspaceAdmin && isLoadingWorkspace);

  if (finalIsLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  
  const title = isSuperAdmin ? "Configuración Global" : "Configuración del Workspace";
  const description = isSuperAdmin 
    ? "Ajustes generales que se aplican a toda la aplicación como fallback." 
    : "Personaliza el nombre y el logo que se muestran en tu espacio de trabajo.";
    
  const appNameValue = isSuperAdmin ? globalAppName : workspaceAppName;
  const setAppName = isSuperAdmin ? setGlobalAppName : setWorkspaceAppName;
  const logoPreview = isSuperAdmin ? globalLogoPreview : workspaceLogoPreview;

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Personalización</CardTitle>
            <CardDescription>
              Cambia el nombre y el logotipo que se muestran en la barra
              lateral.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="appName">Nombre de la Aplicación</Label>
              <Input
                id="appName"
                name="appName"
                placeholder="Ej: Mi Inventario"
                value={appNameValue}
                onChange={(e) => setAppName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logotipo</Label>
              <Input
                id="logoUrl"
                name="logoUrl"
                type="file"
                accept="image/png, image/jpeg, image/gif, image/svg+xml"
                onChange={(e) => handleFileChange(e, isSuperAdmin)}
              />
              <p className="text-sm text-muted-foreground">
                Sube una imagen (PNG, JPG, GIF, SVG). Límite de 1MB.
              </p>
              {logoPreview && (
                <div className="mt-4 flex flex-col items-start gap-4">
                  <span className='text-sm font-medium'>Vista Previa:</span>
                  <Image
                    src={logoPreview}
                    alt="Vista previa del logo"
                    width={80}
                    height={80}
                    className="rounded-md border p-2"
                  />
                  <Button variant="outline" size="sm" onClick={() => handleRemoveLogo(isSuperAdmin)}>Quitar logo</Button>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
