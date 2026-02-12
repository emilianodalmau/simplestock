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
  collectionGroup,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useI18n } from '@/i18n/i18n-provider';
import type { Batch, Product, Deposit, UserProfile } from '@/types/inventory';
import { cn } from '@/lib/utils';
import { FileDown, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';


const getExpirationStatus = (expirationDate: Date) => {
    const today = new Date();
    const thirtyDaysFromNow = addDays(today, 30);
    today.setHours(0, 0, 0, 0);

    if (expirationDate < today) {
        return { text: 'Vencido', color: 'bg-red-600 text-white', priority: 3 };
    }
    if (expirationDate <= thirtyDaysFromNow) {
        return { text: 'Vence Pronto', color: 'bg-yellow-500 text-black', priority: 2 };
    }
    return { text: 'OK', color: 'bg-green-500 text-white', priority: 1 };
};

export default function VencimientosPage() {
  const [daysFilter, setDaysFilter] = useState('all');
  const firestore = useFirestore();
  const { user } = useUser();
  const { dictionary } = useI18n();

  const currentUserDocRef = useMemoFirebase(
    () => (user ? doc(firestore, `users/${user.uid}`) : null),
    [user, firestore]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(currentUserDocRef);

  const collectionPrefix = useMemo(
    () => (currentUserProfile?.workspaceId ? `workspaces/${currentUserProfile.workspaceId}` : null),
    [currentUserProfile]
  );

  const batchesQuery = useMemoFirebase(() => {
    if (!collectionPrefix) return null;
    const today = new Date();
    
    let q = query(
        collectionGroup(firestore, 'batches'),
        where('__name__', '>=', `${collectionPrefix}/`),
        where('__name__', '<', `${collectionPrefix}0`),
        where('expirationDate', '>=', today)
      );

    if (daysFilter !== 'all') {
        const limitDate = addDays(today, parseInt(daysFilter));
        q = query(q, where('expirationDate', '<=', limitDate));
    }
    
    return query(q, orderBy('expirationDate', 'asc'));

  }, [collectionPrefix, firestore, daysFilter]);
  
  const { data: batches, isLoading: isLoadingBatches } = useCollection<Batch>(batchesQuery);
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(useMemoFirebase(() => collectionPrefix ? collection(firestore, `${collectionPrefix}/products`) : null, [collectionPrefix, firestore]));
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(useMemoFirebase(() => collectionPrefix ? collection(firestore, `${collectionPrefix}/deposits`) : null, [collectionPrefix, firestore]));

  const productsMap = useMemo(() => new Map(products?.map(p => [p.id, p])), [products]);
  const depositsMap = useMemo(() => new Map(deposits?.map(d => [d.id, d.name])), [deposits]);

  const isLoading = isLoadingProfile || isLoadingBatches || isLoadingProducts || isLoadingDeposits;
  
  const canAccessPage = currentUserProfile?.role && ['administrador', 'editor', 'jefe_deposito'].includes(currentUserProfile.role);

  const handleExport = () => {
    if (!batches) return;
    const dataToExport = batches.map(batch => {
        const product = productsMap.get(batch.productId);
        const deposit = depositsMap.get(batch.depositId);
        const status = getExpirationStatus(batch.expirationDate.toDate());
        return {
            'Producto': product?.name || 'N/A',
            'Codigo Producto': product?.code || 'N/A',
            'Lote': batch.loteId,
            'Deposito': deposit || 'N/A',
            'Cantidad': batch.quantity,
            'Unidad': product?.unit || 'N/A',
            'Fecha Vencimiento': format(batch.expirationDate.toDate(), 'dd/MM/yyyy'),
            'Estado': status.text,
        };
    });
     const worksheet = XLSX.utils.json_to_sheet(dataToExport);
     const workbook = XLSX.utils.book_new();
     XLSX.utils.book_append_sheet(workbook, worksheet, 'Vencimientos');
     XLSX.writeFile(workbook, 'Reporte_Vencimientos.xlsx');
  };

  if (isLoading) {
      return (
          <div className="container mx-auto p-8"><Skeleton className="h-96 w-full" /></div>
      )
  }

  if (!canAccessPage) {
     return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card><CardHeader><CardTitle>Acceso Denegado</CardTitle><CardDescription>No tienes permisos para ver esta página.</CardDescription></CardHeader></Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.vencimientos.title}</h1>
        <p className="text-muted-foreground">{dictionary.pages.vencimientos.description}</p>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Lotes por Vencer</CardTitle>
            <CardDescription>Filtra por rango de días para priorizar acciones.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={daysFilter} onValueChange={setDaysFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por vencimiento..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ver todos los futuros</SelectItem>
                <SelectItem value="30">Próximos 30 días</SelectItem>
                <SelectItem value="60">Próximos 60 días</SelectItem>
                <SelectItem value="90">Próximos 90 días</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleExport} variant="outline"><FileDown className="mr-2 h-4 w-4" /> Exportar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Fecha Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && [...Array(5)].map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                ))}
                {!isLoading && batches?.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">No se encontraron lotes para el filtro seleccionado.</TableCell></TableRow>
                )}
                {!isLoading && batches?.map((batch) => {
                  const product = productsMap.get(batch.productId);
                  const deposit = depositsMap.get(batch.depositId);
                  const status = getExpirationStatus(batch.expirationDate.toDate());
                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{product?.name || 'Producto no encontrado'}</TableCell>
                      <TableCell className="font-mono">{batch.loteId}</TableCell>
                      <TableCell>{deposit || 'Depósito no encontrado'}</TableCell>
                      <TableCell className="text-right">{batch.quantity} {product?.unit}</TableCell>
                      <TableCell>{format(batch.expirationDate.toDate(), 'dd/MM/yyyy', { locale: es })}</TableCell>
                      <TableCell>
                        <Badge className={cn('text-white', status.color)}>{status.text}</Badge>
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
