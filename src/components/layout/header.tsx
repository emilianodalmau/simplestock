"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserNav } from "./user-nav";
import { useUser } from "@/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n-provider";

export function Header() {
  const { user, isUserLoading } = useUser();
  // useI18n can fail here on public pages if not wrapped. We'll handle it gracefully.
  let lang = 'es';
  try {
    const i18n = useI18n();
    lang = i18n.lang;
  } catch (e) {
    // We are on a public page without the provider, default to 'es'
  }


  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex">
          <Link href={`/${lang}`} className="mr-6 flex items-center space-x-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 text-primary"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="font-bold sm:inline-block">
              SIMPLESTOCK
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          {isUserLoading ? (
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          ) : user ? (
            <UserNav />
          ) : (
            <div className="flex items-center space-x-2">
              <Button asChild variant="ghost">
                <Link href={`/${lang}/login`}>Iniciar Sesión</Link>
              </Button>
              <Button asChild>
                <Link href={`/${lang}/signup`}>Registrarse</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
