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
    MessageSquare,
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

  type FeedbackTicket = {
    id: string;
    status: 'nuevo' | 'visto' | 'en-progreso' | 'resuelto' | 'cerrado';
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

    const userDocRef = useMemoFirebase(
      () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
      [firestore, user]
    );
    const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);
    
    const workspaceDocRef = useMemoFirebase(
      () => (firestore && currentUserProfile?.workspaceId ? doc(firestore, 'workspaces', currentUserProfile.workspaceId) : null),
      [firestore, currentUserProfile?.workspaceId]
    );
    const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

    const userRole = currentUserProfile?.role;
    const isJefeDeposito = userRole === 'jefe_deposito';
    const isAdmin = userRole === 'administrador';
    const isSuperAdmin = userRole === 'super-admin';
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
        
        if (isJefeDeposito) {
            if (assignedDepositIds === null) return null; 
            if (assignedDepositIds.length === 0) return null; 
            return query(
                movementsCollectionRef,
                where('status', '==', 'pendiente'),
                where('depositId', 'in', assignedDepositIds.slice(0, 30))
            );
        }
        
        // This is a much more efficient query for the layout badge.
        // It avoids complex orderBy clauses that require indexes.
        if (isAdmin) {
            return query(movementsCollectionRef, where('status', '==', 'pendiente'));
        }
        
        return null;
    }, [firestore, collectionPrefix, isAdmin, isJefeDeposito, assignedDepositIds]);

    const { data: pendingRequests } = useCollection(pendingRequestsQuery);

    const feedbackTicketsQuery = useMemoFirebase(() => {
        if (!firestore || !isSuperAdmin) return null;
        return query(collection(firestore, 'feedback'), where('status', 'in', ['nuevo', 'visto', 'en-progreso']));
    }, [firestore, isSuperAdmin]);

    const { data: feedbackTickets, isLoading: isLoadingFeedback } = useCollection<FeedbackTicket>(feedbackTicketsQuery);

    const statsDocRef = useMemoFirebase(
      () => (firestore && collectionPrefix ? doc(firestore, `${collectionPrefix}/metadata`, 'stats') : null),
      [firestore, collectionPrefix]
    );
    const { data: workspaceStats } = useDoc<any>(statsDocRef);

    const pendingCount = useMemo(() => {
        if (isAdmin) return workspaceStats?.pendingRequestsCount ?? 0;
        if (isJefeDeposito) return pendingRequests?.length ?? 0;
        return 0;
    }, [isAdmin, isJefeDeposito, workspaceStats, pendingRequests]);

    const stockAlertCounts = useMemo(() => {
        return {
            lowStock: workspaceStats?.lowStockCount ?? 0,
            outOfStock: workspaceStats?.outOfStockCount ?? 0
        };
    }, [workspaceStats]);
    
    const feedbackAlertCounts = useMemo(() => {
        if (!feedbackTickets) return { newCount: 0, inProgressCount: 0 };

        let newCount = 0;
        let inProgressCount = 0;

        for (const ticket of feedbackTickets) {
            if (ticket.status === 'nuevo') {
                newCount++;
            } else if (ticket.status === 'visto' || ticket.status === 'en-progreso') {
                inProgressCount++;
            }
        }
        return { newCount, inProgressCount };
    }, [feedbackTickets]);
    
    useEffect(() => {
        if (isUserLoading || isLoadingProfile || isLoadingWorkspace) return;
        
        if (workspaceData?.language && workspaceData.language !== lang) {
            const currentPathWithoutLang = pathname.substring(3);
            const newPath = `/${workspaceData.language}${currentPathWithoutLang}`;
            router.replace(newPath);
        }
    }, [workspaceData, lang, pathname, isUserLoading, isLoadingProfile, isLoadingWorkspace, router]);


    const isLoading = isUserLoading || isLoadingProfile || (isSuperAdmin ? isLoadingFeedback : isLoadingWorkspace) || (isJefeDeposito && isLoadingDeposits);
    
    const handleLogout = async () => {
      if (auth) {
        await signOut(auth);
        router.push(`/${lang}/login`);
      }
    };
    
    const getMenuItems = (dict: any) => [
      { href: '/super-admin', label: dict.sidebar.superAdmin, icon: Shield, roles: ['super-admin'] },
      { href: '/super-admin/feedback', label: 'Feedback', icon: MessageSquare, roles: ['super-admin'] },
      { href: '/workspaces', label: dict.sidebar.workspaces, icon: Building2, roles: ['super-admin'] },
      { href: '/dashboard', label: dict.sidebar.dashboard, icon: Home, roles: ['administrador'] },
      { href: '/pedidos', label: dict.sidebar.orders, icon: FileCheck, roles: ['administrador', 'jefe_deposito'] },
      { href: '/presupuestos', label: dict.sidebar.quotes, icon: FileText, roles: ['administrador', 'editor', 'visualizador', 'vendedor'] },
      { href: '/movimientos', label: dict.sidebar.movements, icon: Replace, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito', 'solicitante'] },
      { href: '/inventario', label: dict.sidebar.inventory, icon: Warehouse, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito', 'vendedor'] },
      { href: '/ajustes', label: dict.sidebar.adjustments, icon: Calculator, roles: ['administrador', 'jefe_deposito'] },
      { href: '/vencimientos', label: dict.sidebar.expirations, icon: AlertTriangle, roles: ['administrador', 'editor', 'jefe_deposito'] },
      { href: '/solicitudes', label: dict.sidebar.requests, icon: ClipboardList, roles: ['solicitante', 'jefe_deposito'] },
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

    const hideSidebar = !pathname.startsWith(`/${lang}/`) || [`/${lang}/login`, `/${lang}/signup`, `/${lang}`, `/${lang}/precios`].includes(pathname);
    
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
                   {item.href === '/pedidos' && pendingCount > 0 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white group-data-[collapsible=icon]:hidden">
                          {pendingCount > 99 ? '99+' : pendingCount}
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
                  {item.href === '/super-admin/feedback' && (feedbackAlertCounts.newCount > 0 || feedbackAlertCounts.inProgressCount > 0) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                        {feedbackAlertCounts.newCount > 0 && (
                           <div className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                               {feedbackAlertCounts.newCount > 99 ? '99+' : feedbackAlertCounts.newCount}
                           </div>
                        )}
                        {feedbackAlertCounts.inProgressCount > 0 && (
                           <div className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-yellow-500 px-1 text-[9px] font-bold text-black">
                               {feedbackAlertCounts.inProgressCount > 99 ? '99+' : feedbackAlertCounts.inProgressCount}
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
