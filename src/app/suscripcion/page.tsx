
'use client';

import { useMemo } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';
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
};

type Product = { id: string };
type Deposit = { id: string };
type UserInWorkspace = { id: string };

const planNames: Record<string, string> = {
  inicial: 'Plan Inicial',
  crecimiento: 'Plan Crecimiento',
  empresarial: 'Plan Empresarial',
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

  // Get current user's profile
  const userDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);
  const workspaceId = currentUserProfile?.workspaceId;

  // Get workspace data
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId ? doc(firestore, 'workspaces', workspaceId) : null),
    [firestore, workspaceId]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

  // Collections for usage metrics
  const productsCollection = useMemoFirebase(
    () => (firestore && workspaceId ? collection(firestore, `workspaces/${workspaceId}/products`) : null),
    [firestore, workspaceId]
  );
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(productsCollection);

  const depositsCollection = useMemoFirebase(
    () => (firestore && workspaceId ? collection(firestore, `workspaces/${workspaceId}/deposits`) : null),
    [firestore, workspaceId]
  );
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsCollection);
  
  const usersCollection = useMemoFirebase(
    () => (firestore && workspaceId ? collection(firestore, 'users') : null),
    [firestore, workspaceId]
  );
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserInWorkspace>(usersCollection);

  const isLoading =
    isLoadingProfile ||
    isLoadingWorkspace ||
    isLoadingProducts ||
    isLoadingDeposits ||
    isLoadingUsers;

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
        <h1 className="text-3xl font-bold tracking-tight font-headline">Suscripción y Facturación</h1>
        <p className="text-muted-foreground">Revisa tu plan actual, tu uso y gestiona tu suscripción.</p>
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
                 {/* Productos */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Productos</span>
                    <span className="text-sm text-muted-foreground">{usage.products.count} / {usage.products.limit}</span>
                  </div>
                  <Progress value={usage.products.percentage} />
                </div>
                {/* Depósitos */}
                 <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Depósitos</span>
                    <span className="text-sm text-muted-foreground">{usage.deposits.count} / {usage.deposits.limit}</span>
                  </div>
                  <Progress value={usage.deposits.percentage} />
                </div>
                {/* Usuarios */}
                 <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Usuarios</span>
                    <span className="text-sm text-muted-foreground">{usage.users.count} / {usage.users.limit}</span>
                  </div>
                  <Progress value={usage.users.percentage} />
                </div>
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
                 {currentPlan.status === 'free' ? (
                    <p className="text-muted-foreground">Estás en el plan gratuito. Mejora tu plan para acceder a funciones avanzadas y aumentar tus límites.</p>
                 ) : (
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="font-medium">Próxima Factura:</span>
                            <span>
                                {format(currentPlan.currentPeriodEnd.toDate(), 'dd \'de\' MMMM, yyyy', { locale: es })}
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
                {currentPlan.status !== 'free' && (
                    <Button variant="outline" disabled>Gestionar Método de Pago</Button>
                )}
            </CardFooter>
        </Card>
      </div>
    </div>
  );
}
