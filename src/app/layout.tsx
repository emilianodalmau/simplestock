import type { ReactNode } from 'react';

// This is the true root layout.
// It must be minimal as per Next.js i18n docs.
export default function RootLayout({ children }: { children: ReactNode }) {
  // The actual <html> and <body> tags are now in [lang]/layout.tsx
  return children;
}
