import '../globals.css';
import { getSettings } from '@/lib/settings';
import { RootLayoutContent } from '@/components/layout/root-layout-content';
import { getDictionary } from '@/i18n/get-dictionary';
import { i18n, type Locale } from '@/i18n/config';

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export default async function LangLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: { lang: Locale };
}>) {
  const globalSettings = await getSettings();
  const dictionary = await getDictionary(params.lang);

  // This layout no longer renders <html> or <body>.
  // It's responsible for fetching locale-specific data and rendering the UI shell.
  return (
    <RootLayoutContent 
        globalSettings={globalSettings} 
        dictionary={dictionary} 
        lang={params.lang}
    >
      {children}
    </RootLayoutContent>
  );
}
