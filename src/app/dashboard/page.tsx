
'use client';

import { useMemo } from 'react';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
} from '@/firebase';
import {
  doc,
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

type UserProfile = {
  role?: 'administrador' | 'super-admin';
  workspaceId?: string | null;
};


// Contenido principal del Dashboard
function MainDashboard() {
    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-bold tracking-tight font-headline">Panel de Control</h1>
            <p className="text-muted-foreground">Bienvenido a tu panel de control. Desde aquí puedes navegar a las distintas secciones de la aplicación.</p>

            <Card>
                <CardHeader>
                    <CardTitle>Primeros Pasos</CardTitle>
                    <CardDescription>
                        Te recomendamos comenzar por configurar los datos básicos de tu inventario en el siguiente orden:
                        <ol className="list-decimal list-inside mt-2 space-y-1">
                            <li>Crea tus <b>Proveedores</b>.</li>
                            <li>Define tus <b>Categorías</b> de productos.</li>
                            <li>Configura los <b>Depósitos</b> o almacenes.</li>
                            <li>Da de alta tus <b>Productos</b>.</li>
                        </ol>
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
}

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const isLoading = isUserLoading || isLoadingProfile;
  
  if (isLoading) {
    return (
       <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center min-h-[calc(100vh-10rem)]">
            <Loader2 className="h-12 w-12 animate-spin" />
        </div>
    )
  }

  // With the new signup flow, any user reaching the dashboard will have a workspace.
  // The logic to show a creation form is no longer needed here.
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <MainDashboard />
    </div>
  );
}
