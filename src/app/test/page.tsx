
'use client';

import { useMemo, useState } from 'react';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
} from '@/firebase';
import { collection, doc, query, where, getDocs, orderBy, endAt, startAt, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
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
import type { UserProfile, Deposit, StockMovement, InventoryStock, Product, StockMovementItem } from '@/types/inventory';
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
  const [workspaceDeposits, setWorkspaceDeposits] = useState<Deposit[] | null>(null);
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [inventory, setInventory] = useState<AggregatedInventoryItem[] | null>(null);
  const [pedidos, setPedidos] = useState<StockMovement[] | null>(null);
  const [ajustes, setAjustes] = useState<StockMovement[] | null>(null);
  
  const [processingId, setProcessingId] = useState<string | null>(null);


  const [isFetchingDeposits, setIsFetchingDeposits] = useState(false);
  const [isFetchingMovements, setIsFetchingMovements] = useState(false);
  const [isFetchingInventory, setIsFetchingInventory] = useState(false);
  const [isFetchingPedidos, setIsFetchingPedidos] = useState(false);
  const [isFetchingAjustes, setIsFetchingAjustes] = useState(false);
  const { toast } = useToast();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const canAccessPage = useMemo(() => {
    if (!currentUserProfile) return false;
    return ['administrador', 'super-admin'].includes(currentUserProfile.role!);
  }, [currentUserProfile]);
  
  const getWorkspaceDeposits = async (): Promise<Deposit[] | null> => {
    if (workspaceDeposits) return workspaceDeposits;
    
    if (!firestore || !user || !currentUserProfile?.workspaceId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo obtener la información del workspace.',
      });
      return null;
    }
    
    setIsFetchingDeposits(true);
    setWorkspaceDeposits(null);

    const depositsQuery = query(
      collection(
        firestore,
        `workspaces/${currentUserProfile.workspaceId}/deposits`
      )
    );

    try {
      const querySnapshot = await getDocs(depositsQuery);
      const depositsData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Deposit)
      );
      setWorkspaceDeposits(depositsData);
      return depositsData;
    } catch (error) {
      console.error('Error fetching workspace deposits:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Consulta',
        description: 'No se pudieron obtener los depósitos del workspace.',
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
    
    const movementsQuery = query(
      collection(
        firestore,
        `workspaces/${currentUserProfile.workspaceId}/stockMovements`
      )
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

    try {
        const inventoryQuery = query(collection(firestore, `workspaces/${currentUserProfile.workspaceId}/inventory`));
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

    const pedidosQuery = query(
      collection(
        firestore,
        `workspaces/${currentUserProfile.workspaceId}/stockMovements`
      ),
      orderBy('remitoNumber'),
      startAt('S-'),
      endAt('S-\\uf8ff')
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

  const handleFetchAjustes = async () => {
    if (!firestore || !currentUserProfile?.workspaceId) {
      toast({ variant: 'destructive', title: 'Error de Configuración' });
      return;
    }

    setIsFetchingAjustes(true);
    setAjustes(null);

    const ajustesQuery = query(
      collection(
        firestore,
        `workspaces/${currentUserProfile.workspaceId}/stockMovements`
      ),
      where('type', '==', 'ajuste'),
      orderBy('createdAt', 'desc')
    );

    try {
      const querySnapshot = await getDocs(ajustesQuery);
      const ajustesData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as StockMovement)
      );
      setAjustes(ajustesData);
    } catch (error) {
      console.error('Error fetching ajustes:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Consulta',
        description: 'No se pudo obtener el historial de ajustes.',
      });
    } finally {
      setIsFetchingAjustes(false);
    }
  };
  
  const handleProcessTestPedido = async (pedido: StockMovement) => {
    if (!firestore || !currentUserProfile?.workspaceId || !user) {
        toast({ variant: 'destructive', title: 'Error de Configuración' });
        return;
    }
    
    setProcessingId(pedido.id);

    const collectionPrefix = `workspaces/${currentUserProfile.workspaceId}`;
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const itemsToDeliver = pedido.items.map(item => ({...item, toDeliver: 1}));

            const productsQuery = query(collection(firestore, collectionPrefix, 'products'));
            const productsSnapshot = await getDocs(productsQuery);
            const productMap = new Map(productsSnapshot.docs.map(doc => [doc.id, doc.data() as Product]));
            
            const counterRef = doc(firestore, collectionPrefix, 'counters', 'remitoCounter');
            const originalRequestRef = doc(firestore, collectionPrefix, 'stockMovements', pedido.id);
            const stockRefs = itemsToDeliver.map(item => doc(firestore, collectionPrefix, 'inventory', `${item.productId}_${pedido.depositId}`));
            
            const allReads = await Promise.all([
                transaction.get(counterRef),
                transaction.get(originalRequestRef),
                ...stockRefs.map(ref => transaction.get(ref))
            ]);
            
            const [counterSnap, originalRequestSnap, ...stockSnaps] = allReads;

            if (!originalRequestSnap.exists()) throw new Error("La solicitud ya no existe.");

            for (let i = 0; i < itemsToDeliver.length; i++) {
                if ((stockSnaps[i].data()?.quantity || 0) < 1) {
                    throw new Error(`Stock insuficiente para ${itemsToDeliver[i].productName}. Se necesita 1, hay 0.`);
                }
            }

            const lastNumber = counterSnap.exists() ? counterSnap.data().lastNumber : 0;
            const newRemitoNumber = `R-${String(lastNumber + 1).padStart(5, '0')}`;
            
            transaction.set(counterRef, { lastNumber: lastNumber + 1 }, { merge: true });

            let newTotalValue = 0;
            const newMovementItems: StockMovementItem[] = [];

            for (const item of itemsToDeliver) {
                const product = productMap.get(item.productId);
                if (product) {
                    const itemValue = (product.price || 0) * 1;
                    newTotalValue += itemValue;
                    newMovementItems.push({
                         productId: item.productId,
                         productName: item.productName,
                         quantity: 1, // Deliver 1 unit
                         unit: item.unit,
                         price: product.price || 0,
                         total: itemValue,
                    });
                }
                const stockRef = doc(firestore, collectionPrefix, 'inventory', `${item.productId}_${pedido.depositId}`);
                transaction.set(stockRef, { quantity: increment(-1) }, { merge: true });
            }

            const newMovementRef = doc(collection(firestore, collectionPrefix, 'stockMovements'));
            transaction.set(newMovementRef, {
                ...pedido,
                id: newMovementRef.id,
                remitoNumber: newRemitoNumber,
                createdAt: serverTimestamp(),
                userId: user.uid,
                items: newMovementItems,
                totalValue: newTotalValue,
                processedFromRequestId: pedido.id,
            });

            transaction.delete(originalRequestRef);
        });
        
        toast({ title: 'Pedido de Prueba Procesado', description: `Se ha generado un remito entregando 1 unidad de cada item.` });
        await handleFetchPedidos();

    } catch (error: any) {
        console.error('Error procesando pedido de prueba:', error);
        toast({ variant: 'destructive', title: 'Error al Procesar', description: error.message });
    } finally {
        setProcessingId(null);
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
              Esta página de prueba es solo para Administradores.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Página de Prueba</h1>
        <p className="text-muted-foreground">
          Panel de prueba para Administradores.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Acceso de Administrador Concedido</CardTitle>
          <CardDescription>
            Usa estos botones para testear las consultas principales de la aplicación en el contexto de tu workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PRUEBA 1 */}
          <div>
              <h3 className="text-lg font-medium">Prueba 1: Depósitos del Workspace</h3>
              <p className="text-sm text-muted-foreground">
              Presiona el siguiente botón para consultar y listar todos los depósitos de tu workspace.
              </p>
          </div>
          {isFetchingDeposits && (
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-40" />
            </div>
          )}
          {workspaceDeposits !== null && !isFetchingDeposits && (
            <div>
              <h4 className="font-semibold mb-2">Resultados:</h4>
              {workspaceDeposits.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {workspaceDeposits.map((deposit) => (
                    <li key={deposit.id}>{deposit.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No se encontraron depósitos en este workspace.
                </p>
              )}
            </div>
          )}
           <CardFooter>
              <Button onClick={getWorkspaceDeposits} disabled={isFetchingDeposits}>
                  {isFetchingDeposits && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Consultar Depósitos
              </Button>
          </CardFooter>

          <Separator />
          
          {/* PRUEBA 2 */}
           <div>
              <h3 className="text-lg font-medium">Prueba 2: Todos los Movimientos</h3>
              <p className="text-sm text-muted-foreground">
               Presiona para buscar todos los movimientos del workspace.
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
                  No se encontraron movimientos para este workspace.
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
            <h3 className="text-lg font-medium">Prueba 3: Inventario del Workspace</h3>
            <p className="text-sm text-muted-foreground">
                Presiona para ver el inventario total de tu workspace.
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
                          No se encontró inventario en este workspace.
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
             <h3 className="text-lg font-medium">Prueba 4: Pedidos Pendientes del Workspace</h3>
             <p className="text-sm text-muted-foreground">
               Presiona para ver todas las solicitudes de productos (pedidos) pendientes del workspace.
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
               <h4 className="font-semibold mb-2">Pedidos Pendientes Encontrados:</h4>
               {pedidos.length > 0 ? (
                 <ul className="list-disc pl-5 space-y-2 font-mono text-sm">
                   {pedidos.map((pedido) => (
                     <li key={pedido.id} className="flex items-center justify-between">
                       <span>{pedido.remitoNumber}</span>
                       <Button 
                         size="sm" 
                         variant="outline"
                         onClick={() => handleProcessTestPedido(pedido)}
                         disabled={processingId === pedido.id}
                       >
                         {processingId === pedido.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                         Procesar (1 unidad)
                       </Button>
                     </li>
                   ))}
                 </ul>
               ) : (
                 <p className="text-muted-foreground">
                   No se encontraron pedidos pendientes para este workspace.
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
             
            <Separator />

            {/* PRUEBA 5 */}
            <div>
              <h3 className="text-lg font-medium">Prueba 5: Historial de Ajustes</h3>
              <p className="text-sm text-muted-foreground">
                Presiona para ver los movimientos de ajuste de stock del workspace.
              </p>
            </div>
            {isFetchingAjustes && (
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-32" />
              </div>
            )}
            {ajustes !== null && !isFetchingAjustes && (
               <div>
                <h4 className="font-semibold mb-2">Ajustes Encontrados:</h4>
                {ajustes.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 font-mono text-sm">
                    {ajustes.map((ajuste) => (
                      <li key={ajuste.id}>{ajuste.remitoNumber}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    No se encontraron ajustes para este workspace.
                  </p>
                )}
              </div>
            )}
             <CardFooter>
                   <Button onClick={handleFetchAjustes} disabled={isFetchingAjustes}>
                      {isFetchingAjustes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Consultar Historial de Ajustes
                  </Button>
              </CardFooter>

        </CardContent>
      </Card>
    </div>
  );
}
