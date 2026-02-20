
'use client';

import { useMemo } from 'react';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
  useCollection,
} from '@/firebase';
import { doc, collection, query, limit } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { CreateWorkspaceForm } from '@/components/auth/create-workspace-form';
import { useSearchParams } from 'next/navigation';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { FinancialDashboard } from '@/components/dashboard/financial-dashboard';
import type {
  InventoryStock,
  Product,
  Category,
  Deposit,
  Supplier,
  StockMovement,
} from '@/types/inventory';
import { useI18n } from '@/i18n/i18n-provider';


type UserProfile = {
  role?: 'administrador' | 'super-admin';
  workspaceId?: string | null;
};

// Contenido principal del Dashboard
function MainDashboard() {
  const { dictionary } = useI18n();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight font-headline">
        {dictionary.pages.dashboard.title}
      </h1>
      <p className="text-muted-foreground">
        {dictionary.pages.dashboard.description}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan');

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } =
    useDoc<UserProfile>(userDocRef);

  const workspaceId = currentUserProfile?.workspaceId;
  const collectionPrefix = useMemo(
    () => (workspaceId ? `workspaces/${workspaceId}` : null),
    [workspaceId]
  );

  // --- Onboarding & Financial Data Queries ---
  const suppliersQuery = useMemoFirebase(
    () =>
      collectionPrefix
        ? query(collection(firestore, `${collectionPrefix}/suppliers`), limit(1))
        : null,
    [collectionPrefix, firestore]
  );
  const categoriesQuery = useMemoFirebase(
    () =>
      collectionPrefix
        ? collection(firestore, `${collectionPrefix}/categories`)
        : null,
    [collectionPrefix, firestore]
  );
  const depositsQuery = useMemoFirebase(
    () =>
      collectionPrefix
        ? query(collection(firestore, `${collectionPrefix}/deposits`), limit(1))
        : null,
    [collectionPrefix, firestore]
  );
  const productsQuery = useMemoFirebase(
    () =>
      collectionPrefix
        ? collection(firestore, `${collectionPrefix}/products`)
        : null,
    [collectionPrefix, firestore]
  );
  const inventoryQuery = useMemoFirebase(
    () =>
      collectionPrefix
        ? collection(firestore, `${collectionPrefix}/inventory`)
        : null,
    [collectionPrefix, firestore]
  );
  const movementsQuery = useMemoFirebase(
    () =>
      collectionPrefix
        ? query(collection(firestore, `${collectionPrefix}/stockMovements`), limit(1))
        : null,
    [collectionPrefix, firestore]
  );


  const { data: suppliers, isLoading: isLoadingSuppliers } =
    useCollection<Supplier>(suppliersQuery);
  const { data: categories, isLoading: isLoadingCategories } =
    useCollection<Category>(categoriesQuery);
  const { data: deposits, isLoading: isLoadingDeposits } =
    useCollection<Deposit>(depositsQuery);
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsQuery);
  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryQuery);
  const { data: movements, isLoading: isLoadingMovements } =
    useCollection<StockMovement>(movementsQuery);

  const isLoading =
    isUserLoading ||
    isLoadingProfile ||
    isLoadingSuppliers ||
    isLoadingCategories ||
    isLoadingDeposits ||
    isLoadingProducts ||
    isLoadingInventory ||
    isLoadingMovements;

  const needsToCreateWorkspace = useMemo(() => {
    if (!isLoadingProfile && currentUserProfile) {
      return (
        currentUserProfile.role === 'administrador' &&
        !currentUserProfile.workspaceId
      );
    }
    return false;
  }, [isLoadingProfile, currentUserProfile]);

  const checklistSteps = useMemo(
    () => [
      {
        id: 'suppliers',
        title: 'Crea tu primer Proveedor',
        description:
          'Registra las empresas o personas que te abastecen de productos.',
        isCompleted: (suppliers?.length ?? 0) > 0,
        href: '/proveedores',
        ctaText: 'Ir a Proveedores',
      },
      {
        id: 'categories',
        title: 'Define una Categoría',
        description: 'Agrupa tus productos para mantener tu inventario organizado.',
        isCompleted: (categories?.length ?? 0) > 0,
        href: '/categorias',
        ctaText: 'Ir a Categorías',
      },
      {
        id: 'deposits',
        title: 'Configura un Depósito',
        description: 'Crea los lugares físicos donde guardas tu mercadería.',
        isCompleted: (deposits?.length ?? 0) > 0,
        href: '/depositos',
        ctaText: 'Ir a Depósitos',
      },
      {
        id: 'products',
        title: 'Da de alta tu primer Producto',
        description:
          'Con todo lo anterior configurado, ya puedes crear un producto.',
        isCompleted: (products?.length ?? 0) > 0,
        href: '/productos',
        ctaText: 'Ir a Productos',
      },
       {
        id: 'movements',
        title: 'Registra tu primer Movimiento de Stock',
        description: 'Haz una entrada de stock para tus nuevos productos para empezar a operar.',
        isCompleted: (movements?.length ?? 0) > 0,
        href: '/movimientos',
        ctaText: 'Ir a Movimientos',
      },
    ],
    [suppliers, categories, deposits, products, movements]
  );

  const allStepsCompleted = checklistSteps.every((step) => step.isCompleted);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  // Si el usuario es un administrador sin workspace, se le fuerza a crear uno.
  if (needsToCreateWorkspace) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <CreateWorkspaceForm />
      </div>
    );
  }

  // Si es un super-admin, no necesita el onboarding checklist.
  if (currentUserProfile?.role === 'super-admin') {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <MainDashboard />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <MainDashboard />
      {allStepsCompleted ? (
        <FinancialDashboard
          products={products || []}
          inventory={inventory || []}
          categories={categories || []}
        />
      ) : (
        <OnboardingChecklist steps={checklistSteps} />
      )}
    </div>
  );
}
