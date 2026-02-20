'use server';

import { redirect } from 'next/navigation';
import { i18n } from '@/i18n/config';

export default async function RootPage() {
  redirect(`/${i18n.defaultLocale}`);
}
