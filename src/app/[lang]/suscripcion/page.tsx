
'use client';

import { useMemo } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Loader2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useI18n } from '@/i18n/i18n-provider';

type UserProfile = {
  role?: 'super-admin' | 'administrador';
  workspaceId?: string;
};

type Workspace = {
  name: string;
  subscription: {
    planId: string;
    status: 'active' | 'past_due' | 'canceled' | 'free';
    currentPeriodEnd: any;
    limits: {
      maxProducts: number;
      maxUsers: number;
      maxDeposits: number;
      maxMovementsPerMonth: number;
    };
  };
  language?: 'es' | 'en' | 'pt';
};

type Product = { id: string };
type Deposit = { id: string };
type UserInWorkspace = { id: string };

const planNames: Record<string, string> = {
  inicial: 'Plan Inicial',
  crecimiento: 'Plan Crecimiento',
  empresarial: 'Plan Empresarial',
  fullfree: 'Plan Interno (Full Free)',
};

const statusTranslations: Record<string, string> = {
  active: 'Activo',
  past_due: 'Pago Vencido',
  canceled: 'Cancelado',
  free: 'Gratuito',
};

const statusColors: Record<string, 'default' | 'destructive' | 'secondary'> = {
  active: 'default',
  past_due: 'destructive',
  canceled: 'destructive',
  free: 'secondary',
};


export default function SuscripcionPage() {
  const { user: currentUser } = useUser();
  const firestore = useFirestore();
  const { dictionary } = useI18n();

  const userDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);
  const workspaceId = currentUserProfile?.workspaceId;
  const isWorkspaceAdmin = currentUserProfile?.role === 'administrador';

  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId ? doc(firestore, 'workspaces', workspaceId) : null),
    [firestore, workspaceId]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

  const productsCollection = useMemoFirebase(
    () => (firestore && workspaceId ? query(collection(firestore, `workspaces/${workspaceId}/products`), where('isArchived', '!=', true)) : null),
    [firestore, workspaceId]
  );
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(productsCollection);

  const depositsCollection = useMemoFirebase(
    () => (firestore && workspaceId ? collection(firestore, `workspaces/${workspaceId}/deposits`) : null),
    [firestore, workspaceId]
  );
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsCollection);
  
  // SOLUCIÓN: Solo ejecutar esta consulta si el usuario es administrador
  const usersCollectionQuery = useMemoFirebase(
    () => (firestore && workspaceId && isWorkspaceAdmin ? query(collection(firestore, 'users'), where('workspaceId', '==', workspaceId)) : null),
    [firestore, workspaceId, isWorkspaceAdmin]
  );
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserInWorkspace>(usersCollectionQuery);

  const isLoading =
    isLoadingProfile ||
    isLoadingWorkspace ||
    isLoadingProducts ||
    isLoadingDeposits ||
    (isWorkspaceAdmin && isLoadingUsers); // El loading de usuarios solo aplica si es admin

  const currentPlan = workspaceData?.subscription;
  
  const usage = useMemo(() => {
    return {
      products: {
        count: products?.length ?? 0,
        limit: currentPlan?.limits.maxProducts ?? 0,
        percentage: ((products?.length ?? 0) / (currentPlan?.limits.maxProducts || 1)) * 100,
      },
      deposits: {
        count: deposits?.length ?? 0,
        limit: currentPlan?.limits.maxDeposits ?? 0,
        percentage: ((deposits?.length ?? 0) / (currentPlan?.limits.maxDeposits || 1)) * 100,
      },
      users: {
        count: users?.length ?? 0,
        limit: currentPlan?.limits.maxUsers ?? 0,
        percentage: ((users?.length ?? 0) / (currentPlan?.limits.maxUsers || 1)) * 100,
      },
    };
  }, [products, deposits, users, currentPlan]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }
  
  if (!currentPlan) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>No se encontró suscripción</CardTitle>
            <CardDescription>No pudimos cargar los detalles de tu plan. Por favor, contacta a soporte.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.suscripcion.title}</h1>
        <p className="text-muted-foreground">{dictionary.pages.suscripcion.description}</p>
      </div>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Resumen del Plan</CardTitle>
            <div className="flex items-center gap-4 pt-2">
                 <h2 className="text-2xl font-semibold">{planNames[currentPlan.planId] || currentPlan.planId}</h2>
                 <Badge variant={statusColors[currentPlan.status] || 'default'}>{statusTranslations[currentPlan.status] || currentPlan.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Uso Actual del Plan</h3>
              <div className="space-y-4">
                 <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Productos</span>
                    <span className="text-sm text-muted-foreground">{usage.products.count} / {usage.products.limit >= 9999 ? 'Ilimitados' : usage.products.limit}</span>
                  </div>
                  <Progress value={usage.products.percentage} />
                </div>
                 <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Depósitos</span>
                    <span className="text-sm text-muted-foreground">{usage.deposits.count} / {usage.deposits.limit >= 9999 ? 'Ilimitados' : usage.deposits.limit}</span>
                  </div>
                  <Progress value={usage.deposits.percentage} />
                </div>
                {/* SOLUCIÓN: Solo mostrar la barra de usuarios si es admin */}
                 {isWorkspaceAdmin && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Usuarios</span>
                      <span className="text-sm text-muted-foreground">{usage.users.count} / {usage.users.limit >= 9999 ? 'Ilimitados' : usage.users.limit}</span>
                    </div>
                    <Progress value={usage.users.percentage} />
                  </div>
                 )}
              </div>
            </div>
            
          </CardContent>
          <CardFooter>
            <Button asChild>
                <Link href="/precios">
                    Mejorar Plan <ArrowRight className="ml-2 h-4 w-4"/>
                </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Facturación</CardTitle>
                <CardDescription>Detalles de tu ciclo de facturación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 {currentPlan.status === 'free' || currentPlan.planId === 'fullfree' ? (
                    <p className="text-muted-foreground">Estás en un plan gratuito o interno. Mejora tu plan para acceder a funciones avanzadas y aumentar tus límites.</p>
                 ) : (
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="font-medium">Próxima Factura:</span>
                            <span>
                                {format(currentPlan.currentPeriodEnd.toDate(), "dd 'de' MMMM, yyyy", { locale: es })}
                            </span>
                        </div>
                         <div className="flex justify-between">
                            <span className="font-medium">Método de Pago:</span>
                            <span>Próximamente</span>
                        </div>
                    </div>
                 )}
            </CardContent>
             <CardFooter>
                {currentPlan.status !== 'free' && currentPlan.planId !== 'fullfree' && (
                    <Button variant="outline" disabled>Gestionar Método de Pago</Button>
                )}
            </CardFooter>
        </Card>
      </div>
    </div>
  );
}
