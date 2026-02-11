
'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useI18n } from '@/i18n/i18n-provider';

export default function SuperAdminPage() {
  const { dictionary } = useI18n();
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          {dictionary.pages['super-admin'].title}
        </h1>
        <p className="text-muted-foreground">
          {dictionary.pages['super-admin'].description}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Panel de Super-Admin</CardTitle>
          <CardDescription>
            Esta sección está reservada para la administración avanzada del sistema.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
