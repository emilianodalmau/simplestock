
'use client';

import { Button } from '@/components/ui/button';
import { useAuth, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type UserProfile = {
  firstName?: string;
  lastName?: string;
};

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/login'); // Redirect to login page after logout
    }
  };
  
  const displayName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || user?.email);


  return (
    <div className="container mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] p-4">
      <div className="w-full max-w-4xl">
        {isUserLoading ? (
          <div className="text-center">
            <p>Cargando...</p>
          </div>
        ) : user ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p>
              Parece que has iniciado sesión como {displayName}. Si tienes
              problemas para acceder, puedes forzar el cierre de sesión aquí.
            </p>
            <Button onClick={handleLogout} variant="destructive">
              Cerrar Sesión
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="flex justify-center">
              <Image 
                src="/imagendeinicio.png" 
                alt="Logo de la aplicación"
                width={400}
                height={400}
                className="rounded-lg object-cover"
              />
            </div>
            <div className="flex flex-col items-center md:items-start text-center md:text-left gap-4">
              <h1 className="text-4xl font-bold font-headline">
                Bienvenido a SIMPLESTOCK
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
          </div>
        )}
      </div>
    </div>
  );
}
