'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export default function SolicitudesPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Solicitudes
        </h1>
        <p className="text-muted-foreground">
          Gestión de solicitudes de productos.
        </p>
      </div>

       <Card>
        <CardHeader>
          <CardTitle>Funcionalidad en Desarrollo</CardTitle>
          <CardDescription>
            Esta sección está en construcción. Aquí podrás gestionar las solicitudes de productos entre áreas o depósitos.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
