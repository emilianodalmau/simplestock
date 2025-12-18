import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="container grid min-h-[calc(100vh-3.5rem)] grid-cols-1 items-center justify-center py-12 md:grid-cols-2 md:gap-8">
      <div className="flex justify-center">
        <AuthCard
          title="Bienvenido de Nuevo"
          description="Ingresa tus credenciales para acceder a tu cuenta."
        >
          <LoginForm />
        </AuthCard>
      </div>
      <div className="hidden items-center justify-start md:flex">
        <Image
          src="/estante.png"
          alt="Ilustración de inicio de sesión"
          width={500}
          height={500}
          className="rounded-lg object-cover"
        />
      </div>
    </div>
  );
}
