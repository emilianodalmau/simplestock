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

export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [appName, setAppName] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchSettings() {
      const currentSettings = await getSettings();
      setSettings(currentSettings);
      setAppName(currentSettings.appName);
      setLogoPreview(currentSettings.logoUrl);
    }
    fetchSettings();
  }, []);

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData();
    formData.append('appName', appName);
    formData.append('logoUrl', logoPreview || '');
    
    try {
        await updateSettings(formData);
        toast({
            title: 'Configuración guardada',
            description: 'Los cambios se han guardado correctamente y se reflejarán en toda la aplicación.',
        });
        // Optionally, force a reload to see changes everywhere, especially the layout.
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

  if (!settings) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Ajustes y parámetros generales de la aplicación.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Personalización de la Aplicación</CardTitle>
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
                value={appName}
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
                onChange={handleFileChange}
              />
              <p className="text-sm text-muted-foreground">
                Sube una imagen (PNG, JPG, GIF, SVG). Límite de 1MB. Si no se selecciona ninguna, se usará el icono por defecto.
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
                  <Button variant="outline" size="sm" onClick={() => setLogoPreview(null)}>Quitar logo</Button>
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
