
'use client';

import { useState, useMemo } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';
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
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type StockMovement = {
  id: string;
  type: 'entrada' | 'salida';
  date: { seconds: number; nanoseconds: number };
  reason: string;
  userId: string;
  productName: string;
  depositName: string;
  quantity: number;
};

type UserProfile = {
  id: string;
  displayName?: string;
  email: string;
  role?: 'administrador' | 'editor' | 'visualizador';
};

function UserDisplayName({ userId }: { userId: string }) {
    const firestore = useFirestore();
    const userDocRef = useMemoFirebase(() => (firestore ? doc(firestore, 'users', userId) : null), [firestore, userId]);
    const { data: userProfile, isLoading } = useDoc<UserProfile>(userDocRef);

    if (isLoading) {
        return <Skeleton className="h-4 w-24" />;
    }

    return <span>{userProfile?.displayName || userProfile?.email || userId}</span>;
}


export default function AuditoriaPage() {
  const firestore = useFirestore();
  const { user: currentUser } = useUser();

  const userDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingUser } = useDoc<UserProfile>(userDocRef);

  const canViewPage =
    currentUserProfile?.role === 'administrador' || currentUserProfile?.role === 'editor';

  const movementsCollection = useMemoFirebase(
    () => (firestore && canViewPage ? collection(firestore, 'stockMovements') : null),
    [firestore, canViewPage]
  );
  const { data: movements, isLoading: isLoadingMovements } =
    useCollection<StockMovement>(movementsCollection);

  const isLoading = isLoadingMovements || isLoadingUser;

  if (!isLoadingUser && !canViewPage) {
     return (
        <div className="container mx-auto p-4 sm:p-6 md:p-8">
            <Card>
                <CardHeader>
                    <CardTitle className="text-destructive">Acceso Denegado</CardTitle>
                    <CardDescription>
                        No tienes los permisos necesarios para ver esta página.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Auditoría de Movimientos</h1>
        <p className="text-muted-foreground">
          Un registro completo de todas las entradas y salidas de stock.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial Completo</CardTitle>
          <CardDescription>
            Aquí puedes rastrear cada cambio en el inventario.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha y Hora</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  [...Array(10)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && movements?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No se han registrado movimientos.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  movements?.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {mov.date
                          ? format(
                              new Date(mov.date.seconds * 1000),
                              'Ppp',
                              { locale: es }
                            )
                          : '-'}
                      </TableCell>
                      <TableCell className="font-medium">
                        <UserDisplayName userId={mov.userId} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-semibold ${
                            mov.type === 'entrada'
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {mov.type.charAt(0).toUpperCase() + mov.type.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell>{mov.productName}</TableCell>
                      <TableCell className="font-medium">{mov.quantity}</TableCell>
                      <TableCell className="text-muted-foreground">{mov.depositName}</TableCell>
                      <TableCell className="text-muted-foreground">{mov.reason}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
