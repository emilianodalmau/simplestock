'use client';

import { Button } from '@/components/ui/button';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/'); // Redirect to home page after logout
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] text-center p-4">
      <div className="max-w-2xl">
        {isUserLoading ? (
          <p>Cargando...</p>
        ) : user ? (
          <div className="flex flex-col items-center gap-4">
            <p>
              Parece que has iniciado sesión como {user.email}. Si tienes
              problemas para acceder, puedes forzar el cierre de sesión aquí.
            </p>
            <Button onClick={handleLogout} variant="destructive">
              Cerrar Sesión
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <h1 className="text-4xl font-bold">
              Bienvenido al Gestor de Inventario
            </h1>
            <p className="text-muted-foreground">
              Por favor, inicia sesión o regístrate para continuar.
            </p>
            <div className="flex gap-4">
              <Button asChild>
                <Link href="/login">Iniciar Sesión</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/signup">Registrarse</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
