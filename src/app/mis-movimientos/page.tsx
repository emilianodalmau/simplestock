
'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RemitoActions } from '@/components/remito-actions';
import type { AppSettings } from '@/types/settings';
import type { StockMovement } from '@/app/movimientos/page';

type UserProfile = { 
  id: string;
  role?: 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'solicitante';
  workspaceId?: string;
};

type Workspace = {
    appName?: string;
    logoUrl?: string;
}

export default function MisMovimientosPage() {
  const [pdfSettings, setPdfSettings] = useState<AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string } | null>(null);
  const firestore = useFirestore();
  const { user } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(currentUserDocRef);
  
  const workspaceId = currentUserProfile?.workspaceId;
  
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId ? doc(firestore, 'workspaces', workspaceId) : null),
    [firestore, workspaceId]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

  useEffect(() => {
    if (!isLoadingWorkspace) {
        setPdfSettings({
            appName: workspaceData?.appName || 'Inventario',
            logoUrl: workspaceData?.logoUrl || '',
            workspaceAppName: workspaceData?.appName,
            workspaceLogoUrl: workspaceData?.logoUrl,
        });
    }
  }, [workspaceData, isLoadingWorkspace]);

  const collectionPrefix = useMemo(
    () => (workspaceId ? `workspaces/${workspaceId}` : null),
    [workspaceId]
  );

  const movementsQuery = useMemoFirebase(() => {
    if (!firestore || !user || !collectionPrefix || !currentUserProfile?.role) return null;

    const movementsCollectionRef = collection(firestore, `${collectionPrefix}/stockMovements`);
    
    // Solicitantes and Jefes MUST query by their own userId to comply with security rules
    // This query is now guaranteed to include the where clause for these roles.
    if (['solicitante', 'jefe_deposito'].includes(currentUserProfile.role)) {
      return query(movementsCollectionRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    }
    
    // For "Mis Movimientos", we'll still filter by userId for admins and others for consistency.
    return query(movementsCollectionRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    
  }, [firestore, user, collectionPrefix, currentUserProfile?.role]);
    
  const { data: movements, isLoading: isLoadingMovements } =
    useCollection<StockMovement>(movementsQuery);
    
  const isLoading = isLoadingProfile || isLoadingMovements || isLoadingWorkspace;
  const isAdmin = currentUserProfile?.role === 'administrador';
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  }
  
  if (isLoading) {
      return (
        <div className="container mx-auto p-4 sm:p-6 md:p-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight">Mis Movimientos</h1>
                <p className="text-muted-foreground">Historial de todos tus remitos generados.</p>
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
      )
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Mis Movimientos</h1>
        <p className="text-muted-foreground">Historial de todos tus remitos generados.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Historial de Remitos</CardTitle>
          <CardDescription>
             Aquí puedes ver los remitos que has generado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Remito Nº</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Origen/Destino</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead className='text-right'>Valor Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingMovements &&
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                       <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                {!isLoadingMovements && movements?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24">
                      No has generado ningún movimiento todavía.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoadingMovements &&
                  (movements || [])
                    .map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell className="font-medium">
                          {format(mov.createdAt.toDate(), 'PPpp', { locale: es })}
                        </TableCell>
                        <TableCell className="font-mono">{mov.remitoNumber || '-'}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              mov.type === 'entrada'
                                ? 'bg-green-100 text-green-800'
                                : mov.type === 'salida'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {mov.type.charAt(0).toUpperCase() + mov.type.slice(1)}
                          </span>
                        </TableCell>
                        <TableCell>{mov.depositName}</TableCell>
                        <TableCell>{mov.actorName || '-'}</TableCell>
                        <TableCell>{mov.items.length}</TableCell>
                        <TableCell className="text-right font-medium">
                           {mov.type === 'ajuste' && mov.totalValue < 0 ? '-' : ''}
                           {formatPrice(Math.abs(mov.totalValue || 0))}
                        </TableCell>
                        <TableCell className="text-right">
                           <RemitoActions 
                             movement={mov}
                             settings={pdfSettings}
                             canDelete={isAdmin}
                             onDelete={() => { /* No-op for now, only admins can delete */ }}
                           />
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
