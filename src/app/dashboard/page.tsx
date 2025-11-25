"use client";

import { useUser } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="flex flex-col space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {user.email}
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Your Blank Slate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed bg-muted/20">
              <p className="text-muted-foreground">
                Start creating something amazing.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
