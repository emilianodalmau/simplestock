
'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export default function AuditoriaPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Auditoría de Movimientos
        </h1>
        <p className="text-muted-foreground">
          Esta página ha sido desactivada temporalmente.
        </p>
      </div>

       <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Funcionalidad Desactivada</CardTitle>
          <CardDescription>
            La auditoría de movimientos depende de la gestión de stock, que se está rediseñando. Esta sección será restaurada junto con los movimientos.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
