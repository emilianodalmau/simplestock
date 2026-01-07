
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { Suspense } from "react";

function SignupContent() {
    return (
        <div className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-12">
            <AuthCard
                title="Crear una Cuenta"
                description="Ingresa tus datos para comenzar con tu primer workspace."
            >
                <SignupForm />
            </AuthCard>
        </div>
    );
}


export default function SignupPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <SignupContent />
    </Suspense>
  );
}

    
