'use client';

import { useMemo } from 'react';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
} from '@/firebase';
import { doc } from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { UserProfile } from '@/types/inventory';

export default function TestPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(currentUserDocRef);

  const canAccessPage = useMemo(() => {
    if (!currentUserProfile) return false;
    // Solo el rol 'jefe_deposito' puede ver esta página
    return currentUserProfile.role === 'jefe_deposito';
  }, [currentUserProfile]);

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
          <CardTitle>¡Acceso Concedido!</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            Si estás viendo esto, significa que has iniciado sesión como un
            usuario con el rol `jefe_deposito`.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
