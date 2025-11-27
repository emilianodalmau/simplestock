
'use client';

import { useState, useMemo } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  startAt,
  endAt,
} from 'firebase/firestore';
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
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// --- Data Types ---
type StockMovement = {
  id: string;
  remitoNumber?: string;
  type: 'entrada' | 'salida';
  depositId: string;
  depositName: string;
  actorName?: string;
  userId: string;
  createdAt: {
    toDate: () => Date;
  };
  items: any[]; // Simple for now
};

type UserProfile = {
  id: string;
  role?: 'administrador' | 'jefe_deposito';
  workspaceId?: string;
};

// --- Main Page Component ---
export default function PedidosPage() {
  const firestore = useFirestore();
  const { user } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const canAccessPage = useMemo(() => {
    if (!currentUserProfile) return false;
    return ['administrador', 'jefe_deposito'].includes(
      currentUserProfile.role!
    );
  }, [currentUserProfile]);

  const collectionPrefix = useMemo(
    () =>
      currentUserProfile?.workspaceId
        ? `workspaces/${currentUserProfile.workspaceId}`
        : null,
    [currentUserProfile]
  );

  const requestsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix || !canAccessPage) return null;

    const movementsCollectionRef = collection(
      firestore,
      `${collectionPrefix}/stockMovements`
    );

    // Query for all documents where remitoNumber starts with "S-"
    return query(
      movementsCollectionRef,
      orderBy('remitoNumber'),
      startAt('S-'),
      endAt('S-\uf8ff')
    );
  }, [firestore, collectionPrefix, canAccessPage]);

  const { data: requests, isLoading: isLoadingRequests } =
    useCollection<StockMovement>(requestsQuery);

  const isLoading = isLoadingProfile || isLoadingRequests;

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Pedidos Pendientes</h1>
          <p className="text-muted-foreground">
            Solicitudes de productos que requieren tu acción.
          </p>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Pedidos Pendientes</h1>
        <p className="text-muted-foreground">
          Solicitudes de productos que requieren tu acción para ser procesadas.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista de Solicitudes</CardTitle>
          <CardDescription>
            Revisa cada solicitud y procésala para generar un remito de salida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Solicitud Nº</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Nº de Items</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingRequests &&
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-36" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
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
                        <Skeleton className="h-8 w-32 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoadingRequests && requests?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      No hay pedidos pendientes.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoadingRequests &&
                  (requests || [])
                    .sort(
                      (a, b) =>
                        b.createdAt.toDate().getTime() -
                        a.createdAt.toDate().getTime()
                    )
                    .map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {format(req.createdAt.toDate(), 'PPpp', {
                            locale: es,
                          })}
                        </TableCell>
                        <TableCell className="font-mono">
                          {req.remitoNumber || '-'}
                        </TableCell>
                        <TableCell>{req.actorName || '-'}</TableCell>
                        <TableCell>{req.depositName}</TableCell>
                        <TableCell>{req.items.length}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" disabled>
                             Procesar Pedido
                          </Button>
                        </TableCell>
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

