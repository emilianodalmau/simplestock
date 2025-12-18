
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-12">
      <div className="flex flex-col items-center gap-8 md:flex-row">
        <div className="order-last md:order-first">
            <AuthCard
              title="Bienvenido de Nuevo"
              description="Ingresa tus credenciales para acceder a tu cuenta."
            >
              <LoginForm />
            </AuthCard>
        </div>
        <div>
          <Image
            src="/estante.png"
            alt="Ilustración de inicio de sesión"
            width={400}
            height={400}
            className="rounded-lg object-cover"
          />
        </div>
      </div>
    </div>
  );
}
