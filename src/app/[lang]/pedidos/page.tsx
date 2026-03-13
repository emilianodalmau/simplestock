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
import { ProcessRequestDialog } from '@/components/ui/process-request-dialog';
import type { StockMovement, InventoryStock, Product, Deposit } from '@/types/inventory';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/components/ui/badge';


// --- Data Types ---
type UserProfile = {
  id: string;
  role?: 'administrador' | 'jefe_deposito';
  workspaceId?: string;
};

const statusConfig = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-500 text-black' },
  procesado: { label: 'Procesado', color: 'bg-green-500 text-white' },
  cancelado: { label: 'Cancelado', color: 'bg-red-500 text-white' },
};


// --- Main Page Component ---
export default function PedidosPage() {
  const [selectedRequest, setSelectedRequest] = useState<StockMovement | null>(null);
  const firestore = useFirestore();
  const { user } = useUser();
  const { dictionary } = useI18n();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const isAdmin = currentUserProfile?.role === 'administrador';

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

  // Consulta segura para los depósitos del jefe
  const depositsQueryForJefe = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix || currentUserProfile?.role !== 'jefe_deposito' || !user) return null;
    return query(collection(firestore, `${collectionPrefix}/deposits`), where('jefeId', '==', user.uid));
  }, [firestore, collectionPrefix, currentUserProfile, user]);

  const { data: assignedDeposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsQueryForJefe);

  const assignedDepositIds = useMemo(() => {
      if (currentUserProfile?.role !== 'jefe_deposito' || !assignedDeposits) return null;
      if (assignedDeposits.length === 0) return []; // Si cargó y no tiene, es un array vacío
      return assignedDeposits.map(d => d.id);
  }, [currentUserProfile, assignedDeposits]);


  const requestsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix || !canAccessPage) return null;

    const movementsCollectionRef = collection(
      firestore,
      `${collectionPrefix}/stockMovements`
    );

    if (currentUserProfile?.role === 'jefe_deposito') {
        if (assignedDepositIds === null) return null; 
        if (assignedDepositIds.length === 0) return null; 
        // Jefe de depósito only sees PENDING requests for their depots.
        return query(
            movementsCollectionRef,
            where('status', '==', 'pendiente'),
            where('depositId', 'in', assignedDepositIds.slice(0, 30))
        );
    }
    
    // Admin sees ALL requests regardless of status
    if (currentUserProfile?.role === 'administrador') {
        // This query fetches all documents that have a 'status' field, which is more
        // accurate for what constitutes a "request" in the system.
        return query(movementsCollectionRef, where('status', 'in', ['pendiente', 'procesado', 'cancelado']), orderBy('createdAt', 'desc'));
    }

    return null;

  }, [firestore, collectionPrefix, canAccessPage, currentUserProfile, assignedDepositIds]);

  const { data: requests, isLoading: isLoadingRequests, forceRefetch: refetchRequests } =
    useCollection<StockMovement>(requestsQuery);
    
  const inventoryCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/inventory`) : null),
    [firestore, collectionPrefix]
  );
  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryCollection);
    
  const productsCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/products`) : null),
    [firestore, collectionPrefix]
  );
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsCollection);

  const isLoading = isLoadingProfile || isLoadingRequests || isLoadingInventory || isLoadingProducts || isLoadingDeposits;
  
  const handleRequestProcessed = () => {
    setSelectedRequest(null);
    if(refetchRequests) refetchRequests();
  }


  if (isLoading && !selectedRequest) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.pedidos.title}</h1>
          <p className="text-muted-foreground">
            {dictionary.pages.pedidos.description}
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
    <>
      <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight font-headline">{isAdmin ? "Gestión de Pedidos" : dictionary.pages.pedidos.title}</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Revisa, procesa o consulta el estado de todas las solicitudes." : dictionary.pages.pedidos.description}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{isAdmin ? 'Listado de Todas las Solicitudes' : 'Lista de Solicitudes'}</CardTitle>
            <CardDescription>
              {isAdmin ? 'Aquí se muestran todas las solicitudes: pendientes, procesadas y canceladas.' : 'Revisa cada solicitud y procésala para generar un remito de salida.'}
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
                    {isAdmin && <TableHead>Estado</TableHead>}
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
                         {isAdmin && <TableCell><Skeleton className="h-6 w-20" /></TableCell>}
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
                      <TableCell colSpan={isAdmin ? 7 : 6} className="text-center h-24">
                        {currentUserProfile?.role === 'jefe_deposito' && assignedDepositIds?.length === 0
                          ? 'No tienes un depósito asignado para ver pedidos.'
                          : 'No hay pedidos pendientes.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingRequests &&
                    (requests || [])
                      .map((req) => {
                        const status = req.status || 'pendiente';
                        const config = statusConfig[status as keyof typeof statusConfig] || { label: 'Desconocido', color: 'bg-gray-400' };

                        return (
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
                           {isAdmin && (
                              <TableCell>
                                <Badge className={config.color}>{config.label}</Badge>
                              </TableCell>
                            )}
                          <TableCell>{req.items.length}</TableCell>
                          <TableCell className="text-right">
                             {status === 'pendiente' ? (
                                <Button variant="outline" size="sm" onClick={() => setSelectedRequest(req)}>
                                  Procesar Pedido
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" disabled>
                                  Procesado
                                </Button>
                              )}
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

      {selectedRequest && inventory && products && currentUserProfile?.workspaceId && (
        <ProcessRequestDialog
          request={selectedRequest}
          inventory={inventory}
          products={products}
          workspaceId={currentUserProfile.workspaceId}
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onProcessed={handleRequestProcessed}
        />
      )}
    </>
  );
}
