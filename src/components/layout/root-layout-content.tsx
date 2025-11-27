
'use client';

import { Toaster } from '@/components/ui/toaster';
import {
  FirebaseClientProvider,
  useUser,
  useFirestore,
  useDoc,
  useMemoFirebase,
  useAuth,
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
  History,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import type { AppSettings } from '@/types/settings';
import { useEffect, useMemo } from 'react';
import Image from 'next/image';
import { doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

type UserProfile = {
  role?: 'super-admin' | 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'solicitante';
  workspaceId?: string | null; // Allow null
};

type Workspace = {
    name?: string;
    appName?: string;
    logoUrl?: string;
}

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

  const userDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);
  
  // Conditionally fetch workspace data only if workspaceId exists
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && currentUserProfile?.workspaceId ? doc(firestore, 'workspaces', currentUserProfile.workspaceId) : null),
    [firestore, currentUserProfile?.workspaceId]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

  // --- Workspace Redirection Logic ---
  useEffect(() => {
    // Wait until we have a definitive user profile
    if (!isLoadingProfile && user && currentUserProfile) {
      // If user is an admin without a workspace, force them to the dashboard
      // The dashboard itself will handle rendering the creation form.
      if (
        currentUserProfile.role === 'administrador' &&
        !currentUserProfile.workspaceId &&
        pathname !== '/dashboard'
      ) {
        router.replace('/dashboard');
      }
    }
  }, [isLoadingProfile, user, currentUserProfile, pathname, router]);


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
    { href: '/inventario', label: 'Inventario', icon: Warehouse, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito'] },
    { href: '/movimientos', label: 'Movimientos', icon: Replace, roles: ['administrador', 'editor', 'jefe_deposito'] },
    { href: '/solicitudes', label: 'Crear Solicitud', icon: ClipboardList, roles: ['administrador', 'editor', 'solicitante'] },
    { href: '/mis-movimientos', label: 'Mis Movimientos', icon: History, roles: ['solicitante', 'jefe_deposito'] },
    { href: '/productos', label: 'Productos', icon: Box, roles: ['administrador', 'editor', 'visualizador'] },
    { href: '/categorias', label: 'Categorías', icon: Tags, roles: ['administrador', 'editor', 'visualizador'] },
    { href: '/proveedores', label: 'Proveedores', icon: Truck, roles: ['administrador', 'editor', 'visualizador'] },
    { href: '/depositos', label: 'Depósitos', icon: Archive, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito'] },
    { href: '/usuarios', label: 'Usuarios', icon: Users, roles: ['administrador', 'super-admin'] },
    { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['administrador', 'super-admin'] },
  ];
  
  const menuItems = useMemo(() => {
    if (!currentUserProfile?.role) return [];
    return allMenuItems.filter(item => item.roles.includes(currentUserProfile.role!));
  }, [currentUserProfile?.role]);

  const isLoading = isUserLoading || isLoadingProfile;
  const hideSidebar = ['/login', '/signup', '/'].includes(pathname);
  
  // This flag determines if we are in a state where a redirection is expected to happen.
  const isPendingRedirect = !isLoadingProfile && user && currentUserProfile?.role === 'administrador' && !currentUserProfile.workspaceId && pathname !== '/dashboard';

  if (isLoading || isPendingRedirect) {
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
                <Link href={item.href} passHref>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    icon={<item.icon />}
                  >
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} icon={<LogOut />}>
                <span>Cerrar Sesión</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton disabled icon={<FileCode />}>
                <span>{globalAppName}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
          <SidebarTrigger className="md:hidden" />
          <div className="w-full flex-1">{/* Add Header Content Here */}</div>
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
