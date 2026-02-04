
  'use client';

  import { Toaster } from '@/components/ui/toaster';
  import {
    FirebaseClientProvider,
    useUser,
    useFirestore,
    useDoc,
    useMemoFirebase,
    useAuth,
    useCollection,
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
  } from 'lucide-react';
  import Link from 'next/link';
  import { usePathname, useRouter } from 'next/navigation';
  import { signOut } from 'firebase/auth';
  import type { AppSettings } from '@/types/settings';
  import { useEffect, useMemo } from 'react';
  import Image from 'next/image';
  import { collection, doc, endAt, orderBy, query, startAt, where } from 'firebase/firestore'; 
  import { Badge } from '@/components/ui/badge';

  type UserProfile = {
    role?: 'super-admin' | 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'solicitante';
    workspaceId?: string | null;
  };

  type Workspace = {
      name?: string;
      appName?: string;
      logoUrl?: string;
  }
  
  type Deposit = {
    id: string;
    jefeId?: string;
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
          endAt('S-\uf8ff')
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


    const isLoading = isUserLoading || isLoadingProfile || isLoadingWorkspace || (isJefeDeposito && isLoadingDeposits);
    
    const handleLogout = async () => {
      if (auth) {
        await signOut(auth);
        router.push('/login');
      }
    };

    const allMenuItems = [
      { href: '/super-admin', label: 'Admin General', icon: Shield, roles: ['super-admin'] },
      { href: '/workspaces', label: 'Workspaces', icon: Building2, roles: ['super-admin'] },
      { href: '/dashboard', label: 'Panel de Control', icon: Home, roles: ['administrador'] },
      { href: '/pedidos', label: 'Pedidos', icon: FileCheck, roles: ['administrador', 'jefe_deposito'] },
      { href: '/inventario', label: 'Inventario', icon: Warehouse, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito'] },
      { href: '/movimientos', label: 'Movimientos', icon: Replace, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito', 'solicitante'] },
      { href: '/ajustes', label: 'Ajustes', icon: Calculator, roles: ['administrador', 'jefe_deposito'] },
      { href: '/solicitudes', label: 'Solicitudes', icon: ClipboardList, roles: ['solicitante'] },
      { href: '/productos', label: 'Productos', icon: Box, roles: ['administrador', 'editor', 'visualizador'] },
      { href: '/categorias', label: 'Categorías', icon: Tags, roles: ['administrador', 'editor', 'visualizador'] },
      { href: '/proveedores', label: 'Proveedores', icon: Truck, roles: ['administrador', 'editor', 'visualizador'] },
      { href: '/depositos', label: 'Depósitos', icon: Archive, roles: ['administrador', 'editor', 'visualizador'] },
      { href: '/usuarios', label: 'Usuarios', icon: Users, roles: ['administrador', 'super-admin'] },
      { href: '/suscripcion', label: 'Suscripción', icon: CreditCard, roles: ['administrador']},
      { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['administrador', 'super-admin'] },
    ];
    
    const menuItems = useMemo(() => {
      if (!currentUserProfile?.role) return [];
      const userRole = currentUserProfile.role;
      return allMenuItems.filter(item => item.roles.includes(userRole));
    }, [currentUserProfile?.role]);

    const hideSidebar = ['/login', '/signup', '/'].includes(pathname) || pathname.startsWith('/super-admin/payment') || pathname === '/precios' || pathname === '/faq';
    
    if (isLoading) {
      return (
          <div className="flex h-screen items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin" />
          </div>
      );
    }

    if (hideSidebar || !user) {
      return <main className="flex-1">{children}</main>;
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
                    isActive={pathname.startsWith(item.href)}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                   {item.href === '/pedidos' && pendingRequestsCount > 0 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white group-data-[collapsible=icon]:hidden">
                          {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                      </div>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith('/faq')}>
                      <Link href="/faq">
                          <HelpCircle />
                          <span>Ayuda y FAQ</span>
                      </Link>
                  </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout}>
                  <LogOut />
                  <span>Cerrar Sesión</span>
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
              {/* Notificaciones globales */}
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  export function RootLayoutContent({ 
    children, 
    globalSettings 
  }: { 
    children: React.ReactNode, 
    globalSettings: AppSettings | null 
  }) {
    return (
      <FirebaseClientProvider>
        <AppLayout globalSettings={globalSettings}>{children}</AppLayout>
        <Toaster />
      </FirebaseClientProvider>
    );
  }
