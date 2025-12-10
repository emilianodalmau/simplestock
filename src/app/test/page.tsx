
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
import type { UserProfile, Deposit } from '@/types/inventory';
import { Skeleton } from '@/components/ui/skeleton';

export default function TestPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [assignedDeposits, setAssignedDeposits] = useState<Deposit[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);
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
    setIsFetching(true);
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
      setIsFetching(false);
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
            <p>
              Presiona el siguiente botón para consultar y listar los depósitos
              que tienes asignados.
            </p>

            {isFetching && (
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-40" />
              </div>
            )}
            
            {assignedDeposits !== null && !isFetching && (
              <div>
                <h3 className="font-semibold mb-2">Depósitos Asignados:</h3>
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
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleFetchDeposits} disabled={isFetching}>
            {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Consultar Mis Depósitos
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
