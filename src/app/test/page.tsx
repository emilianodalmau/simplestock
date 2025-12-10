
'use client';

import { useMemo, useState } from 'react';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
} from '@/firebase';
import { collection, doc, query, where, getDocs, orderBy, endAt, startAt } from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { UserProfile, Deposit, StockMovement, InventoryStock, Product } from '@/types/inventory';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

type AggregatedInventoryItem = {
  productId: string;
  productName: string;
  totalQuantity: number;
  unit: string;
};

export default function TestPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [assignedDeposits, setAssignedDeposits] = useState<Deposit[] | null>(null);
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [inventory, setInventory] = useState<AggregatedInventoryItem[] | null>(null);
  const [pedidos, setPedidos] = useState<StockMovement[] | null>(null);

  const [isFetchingDeposits, setIsFetchingDeposits] = useState(false);
  const [isFetchingMovements, setIsFetchingMovements] = useState(false);
  const [isFetchingInventory, setIsFetchingInventory] = useState(false);
  const [isFetchingPedidos, setIsFetchingPedidos] = useState(false);
  const { toast } = useToast();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const canAccessPage = useMemo(() => {
    if (!currentUserProfile) return false;
    return currentUserProfile.role === 'jefe_deposito';
  }, [currentUserProfile]);
  
  const getAssignedDeposits = async (): Promise<Deposit[] | null> => {
    if (assignedDeposits) return assignedDeposits;
    
    if (!firestore || !user || !currentUserProfile?.workspaceId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo obtener la información necesaria.',
      });
      return null;
    }
    
    setIsFetchingDeposits(true);
    setAssignedDeposits(null);

    const depositsQuery = query(
      collection(
        firestore,
        `workspaces/${currentUserProfile.workspaceId}/deposits`
      ),
      where('jefeId', '==', user.uid)
    );

    try {
      const querySnapshot = await getDocs(depositsQuery);
      const depositsData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Deposit)
      );
      setAssignedDeposits(depositsData);
      return depositsData;
    } catch (error) {
      console.error('Error fetching assigned deposits:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Consulta',
        description: 'No se pudieron obtener los depósitos asignados.',
      });
      return null;
    } finally {
      setIsFetchingDeposits(false);
    }
  };

  const handleFetchMovements = async () => {
    if (!firestore || !currentUserProfile?.workspaceId) {
      toast({ variant: 'destructive', title: 'Error de Configuración' });
      return;
    }
    
    setIsFetchingMovements(true);
    setMovements(null);
    const currentAssignedDeposits = await getAssignedDeposits();

    if (!currentAssignedDeposits || currentAssignedDeposits.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin Depósitos',
        description: 'No tienes depósitos asignados para consultar movimientos.',
      });
      setIsFetchingMovements(false);
      return;
    }

    const depositIds = currentAssignedDeposits.map(d => d.id);

    const movementsQuery = query(
      collection(
        firestore,
        `workspaces/${currentUserProfile.workspaceId}/stockMovements`
      ),
      where('depositId', 'in', depositIds)
    );

    try {
      const querySnapshot = await getDocs(movementsQuery);
      const movementsData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as StockMovement)
      );
      setMovements(movementsData);
    } catch (error) {
      console.error('Error fetching movements:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Consulta',
        description: 'No se pudieron obtener los movimientos.',
      });
    } finally {
      setIsFetchingMovements(false);
    }
  };
  
  const handleFetchInventory = async () => {
    if (!firestore || !currentUserProfile?.workspaceId) {
        toast({ variant: 'destructive', title: 'Error de Configuración' });
        return;
    }

    setIsFetchingInventory(true);
    setInventory(null);
    const currentAssignedDeposits = await getAssignedDeposits();

    if (!currentAssignedDeposits || currentAssignedDeposits.length === 0) {
        toast({ variant: 'destructive', title: 'Sin Depósitos', description: 'No tienes depósitos asignados.' });
        setIsFetchingInventory(false);
        return;
    }

    const depositIds = currentAssignedDeposits.map(d => d.id);

    try {
        const inventoryQuery = query(collection(firestore, `workspaces/${currentUserProfile.workspaceId}/inventory`), where('depositId', 'in', depositIds));
        const inventorySnapshot = await getDocs(inventoryQuery);
        const inventoryData = inventorySnapshot.docs.map(doc => doc.data() as InventoryStock);

        if (inventoryData.length === 0) {
            setInventory([]);
            return;
        }

        const productsQuery = collection(firestore, `workspaces/${currentUserProfile.workspaceId}/products`);
        const productsSnapshot = await getDocs(productsQuery);
        const productsMap = new Map(productsSnapshot.docs.map(doc => [doc.id, doc.data() as Product]));

        const aggregatedStock: Map<string, { totalQuantity: number, name: string, unit: string }> = new Map();
        inventoryData.forEach(stockItem => {
            const product = productsMap.get(stockItem.productId);
            if (product) {
                const existing = aggregatedStock.get(stockItem.productId) || { totalQuantity: 0, name: product.name, unit: product.unit };
                existing.totalQuantity += stockItem.quantity;
                aggregatedStock.set(stockItem.productId, existing);
            }
        });
        
        const finalInventory: AggregatedInventoryItem[] = Array.from(aggregatedStock.entries()).map(([productId, data]) => ({
            productId,
            productName: data.name,
            totalQuantity: data.totalQuantity,
            unit: data.unit,
        }));

        setInventory(finalInventory);

    } catch (error) {
        console.error('Error fetching inventory:', error);
        toast({ variant: 'destructive', title: 'Error de Consulta', description: 'No se pudo obtener el inventario.' });
    } finally {
        setIsFetchingInventory(false);
    }
  };
  
  const handleFetchPedidos = async () => {
    if (!firestore || !currentUserProfile?.workspaceId) {
      toast({ variant: 'destructive', title: 'Error de Configuración' });
      return;
    }

    setIsFetchingPedidos(true);
    setPedidos(null);
    const currentAssignedDeposits = await getAssignedDeposits();

    if (!currentAssignedDeposits || currentAssignedDeposits.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin Depósitos',
        description: 'No tienes depósitos asignados para consultar pedidos.',
      });
      setIsFetchingPedidos(false);
      return;
    }

    const depositIds = currentAssignedDeposits.map((d) => d.id);

    const pedidosQuery = query(
      collection(
        firestore,
        `workspaces/${currentUserProfile.workspaceId}/stockMovements`
      ),
      where('depositId', 'in', depositIds),
      orderBy('remitoNumber'),
      startAt('S-'),
      endAt('S-\uf8ff')
    );

    try {
      const querySnapshot = await getDocs(pedidosQuery);
      const pedidosData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as StockMovement)
      );
      setPedidos(pedidosData);
    } catch (error) {
      console.error('Error fetching pedidos:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Consulta',
        description: 'No se pudieron obtener los pedidos pendientes.',
      });
    } finally {
      setIsFetchingPedidos(false);
    }
  };


  const isLoading = isUserLoading || isLoadingProfile;

  if (isLoading) {
    return (
      <div className="container mx-auto flex h-full items-center justify-center p-8">
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
              No tienes los permisos necesarios para acceder a esta página de
              prueba.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Página de Prueba</h1>
        <p className="text-muted-foreground">
          Esta es una página de prueba exclusiva para el rol Jefe de Depósito.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Acceso Concedido</CardTitle>
          <CardDescription>
            Si estás viendo esto, significa que has iniciado sesión como un
            usuario con el rol `jefe_deposito`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PRUEBA 1 */}
          <div>
              <h3 className="text-lg font-medium">Prueba 1: Depósitos Asignados</h3>
              <p className="text-sm text-muted-foreground">
              Presiona el siguiente botón para consultar y listar los depósitos
              que tienes asignados.
              </p>
          </div>
          {isFetchingDeposits && (
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-40" />
            </div>
          )}
          {assignedDeposits !== null && !isFetchingDeposits && (
            <div>
              <h4 className="font-semibold mb-2">Resultados:</h4>
              {assignedDeposits.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {assignedDeposits.map((deposit) => (
                    <li key={deposit.id}>{deposit.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No se encontraron depósitos asignados a tu usuario.
                </p>
              )}
            </div>
          )}
           <CardFooter>
              <Button onClick={getAssignedDeposits} disabled={isFetchingDeposits}>
                  {isFetchingDeposits && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Consultar Mis Depósitos
              </Button>
          </CardFooter>

          <Separator />
          
          {/* PRUEBA 2 */}
           <div>
              <h3 className="text-lg font-medium">Prueba 2: Movimientos por Depósito</h3>
              <p className="text-sm text-muted-foreground">
               Presiona para buscar todos los movimientos de los depósitos que tengas asignados.
              </p>
          </div>
          {isFetchingMovements && (
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-28" />
            </div>
          )}
          {movements !== null && !isFetchingMovements && (
             <div>
              <h4 className="font-semibold mb-2">Números de Remito Encontrados:</h4>
              {movements.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1 font-mono text-sm">
                  {movements.map((mov) => (
                    <li key={mov.id}>{mov.remitoNumber || `ID: ${mov.id}`}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No se encontraron movimientos para tus depósitos.
                </p>
              )}
            </div>
          )}
           <CardFooter>
               <Button onClick={handleFetchMovements} disabled={isFetchingMovements}>
                  {isFetchingMovements && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Consultar Movimientos
              </Button>
          </CardFooter>

          <Separator />
          
          {/* PRUEBA 3 */}
          <div>
            <h3 className="text-lg font-medium">Prueba 3: Inventario por Depósito</h3>
            <p className="text-sm text-muted-foreground">
                Presiona para ver el inventario total de tus depósitos.
            </p>
          </div>
          {isFetchingInventory && (
              <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-40" />
              </div>
          )}
          {inventory !== null && !isFetchingInventory && (
              <div>
                  <h4 className="font-semibold mb-2">Inventario Agregado:</h4>
                  {inventory.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1 text-sm">
                          {inventory.map((item) => (
                              <li key={item.productId}>
                                  {item.productName}: <span className="font-medium">{item.totalQuantity} {item.unit}</span>
                              </li>
                          ))}
                      </ul>
                  ) : (
                      <p className="text-muted-foreground">
                          No se encontró inventario en tus depósitos.
                      </p>
                  )}
              </div>
          )}
           <CardFooter>
                 <Button onClick={handleFetchInventory} disabled={isFetchingInventory}>
                    {isFetchingInventory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Consultar Inventario
                </Button>
            </CardFooter>

           <Separator />

           {/* PRUEBA 4 */}
           <div>
             <h3 className="text-lg font-medium">Prueba 4: Pedidos Pendientes</h3>
             <p className="text-sm text-muted-foreground">
               Presiona para ver las solicitudes de productos (pedidos) pendientes para tus depósitos.
             </p>
           </div>
           {isFetchingPedidos && (
             <div className="space-y-2">
               <Skeleton className="h-5 w-24" />
               <Skeleton className="h-5 w-28" />
             </div>
           )}
           {pedidos !== null && !isFetchingPedidos && (
              <div>
               <h4 className="font-semibold mb-2">Nº de Pedidos Pendientes Encontrados:</h4>
               {pedidos.length > 0 ? (
                 <ul className="list-disc pl-5 space-y-1 font-mono text-sm">
                   {pedidos.map((pedido) => (
                     <li key={pedido.id}>{pedido.remitoNumber}</li>
                   ))}
                 </ul>
               ) : (
                 <p className="text-muted-foreground">
                   No se encontraron pedidos pendientes para tus depósitos.
                 </p>
               )}
             </div>
           )}
            <CardFooter>
                  <Button onClick={handleFetchPedidos} disabled={isFetchingPedidos}>
                     {isFetchingPedidos && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     Consultar Pedidos
                 </Button>
             </CardFooter>

        </CardContent>
      </Card>
    </div>
  );
}

    