
'use client';

  import {
    useUser,
    useFirestore,
    useDoc,
    useMemoFirebase,
    useAuth,
    useCollection,
    FirebaseClientProvider,
  } from '@/firebase';
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
  } from '@/components/ui/sidebar';
  import {
    Home,
    Warehouse,
    Box,
    Users,
    Archive,
    Tags,
    Truck,
    Building2,
    LogOut,
    Replace,
    Settings,
    ClipboardList,
    Shield,
    FileCode,
    FileCheck,
    Calculator,
    CreditCard,
    Loader2,
    HelpCircle,
    Briefcase,
    FileText,
    MapPin,
    AlertTriangle,
  } from 'lucide-react';
  import Link from 'next/link';
  import { usePathname, useRouter } from 'next/navigation';
  import { signOut } from 'firebase/auth';
  import type { AppSettings } from '@/types/settings';
  import { useEffect, useMemo } from 'react';
  import Image from 'next/image';
  import { collection, doc, endAt, orderBy, query, startAt, where } from 'firebase/firestore'; 
  import { Badge } from '@/components/ui/badge';
  import type { Locale } from '@/i18n/config';
  import { I18nProvider, useI18n } from '@/i18n/i18n-provider';
  import { Toaster } from '../ui/toaster';
  import { Header } from './header';
  import { UserNav } from './user-nav';

  type UserProfile = {
    role?: 'super-admin' | 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'solicitante' | 'vendedor';
    workspaceId?: string | null;
  };

  type Workspace = {
      name?: string;
      appName?: string;
      logoUrl?: string;
      language?: 'es' | 'en' | 'pt';
  }
  
  type Deposit = {
    id: string;
    jefeId?: string;
  };

  type ProductForStockAlert = {
    id: string;
    minStock: number;
    productType?: 'SIMPLE' | 'COMBO';
  };

  type InventoryForStockAlert = {
    productId: string;
    quantity: number;
  };

  function AppLayout({
    children,
    globalSettings,
  }: {
    children: React.ReactNode;
    globalSettings: AppSettings | null;
  }) {
    const pathname = usePathname();
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const auth = useAuth();
    const router = useRouter();
    const { dictionary, lang } = useI18n();

    useEffect(() => {
      const performLogout = async () => {
        if (auth && auth.currentUser) {
          await signOut(auth);
          router.push(`/${lang}/login`);
        }
      };
      performLogout();
    }, []); // Empty dependency array ensures this runs only once when the component mounts.

    // 1. Cargar Perfil de Usuario
    const userDocRef = useMemoFirebase(
      () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
      [firestore, user]
    );
    const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);
    
    // 2. Cargar datos del Workspace si existen
    const workspaceDocRef = useMemoFirebase(
      () => (firestore && currentUserProfile?.workspaceId ? doc(firestore, 'workspaces', currentUserProfile.workspaceId) : null),
      [firestore, currentUserProfile?.workspaceId]
    );
    const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

    // --- Lógica para el badge de notificaciones de pedidos ---
    const userRole = currentUserProfile?.role;
    const isJefeDeposito = userRole === 'jefe_deposito';
    const isAdmin = userRole === 'administrador';
    const workspaceId = currentUserProfile?.workspaceId;
    const collectionPrefix = useMemo(() => (workspaceId ? `workspaces/${workspaceId}` : null), [workspaceId]);

    const depositsQueryForJefe = useMemoFirebase(() => {
        if (!firestore || !collectionPrefix || !isJefeDeposito || !user) return null;
        return query(collection(firestore, `${collectionPrefix}/deposits`), where('jefeId', '==', user.uid));
    }, [firestore, collectionPrefix, isJefeDeposito, user]);

    const { data: assignedDeposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsQueryForJefe);

    const assignedDepositIds = useMemo(() => {
        if (!isJefeDeposito || !assignedDeposits) return null;
        if (assignedDeposits.length === 0) return [];
        return assignedDeposits.map(d => d.id);
    }, [isJefeDeposito, assignedDeposits]);

    const pendingRequestsQuery = useMemoFirebase(() => {
        if (!firestore || !collectionPrefix) return null;
        if (!isAdmin && !isJefeDeposito) return null;

        const movementsCollectionRef = collection(firestore, `${collectionPrefix}/stockMovements`);
        
        const baseQuery = [
          orderBy('remitoNumber'),
          startAt('S-'),
          endAt('S-uf8ff')
        ];

        if (isJefeDeposito) {
            if (assignedDepositIds === null) return null; 
            if (assignedDepositIds.length === 0) return null; 
            return query(
                movementsCollectionRef,
                where('depositId', 'in', assignedDepositIds.slice(0, 30)),
                ...baseQuery
            );
        }
        
        if (isAdmin) {
            return query(movementsCollectionRef, ...baseQuery);
        }
        
        return null;
    }, [firestore, collectionPrefix, isAdmin, isJefeDeposito, assignedDepositIds]);

    const { data: pendingRequests } = useCollection(pendingRequestsQuery);
    const pendingRequestsCount = pendingRequests?.length ?? 0;
    // --- Fin de la lógica del badge ---


    // --- Lógica para el badge de alerta de inventario ---
    const productsQuery = useMemoFirebase(() =>
        collectionPrefix ? query(collection(firestore, `${collectionPrefix}/products`), where('isArchived', '!=', true)) : null,
    [collectionPrefix, firestore]
    );
    const { data: allProducts, isLoading: isLoadingProductsForAlert } = useCollection<ProductForStockAlert>(productsQuery);

    const inventoryQuery = useMemoFirebase(() =>
        collectionPrefix ? collection(firestore, `${collectionPrefix}/inventory`) : null,
    [collectionPrefix, firestore]
    );
    const { data: allInventory, isLoading: isLoadingInventoryForAlert } = useCollection<InventoryForStockAlert>(inventoryQuery);

    const stockAlertCounts = useMemo(() => {
        if (!allProducts || !allInventory) return { lowStock: 0, outOfStock: 0 };

        const stockMap = new Map<string, number>();
        for (const stockItem of allInventory) {
            stockMap.set(stockItem.productId, (stockMap.get(stockItem.productId) || 0) + stockItem.quantity);
        }

        let lowStock = 0;
        let outOfStock = 0;
        for (const product of allProducts) {
            // Stock alerts don't apply to combos
            if (product.productType === 'COMBO') continue;

            const totalStock = stockMap.get(product.id) || 0;
            if (totalStock === 0) {
                outOfStock++;
            } else if (totalStock > 0 && totalStock <= product.minStock) {
                lowStock++;
            }
        }
        return { lowStock, outOfStock };
    }, [allProducts, allInventory]);
    // --- Fin de la lógica del badge de inventario ---

    // Redirect to workspace language if it differs from URL
    useEffect(() => {
        if (isUserLoading || isLoadingProfile || isLoadingWorkspace) return;
        
        if (workspaceData?.language && workspaceData.language !== lang) {
            const currentPathWithoutLang = pathname.substring(3);
            const newPath = `/${workspaceData.language}${currentPathWithoutLang}`;
            router.replace(newPath);
        }
    }, [workspaceData, lang, pathname, isUserLoading, isLoadingProfile, isLoadingWorkspace, router]);


    const isLoading = isUserLoading || isLoadingProfile || isLoadingWorkspace || (isJefeDeposito && isLoadingDeposits) || isLoadingProductsForAlert || isLoadingInventoryForAlert;
    
    const handleLogout = async () => {
      if (auth) {
        await signOut(auth);
        router.push(`/${lang}/login`);
      }
    };
    
    const getMenuItems = (dict: any) => [
      { href: '/super-admin', label: dict.sidebar.superAdmin, icon: Shield, roles: ['super-admin'] },
      { href: '/workspaces', label: dict.sidebar.workspaces, icon: Building2, roles: ['super-admin'] },
      { href: '/dashboard', label: dict.sidebar.dashboard, icon: Home, roles: ['administrador'] },
      { href: '/pedidos', label: dict.sidebar.orders, icon: FileCheck, roles: ['administrador', 'jefe_deposito'] },
      { href: '/presupuestos', label: dict.sidebar.quotes, icon: FileText, roles: ['administrador', 'editor', 'visualizador', 'vendedor'] },
      { href: '/movimientos', label: dict.sidebar.movements, icon: Replace, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito', 'solicitante'] },
      { href: '/inventario', label: dict.sidebar.inventory, icon: Warehouse, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito', 'vendedor'] },
      { href: '/ajustes', label: dict.sidebar.adjustments, icon: Calculator, roles: ['administrador', 'jefe_deposito'] },
      { href: '/vencimientos', label: dict.sidebar.expirations, icon: AlertTriangle, roles: ['administrador', 'editor', 'jefe_deposito'] },
      { href: '/solicitudes', label: dict.sidebar.requests, icon: ClipboardList, roles: ['solicitante'] },
      { href: '/productos', label: dict.sidebar.products, icon: Box, roles: ['administrador', 'editor', 'visualizador', 'vendedor'] },
      { href: '/categorias', label: dict.sidebar.categories, icon: Tags, roles: ['administrador', 'editor', 'visualizador', 'vendedor'] },
      { href: '/proveedores', label: dict.sidebar.suppliers, icon: Truck, roles: ['administrador', 'editor', 'visualizador', 'vendedor'] },
      { href: '/clientes', label: dict.sidebar.clients, icon: Briefcase, roles: ['administrador', 'editor', 'visualizador', 'vendedor'] },
      { href: '/depositos', label: dict.sidebar.deposits, icon: Archive, roles: ['administrador', 'editor', 'visualizador', 'vendedor'] },
      { href: '/ubicaciones', label: dict.sidebar.locations, icon: MapPin, roles: ['administrador', 'editor', 'jefe_deposito'] },
      { href: '/usuarios', label: dict.sidebar.users, icon: Users, roles: ['administrador', 'super-admin'] },
      { href: '/suscripcion', label: dict.sidebar.subscription, icon: CreditCard, roles: ['administrador']},
      { href: '/configuracion', label: dict.sidebar.settings, icon: Settings, roles: ['administrador', 'super-admin'] },
    ];

    const menuItems = useMemo(() => {
      if (!currentUserProfile?.role || !dictionary) return [];
      const userRole = currentUserProfile.role;
      const allMenuItems = getMenuItems(dictionary);
      return allMenuItems.filter(item => item.roles.includes(userRole));
    }, [currentUserProfile?.role, dictionary]);

    const hideSidebar = !pathname.startsWith(`/${lang}/`) || [`/${lang}/login`, `/${lang}/signup`, `/${lang}`].includes(pathname) || pathname === `/${lang}/precios` || pathname === `/${lang}/faq`;
    
    if (isLoading) {
      return (
          <div className="flex h-screen items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin" />
          </div>
      );
    }

    if (hideSidebar || !user) {
      return (
        <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
        </div>
      );
    }
    
    const displayAppName = workspaceData?.name || workspaceData?.appName || globalSettings?.appName || 'Inventario';
    const logoUrl = workspaceData?.logoUrl || globalSettings?.logoUrl;
    const globalAppName = globalSettings?.appName || 'SIMPLESTOCK';


    return (
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2">
              {logoUrl && (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg">
                  <Image
                    src={logoUrl}
                    alt="Logo"
                    width={24}
                    height={24}
                    className="rounded-sm"
                  />
                </div>
              )}
              <div className="flex flex-col">
                <span className="font-semibold">
                  {displayAppName}
                </span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(`/${lang}${item.href}`)}
                  >
                    <Link href={`/${lang}${item.href}`}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                   {item.href === '/pedidos' && pendingRequestsCount > 0 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white group-data-[collapsible=icon]:hidden">
                          {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
                      </div>
                  )}
                   {item.href === '/inventario' && (stockAlertCounts.lowStock > 0 || stockAlertCounts.outOfStock > 0) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                        {stockAlertCounts.lowStock > 0 && (
                           <div className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-yellow-500 px-1 text-[9px] font-bold text-black">
                               {stockAlertCounts.lowStock > 99 ? '99+' : stockAlertCounts.lowStock}
                           </div>
                        )}
                        {stockAlertCounts.outOfStock > 0 && (
                           <div className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                               {stockAlertCounts.outOfStock > 99 ? '99+' : stockAlertCounts.outOfStock}
                           </div>
                        )}
                      </div>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(`/${lang}/faq`)}>
                      <Link href={`/${lang}/faq`}>
                          <HelpCircle />
                          <span>{dictionary.sidebar.help}</span>
                      </Link>
                  </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout}>
                  <LogOut />
                  <span>{dictionary.sidebar.logout}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <FileCode />
                  <span>{globalAppName}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger className="md:hidden" />
            <div className="w-full flex-1">
            </div>
             <UserNav />
          </header>
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  export function RootLayoutContent({ 
    children, 
    globalSettings,
    dictionary,
    lang,
  }: { 
    children: React.ReactNode, 
    globalSettings: AppSettings | null,
    dictionary: any,
    lang: Locale,
  }) {
    return (
      <FirebaseClientProvider>
        <I18nProvider dictionary={dictionary} lang={lang}>
          <AppLayout globalSettings={globalSettings}>{children}</AppLayout>
          <Toaster />
        </I18nProvider>
      </FirebaseClientProvider>
    );
  }
