
'use client';

import './globals.css';
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
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { type AppSettings, getSettings } from '@/lib/settings';
import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

type UserProfile = {
  role?: 'super-admin' | 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito';
  workspaceId?: string;
};

type Workspace = {
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
  
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && currentUserProfile?.workspaceId ? doc(firestore, 'workspaces', currentUserProfile.workspaceId) : null),
    [firestore, currentUserProfile]
  );
  const { data: workspaceData } = useDoc<Workspace>(workspaceDocRef);

  // --- Workspace Redirection Logic ---
  useEffect(() => {
    if (!isLoadingProfile && user) {
        if (
            currentUserProfile?.role === 'administrador' &&
            !currentUserProfile.workspaceId &&
            pathname !== '/crear-workspace'
        ) {
            router.replace('/crear-workspace');
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
    { href: '/solicitudes', label: 'Solicitudes', icon: ClipboardList, roles: ['administrador', 'editor', 'visualizador', 'jefe_deposito'] },
    { href: '/productos', label: 'Productos', icon: Box, roles: ['administrador', 'editor', 'visualizador'] },
    { href: '/categorias', label: 'Categorías', icon: Tags, roles: ['administrador', 'editor', 'visualizador'] },
    { href: '/proveedores', label: 'Proveedores', icon: Truck, roles: ['administrador', 'editor', 'visualizador'] },
    { href: '/clientes', label: 'Clientes', icon: Users, roles: ['administrador', 'editor', 'visualizador'] },
    { href: '/depositos', label: 'Depósitos', icon: Archive, roles: ['administrador', 'editor', 'visualizador'] },
    { href: '/usuarios', label: 'Usuarios', icon: Users, roles: ['administrador', 'super-admin'] },
    { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['administrador', 'super-admin'] },
  ];
  
  const menuItems = useMemo(() => {
    if (!currentUserProfile?.role) return [];
    return allMenuItems.filter(item => item.roles.includes(currentUserProfile.role!));
  }, [currentUserProfile]);


  const hideSidebar = ['/login', '/signup', '/', '/crear-workspace'].includes(pathname);

  if (isUserLoading || isLoadingProfile) {
    return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin" />
        </div>
    );
  }
  
  // If user is being redirected, show a loading state
  if (currentUserProfile?.role === 'administrador' && !currentUserProfile.workspaceId && pathname !== '/crear-workspace') {
     return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin" />
            <p className="ml-4">Redirigiendo a la creación de workspace...</p>
        </div>
    );
  }


  if (hideSidebar) {
    return <main className="flex-1">{children}</main>;
  }
  
  const appName = workspaceData?.appName || globalSettings?.appName || 'Inventario';
  const logoUrl = workspaceData?.logoUrl || globalSettings?.logoUrl;


  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            {logoUrl && (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
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
                {appName}
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

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      const fetchedSettings = await getSettings();
      setGlobalSettings(fetchedSettings);
      setIsLoading(false);
    }
    loadSettings();
  }, []);

  if (isLoading) {
    // You can return a loading spinner here if you want
    return null; 
  }
  
  return (
    <FirebaseClientProvider>
      <AppLayout globalSettings={globalSettings}>{children}</AppLayout>
      <Toaster />
    </FirebaseClientProvider>
  );
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background font-body antialiased">
         <RootLayoutContent>{children}</RootLayoutContent>
      </body>
    </html>
  );
}
