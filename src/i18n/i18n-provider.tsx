'use client';

import { createContext, useContext, ReactNode } from 'react';
import type { Locale } from './config';

interface I18nContextType {
  dictionary: any;
  lang: Locale;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ 
  children, 
  dictionary,
  lang,
}: { 
  children: ReactNode;
  dictionary: any;
  lang: Locale;
}) {
  return (
    <I18nContext.Provider value={{ dictionary, lang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
