import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getMyMovements } from '@/lib/actions/movements';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// --- Helper Functions ---
const formatPrice = (price: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(price);
};

const getStatus = (remitoNumber?: string) => {
  if (!remitoNumber) return { text: 'Procesando', color: 'bg-yellow-500' };
  if (remitoNumber.startsWith('S-'))
    return { text: 'Pendiente', color: 'bg-orange-500' };
  if (remitoNumber.startsWith('R-'))
    return { text: 'Completado', color: 'bg-green-500' };
  if (remitoNumber.startsWith('AJ-'))
    return { text: 'Ajuste', color: 'bg-blue-500' };
  return { text: 'Desconocido', color: 'bg-gray-500' };
};

// --- Main Page Component (Server Component) ---
export default async function MisMovimientosPage() {
  const { movements, error } = await getMyMovements();

  if (error) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Acceso Denegado</CardTitle>
            <CardDescription>
              {error} Contacta al administrador si crees que esto es un error.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const totalValue = movements.reduce(
    (acc, mov) => acc + Math.abs(mov.totalValue || 0),
    0
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mis Movimientos</h1>
          <p className="text-muted-foreground">
            Aquí puedes ver el historial de todas tus solicitudes de productos.
          </p>
        </div>
        <Card className="w-full sm:w-auto">
          <CardHeader className="p-4">
            <CardDescription>Valor Total de Tus Movimientos</CardDescription>
            <CardTitle>{formatPrice(totalValue)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Solicitudes</CardTitle>
          <CardDescription>
            Revisa el estado y los detalles de cada movimiento que has generado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Remito/Solicitud Nº</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      No has realizado ningún movimiento todavía.
                    </TableCell>
                  </TableRow>
                )}
                {movements.map((mov) => {
                  const status = getStatus(mov.remitoNumber);
                  return (
                    <TableRow key={mov.id}>
                      <TableCell className="font-medium">
                        {format(new Date(mov.createdAt), 'PPpp', {
                          locale: es,
                        })}
                      </TableCell>
                      <TableCell className="font-mono">
                        {mov.remitoNumber || '-'}
                      </TableCell>
                      <TableCell>{mov.depositName}</TableCell>
                      <TableCell>{mov.items.length}</TableCell>
                      <TableCell>
                        <Badge
                          className={`${status.color} text-white hover:${status.color}`}
                        >
                          {status.text}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(Math.abs(mov.totalValue || 0))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
