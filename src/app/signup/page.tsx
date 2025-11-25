import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <div className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-12">
      <AuthCard
        title="Create an Account"
        description="Enter your email and password to get started."
      >
        <SignupForm />
      </AuthCard>
    </div>
  );
}
