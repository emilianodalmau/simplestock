
'use client';

import { useMemo, useState } from 'react';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
  useCollection,
} from '@/firebase';
import { collection, doc, query, where, getDocs } from 'firebase/firestore';
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
import type { UserProfile, Deposit, StockMovement } from '@/types/inventory';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';


export default function TestPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [assignedDeposits, setAssignedDeposits] = useState<Deposit[] | null>(null);
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [isFetchingDeposits, setIsFetchingDeposits] = useState(false);
  const [isFetchingMovements, setIsFetchingMovements] = useState(false);
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

  const handleFetchDeposits = async () => {
    if (!firestore || !user || !currentUserProfile?.workspaceId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo obtener la información necesaria.',
      });
      return;
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
    } catch (error) {
      console.error('Error fetching assigned deposits:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Consulta',
        description: 'No se pudieron obtener los depósitos asignados.',
      });
    } finally {
      setIsFetchingDeposits(false);
    }
  };

  const handleFetchMovements = async () => {
    if (!firestore || !currentUserProfile?.workspaceId) {
      toast({ variant: 'destructive', title: 'Error de Configuración' });
      return;
    }
    
    // Primero, nos aseguramos de tener los depósitos. Si no los hemos buscado, los buscamos.
    let currentAssignedDeposits = assignedDeposits;
    if (!currentAssignedDeposits) {
        await handleFetchDeposits(); // Esperamos a que termine
        // Re-leemos el estado después de la espera
        currentAssignedDeposits = (await new Promise<Deposit[] | null>(resolve => {
            setTimeout(() => {
                // Pequeña trampa para leer el estado actualizado después del re-render
                setAssignedDeposits(prev => {
                    resolve(prev);
                    return prev;
                })
            }, 0)
        }));
    }

    if (!currentAssignedDeposits || currentAssignedDeposits.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin Depósitos',
        description: 'No tienes depósitos asignados para consultar movimientos.',
      });
      return;
    }

    setIsFetchingMovements(true);
    setMovements(null);

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
        <CardContent>
          <div className="space-y-4">
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
                <Button onClick={handleFetchDeposits} disabled={isFetchingDeposits}>
                    {isFetchingDeposits && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Consultar Mis Depósitos
                </Button>
            </CardFooter>

            <Separator />

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

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
