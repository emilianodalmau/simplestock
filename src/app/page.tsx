'use client';

// This component is a temporary stub that redirects to the default locale.
// It can be removed once all pages are moved to the [lang] directory.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { i18n } from '@/i18n/config';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // The middleware should handle this, but this is a fallback.
    router.replace(`/${i18n.defaultLocale}`);
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
    </div>
  );
}
