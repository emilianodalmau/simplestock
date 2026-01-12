
'use client';

import { useMemo } from 'react';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
  useCollection,
} from '@/firebase';
import {
  doc,
  collection,
  query,
  limit
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { CreateWorkspaceForm } from '@/components/auth/create-workspace-form';
import { useSearchParams } from 'next/navigation';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';

type UserProfile = {
  role?: 'administrador' | 'super-admin';
  workspaceId?: string | null;
};

// Simplified types for checking existence
type Supplier = { id: string };
type Category = { id: string };
type Deposit = { id: string };
type Product = { id: string };


// Contenido principal del Dashboard
function MainDashboard() {
    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-bold tracking-tight font-headline">Panel de Control</h1>
            <p className="text-muted-foreground">Bienvenido a tu panel de control. Desde aquí puedes navegar a las distintas secciones de la aplicación.</p>
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
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const workspaceId = currentUserProfile?.workspaceId;
  const collectionPrefix = useMemo(() => (workspaceId ? `workspaces/${workspaceId}` : null), [workspaceId]);

  // --- Onboarding Data Queries ---
  const suppliersQuery = useMemoFirebase(() => collectionPrefix ? query(collection(firestore, `${collectionPrefix}/suppliers`), limit(1)) : null, [collectionPrefix, firestore]);
  const categoriesQuery = useMemoFirebase(() => collectionPrefix ? query(collection(firestore, `${collectionPrefix}/categories`), limit(1)) : null, [collectionPrefix, firestore]);
  const depositsQuery = useMemoFirebase(() => collectionPrefix ? query(collection(firestore, `${collectionPrefix}/deposits`), limit(1)) : null, [collectionPrefix, firestore]);
  const productsQuery = useMemoFirebase(() => collectionPrefix ? query(collection(firestore, `${collectionPrefix}/products`), limit(1)) : null, [collectionPrefix, firestore]);

  const { data: suppliers, isLoading: isLoadingSuppliers } = useCollection<Supplier>(suppliersQuery);
  const { data: categories, isLoading: isLoadingCategories } = useCollection<Category>(categoriesQuery);
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsQuery);
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(productsQuery);

  const isLoading = isUserLoading || isLoadingProfile || isLoadingSuppliers || isLoadingCategories || isLoadingDeposits || isLoadingProducts;
  
  const needsToCreateWorkspace = useMemo(() => {
    if (!isLoadingProfile && currentUserProfile) {
        return currentUserProfile.role === 'administrador' && !currentUserProfile.workspaceId;
    }
    return false;
  }, [isLoadingProfile, currentUserProfile]);

  const checklistSteps = useMemo(() => ([
    {
      id: 'suppliers',
      title: 'Crea tu primer Proveedor',
      description: 'Registra las empresas o personas que te abastecen de productos.',
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
      description: 'Con todo lo anterior configurado, ya puedes crear un producto.',
      isCompleted: (products?.length ?? 0) > 0,
      href: '/productos',
      ctaText: 'Ir a Productos',
    },
  ]), [suppliers, categories, deposits, products]);
  
  const allStepsCompleted = checklistSteps.every(step => step.isCompleted);

  if (isLoading) {
    return (
       <div className="container mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center min-h-[calc(100vh-10rem)]">
            <Loader2 className="h-12 w-12 animate-spin" />
        </div>
    )
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

  // Si pasa todas las validaciones anteriores, muestra el dashboard con el checklist.
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <MainDashboard />
      <OnboardingChecklist steps={checklistSteps} allCompleted={allStepsCompleted} />
    </div>
  );
}
