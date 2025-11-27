
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
import { FileDown, ArrowDown, ArrowUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { StockMovement } from '@/types/inventory';

type UserProfile = {
  id: string;
  role?: 'administrador' | 'jefe_deposito';
  workspaceId?: string;
};

export default function AuditoriaPage() {
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

  const adjustmentsQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix || !canAccessPage) return null;

    const movementsCollectionRef = collection(
      firestore,
      `${collectionPrefix}/stockMovements`
    );

    return query(
      movementsCollectionRef,
      where('type', '==', 'ajuste'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, collectionPrefix, canAccessPage]);

  const { data: adjustments, isLoading: isLoadingAdjustments } =
    useCollection<StockMovement>(adjustmentsQuery);

  const isLoading = isLoadingProfile || isLoadingAdjustments;
  
  const handleExportToExcel = () => {
    const dataToExport = (adjustments || []).map(adj => {
        const item = adj.items[0]; // Adjustments have only one item
        return {
            'Fecha': format(adj.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: es }),
            'Remito Nº': adj.remitoNumber || '-',
            'Depósito': adj.depositName,
            'Producto': item.productName,
            'Ajuste': item.quantity,
            'Unidad': item.unit,
            'Realizado Por': adj.actorName,
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial de Ajustes');
    XLSX.writeFile(workbook, 'Historial_Ajustes.xlsx');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">
            Historial de Ajustes
          </h1>
          <p className="text-muted-foreground">
            Auditoría de todos los ajustes de stock manuales.
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
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">
                Historial de Ajustes
            </h1>
            <p className="text-muted-foreground">
                Auditoría de todos los ajustes de stock manuales.
            </p>
        </div>
        <Button onClick={handleExportToExcel} variant="outline" disabled={!adjustments || adjustments.length === 0}>
            <FileDown className="mr-2 h-4 w-4" />
            Exportar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos de Ajuste</CardTitle>
          <CardDescription>
            Cada fila representa una corrección de stock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Remito Nº</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Ajuste</TableHead>
                  <TableHead>Realizado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingAdjustments &&
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    </TableRow>
                  ))}
                {!isLoadingAdjustments && adjustments?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      No se han registrado ajustes de inventario.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoadingAdjustments &&
                  adjustments?.map((adj) => {
                    const item = adj.items[0]; // Adjustments only have one item
                    const isPositive = item.quantity > 0;
                    return (
                        <TableRow key={adj.id}>
                            <TableCell className="font-medium">
                                {format(adj.createdAt.toDate(), 'PPpp', { locale: es })}
                            </TableCell>
                            <TableCell className="font-mono">{adj.remitoNumber || '-'}</TableCell>
                            <TableCell>{adj.depositName}</TableCell>
                            <TableCell>{item.productName}</TableCell>
                            <TableCell className={`text-right font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                <div className='flex items-center justify-end gap-1'>
                                    {isPositive ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                                    {isPositive ? '+' : ''}{item.quantity} {item.unit}
                                </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{adj.actorName}</TableCell>
                        </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
