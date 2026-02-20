'use client';

import { useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/i18n-provider';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const { dictionary, lang } = useI18n();

  useEffect(() => {
    if (!isUserLoading && auth && user) {
      signOut(auth).then(() => {
        router.push(`/${lang}/login`);
      });
    }
  }, [user, isUserLoading, auth, router, lang]);

  if (isUserLoading || user) {
    return (
      <div className="container mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p>Cerrando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] p-4">
      <div className="w-full max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="flex justify-center">
              <Image 
                src="/imagen_inicio2.png" 
                alt="Logo de la aplicación"
                width={400}
                height={400}
                className="rounded-lg object-cover"
              />
            </div>
            <div className="flex flex-col items-center md:items-start text-center md:text-left gap-4">
              <h1 className="text-4xl font-bold font-headline">
                {dictionary.home.welcome}
              </h1>
              <p className="text-muted-foreground">
                {dictionary.home.description}
              </p>
              <div className="flex flex-wrap gap-4">
                <Button asChild>
                  <Link href={`/${lang}/login`}>{dictionary.home.login}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/${lang}/signup`}>{dictionary.home.signup}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/${lang}/precios`}>{dictionary.home.prices}</Link>
                </Button>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
