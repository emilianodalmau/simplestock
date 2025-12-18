
'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export default function SuperAdminPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Administración General
        </h1>
        <p className="text-muted-foreground">
          Panel de control para el super-administrador.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Panel de Super-Admin</CardTitle>
          <CardDescription>
            Esta sección está reservada para la administración avanzada del sistema.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
