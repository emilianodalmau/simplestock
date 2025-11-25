'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
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
  FileText,
  Warehouse,
  Box,
  ArrowRightLeft,
  Users,
  Building,
  Archive,
  Tags,
  Truck,
  BookCheck,
  Building2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const menuItems = [
    { href: '/dashboard', label: 'Panel de Control', icon: Home },
    { href: '/solicitudes', label: 'Solicitudes', icon: FileText },
    { href: '/inventario', label: 'Inventario', icon: Warehouse },
    { href: '/productos', label: 'Productos', icon: Box },
    { href: '/movimientos', label: 'Movimientos', icon: ArrowRightLeft },
    { href: '/usuarios', label: 'Usuarios', icon: Users },
    { href: '/areas-municipales', label: 'Áreas Municipales', icon: Building },
    { href: '/depositos', label: 'Depósitos', icon: Archive },
    { href: '/categorias', label: 'Categorías', icon: Tags },
    { href: '/proveedores', label: 'Proveedores', icon: Truck },
    { href: '/auditoria', label: 'Auditoría', icon: BookCheck },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Inventario</span>
              <span className="text-sm text-sidebar-foreground/80">
                Municipal
              </span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.label}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    icon={<item.icon />}
                  >
                    {item.label}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
          <SidebarTrigger className="md:hidden" />
          <div className="w-full flex-1">{/* Add Header Content Here */}</div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
