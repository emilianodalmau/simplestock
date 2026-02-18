
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
import { updateSettings } from '@/lib/settings';
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
import { useRouter, usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/i18n-provider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type UserProfile = {
  role?: 'super-admin' | 'administrador';
  workspaceId?: string;
};

type Workspace = {
    name?: string;
    appName?: string;
    logoUrl?: string;
    language?: 'es' | 'en' | 'pt';
    showStockToRequesters?: boolean;
}

export default function ConfiguracionPage() {
  // State for form fields
  const [workspaceName, setWorkspaceName] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>('');
  const [showStock, setShowStock] = useState(true);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const firestore = useFirestore();
  const { lang, dictionary } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

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

  // Effect to populate form when data loads
  useEffect(() => {
    if (isSuperAdmin) {
      // For super-admin, we allow editing the global fallback appName
      setWorkspaceName(workspaceData?.appName || '');
      setLogoPreview(null);
      setIsLoading(false);
    } else if (isWorkspaceAdmin && workspaceData) {
      setWorkspaceName(workspaceData.name || '');
      setLogoPreview(workspaceData.logoUrl || '');
      setShowStock(workspaceData.showStockToRequesters ?? true);
      setIsLoading(false);
    }
  }, [isSuperAdmin, isWorkspaceAdmin, workspaceData]);

  useEffect(() => {
    if (!isLoadingProfile && !isWorkspaceAdmin && !isSuperAdmin) {
        setIsLoading(false);
    }
  }, [isLoadingProfile, isWorkspaceAdmin, isSuperAdmin]);


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
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleRemoveLogo = () => {
    setLogoPreview(null);
  }

  const handleCustomizationSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (isSuperAdmin) {
        // --- Super Admin: Update global settings file via Server Action ---
        const formData = new FormData();
        formData.append('appName', workspaceName); // Super-admin still edits appName
        formData.append('logoUrl', logoPreview || '');
        await updateSettings(formData);

      } else if (isWorkspaceAdmin && workspaceDocRef) {
        // --- Workspace Admin: Update workspace document in Firestore ---
        await updateDoc(workspaceDocRef, {
            name: workspaceName, // Edit the workspace name
            logoUrl: logoPreview || '',
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

  const handleLanguageChange = (newLocale: string) => {
    if (!pathname) return;

    if (isWorkspaceAdmin && workspaceDocRef) {
      updateDoc(workspaceDocRef, { language: newLocale }).catch(error => {
        console.error("Failed to save language preference:", error);
        // This is non-critical, so we don't show a toast. The UI will still update for the session.
      });
    }

    const newPath = pathname.replace(`/${lang}`, `/${newLocale}`);
    router.push(newPath);
    router.refresh();
  };
  
  const handleShowStockChange = async (checked: boolean) => {
    if (!isWorkspaceAdmin || !workspaceDocRef) return;
    setIsSubmitting(true);
    try {
        await updateDoc(workspaceDocRef, {
            showStockToRequesters: checked,
        });
        setShowStock(checked);
        toast({
            title: 'Configuración guardada',
            description: 'La visibilidad del stock para solicitantes ha sido actualizada.',
        });
    } catch (error) {
        console.error('Error saving requester setting:', error);
        toast({
            variant: 'destructive',
            title: 'Error al guardar',
            description: 'No se pudo guardar el cambio en el permiso.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };


  const finalIsLoading = isLoading || isLoadingProfile || (isWorkspaceAdmin && isLoadingWorkspace);

  if (finalIsLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 flex justify-center items-center">
        <Loader2 className="animate-spin h-12 w-12" />
      </div>
    );
  }
  
  const title = isSuperAdmin ? dictionary.pages.configuracion.super_title : dictionary.pages.configuracion.admin_title;
  const description = isSuperAdmin 
    ? dictionary.pages.configuracion.super_description 
    : dictionary.pages.configuracion.admin_description;

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <Card>
        <form onSubmit={handleCustomizationSubmit}>
          <CardHeader>
            <CardTitle>Personalización</CardTitle>
            <CardDescription>
              Cambia el nombre y el logotipo que se muestran en la barra
              lateral.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="workspaceName">{isSuperAdmin ? "Nombre de la App (Fallback)" : "Nombre del Workspace"}</Label>
              <Input
                id="workspaceName"
                name="workspaceName"
                placeholder="Ej: Mi Inventario"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logotipo</Label>
              <Input
                id="logoUrl"
                name="logoUrl"
                type="file"
                accept="image/png, image/jpeg, image/gif, image/svg+xml"
                onChange={handleFileChange}
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
                  <Button variant="outline" size="sm" onClick={handleRemoveLogo}>Quitar logo</Button>
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
      
      <Card>
        <CardHeader>
          <CardTitle>Idioma</CardTitle>
          <CardDescription>
            Selecciona el idioma de la interfaz de usuario para este workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="language">Idioma del Workspace</Label>
            <Select value={lang} onValueChange={handleLanguageChange} disabled={!isWorkspaceAdmin && !isSuperAdmin}>
              <SelectTrigger className="w-[280px]" id="language">
                <SelectValue placeholder="Seleccionar idioma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="pt">Português</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permisos</CardTitle>
          <CardDescription>
            Define qué información pueden ver los roles específicos en tu workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                  <Label htmlFor="show-stock" className="text-base">Mostrar stock a solicitantes</Label>
                  <p className="text-sm text-muted-foreground">
                      Si está activado, los usuarios con rol "solicitante" verán la cantidad de stock disponible al crear un pedido.
                  </p>
              </div>
              <Switch
                id="show-stock"
                checked={showStock}
                onCheckedChange={handleShowStockChange}
                disabled={!isWorkspaceAdmin || isSubmitting}
              />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
