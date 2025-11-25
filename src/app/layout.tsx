'use client';

import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider, useAuth } from '@/firebase';
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
  Building,
  Archive,
  Tags,
  Truck,
  Building2,
  LogOut,
  Replace,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { type AppSettings, getSettings } from '@/lib/settings';
import { useEffect, useState } from 'react';
import Image from 'next/image';

function AppLayout({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings: AppSettings | null;
}) {
  const pathname = usePathname();
  const auth = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/login');
    }
  };

  const menuItems = [
    { href: '/dashboard', label: 'Panel de Control', icon: Home },
    { href: '/inventario', label: 'Inventario', icon: Warehouse },
    { href: '/movimientos', label: 'Movimientos', icon: Replace },
    { href: '/productos', label: 'Productos', icon: Box },
    { href: '/categorias', label: 'Categorías', icon: Tags },
    { href: '/proveedores', label: 'Proveedores', icon: Truck },
    { href: '/clientes', label: 'Clientes', icon: Building },
    { href: '/depositos', label: 'Depósitos', icon: Archive },
    { href: '/usuarios', label: 'Usuarios', icon: Users },
    { href: '/configuracion', label: 'Configuración', icon: Settings },
  ];

  const hideSidebar = ['/login', '/signup', '/'].includes(pathname);

  if (hideSidebar) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              {settings?.logoUrl ? (
                <Image
                  src={settings.logoUrl}
                  alt="Logo"
                  width={24}
                  height={24}
                  className="rounded-sm"
                />
              ) : (
                <Building2 />
              )}
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">
                {settings?.appName || 'Inventario'}
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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      const fetchedSettings = await getSettings();
      setSettings(fetchedSettings);
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
      <AppLayout settings={settings}>{children}</AppLayout>
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