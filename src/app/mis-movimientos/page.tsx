
'use client';

import { useMemo } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { StockMovement, UserProfile } from '@/types/inventory';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

// --- Main Page Component ---
export default function MisMovimientosPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const canAccessPage = currentUserProfile?.role === 'solicitante';
  const workspaceId = currentUserProfile?.workspaceId;

  const collectionPrefix = useMemo(
    () => (workspaceId ? `workspaces/${workspaceId}` : null),
    [workspaceId]
  );

  const movementsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix || !user) return null;

    // This query is secure because it's strictly filtered by the current user's ID,
    // aligning with Firestore security rules.
    return query(
      collection(firestore, `${collectionPrefix}/stockMovements`),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, collectionPrefix, user]);

  const { data: movements, isLoading: isLoadingMovements } =
    useCollection<StockMovement>(movementsQuery);

  const totalValue = useMemo(() => {
    if (!movements) return 0;
    return movements.reduce((acc, mov) => acc + Math.abs(mov.totalValue || 0), 0);
  }, [movements]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(price);
  };
  
  const getStatus = (remitoNumber?: string) => {
      if (!remitoNumber) return { text: 'Procesando', color: 'bg-yellow-500' };
      if (remitoNumber.startsWith('S-')) return { text: 'Pendiente', color: 'bg-orange-500' };
      if (remitoNumber.startsWith('R-')) return { text: 'Completado', color: 'bg-green-500' };
      if (remitoNumber.startsWith('AJ-')) return { text: 'Ajuste', color: 'bg-blue-500' };
      return { text: 'Desconocido', color: 'bg-gray-500' };
  }

  const isLoading = isUserLoading || isLoadingProfile || isLoadingMovements;

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  if (!canAccessPage) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>
              No tienes los permisos necesarios para ver esta página.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
                {isLoadingMovements &&
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-36" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-10" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoadingMovements && movements?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      No has realizado ningún movimiento todavía.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoadingMovements &&
                  movements?.map((mov) => {
                    const status = getStatus(mov.remitoNumber);
                    return (
                        <TableRow key={mov.id}>
                        <TableCell className="font-medium">
                            {format(mov.createdAt.toDate(), 'PPpp', { locale: es })}
                        </TableCell>
                        <TableCell className="font-mono">
                            {mov.remitoNumber || '-'}
                        </TableCell>
                        <TableCell>{mov.depositName}</TableCell>
                        <TableCell>{mov.items.length}</TableCell>
                        <TableCell>
                             <Badge className={`${status.color} text-white hover:${status.color}`}>
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
