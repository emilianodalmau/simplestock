'use server';

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
import { getSettings, updateSettings } from '@/lib/settings';

export default async function ConfiguracionPage() {
  const settings = await getSettings();

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Ajustes y parámetros generales de la aplicación.
        </p>
      </div>

      <Card>
        <form action={updateSettings}>
          <CardHeader>
            <CardTitle>Personalización de la Aplicación</CardTitle>
            <CardDescription>
              Cambia el nombre y el logotipo que se muestran en la barra
              lateral.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appName">Nombre de la Aplicación</Label>
              <Input
                id="appName"
                name="appName"
                placeholder="Ej: Mi Inventario"
                defaultValue={settings.appName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logoUrl">URL del Logotipo</Label>
              <Input
                id="logoUrl"
                name="logoUrl"
                placeholder="https://example.com/logo.png"
                defaultValue={settings.logoUrl}
              />
              <p className="text-sm text-muted-foreground">
                Pega la URL de una imagen. Si se deja en blanco, se mostrará un
                icono por defecto.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit">Guardar Cambios</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
