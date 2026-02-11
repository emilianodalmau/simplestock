'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function LanguageSwitcher({ lang }: { lang: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (newLocale: string) => {
    if (!pathname) return;
    const newPath = pathname.replace(`/${lang}`, `/${newLocale}`);
    router.push(newPath);
    router.refresh(); // Refresh to ensure server components get new dictionary
  };

  return (
    <Select value={lang} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-auto h-8 border-none bg-transparent shadow-none focus:ring-0">
        <SelectValue placeholder="Idioma" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="es">ES</SelectItem>
        <SelectItem value="en">EN</SelectItem>
        <SelectItem value="pt">PT</SelectItem>
      </SelectContent>
    </Select>
  );
}
