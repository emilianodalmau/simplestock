
import './globals.css';
import { getSettings } from '@/lib/settings';
import type { AppSettings } from '@/types/settings';
import { RootLayoutContent } from '@/components/layout/root-layout-content';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const globalSettings = await getSettings();

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Playfair+Display:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background font-body antialiased">
        <RootLayoutContent globalSettings={globalSettings}>
          {children}
        </RootLayoutContent>
      </body>
    </html>
  );
}
