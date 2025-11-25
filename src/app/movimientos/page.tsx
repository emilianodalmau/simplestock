
'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export default function MovimientosPage() {

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Movimientos de Stock
        </h1>
        <p className="text-muted-foreground">
          Esta página ha sido desactivada temporalmente.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Funcionalidad Desactivada</CardTitle>
          <CardDescription>
            La gestión de movimientos de stock se está rediseñando para mejorar la estabilidad y será restaurada en una futura actualización.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
