'use server';

import { redirect } from 'next/navigation';
import { i18n } from '@/i18n/config';

export default function RootPage() {
  // This is now a Server Component that performs a clean, server-side redirect.
  // This is the correct way to handle this and fixes the Internal Server Error.
  redirect(`/${i18n.defaultLocale}`);
}
