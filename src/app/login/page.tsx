import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-12">
      <AuthCard
        title="Bienvenido de Nuevo"
        description="Ingresa tus credenciales para acceder a tu cuenta."
      >
        <LoginForm />
      </AuthCard>
    </div>
  );
}
