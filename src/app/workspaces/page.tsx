'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export default function WorkspacesPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Workspaces
        </h1>
        <p className="text-muted-foreground">
          Administración de workspaces.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>
            Esta sección está reservada para la administración de workspaces.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
