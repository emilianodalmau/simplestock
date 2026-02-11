import type { ReactNode } from 'react';
import './globals.css';

// This is the true root layout.
// It provides the basic HTML structure for the entire app.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The `lang` attribute will be handled by the [lang] layout for pages inside it.
    // For pages outside, it will default to a value. 'es' is a safe default.
    <html lang="es" suppressHydrationWarning>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
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
            {children}
        </body>
    </html>
  );
}
