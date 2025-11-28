
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useAuth, useFirestore } from "@/firebase";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { doc, getDoc } from 'firebase/firestore';

const formSchema = z.object({
  email: z.string().email({ message: "La dirección de email no es válida." }),
  password: z
    .string()
    .min(1, { message: "La contraseña es requerida." }),
});

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!auth || !firestore) {
      setIsLoading(false);
      toast({
        title: "Error",
        description: "El servicio de autenticación no está disponible.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // First, just sign in to get the user object.
      const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;

      // Then, check their status in Firestore.
      const userDocRef = doc(firestore, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists() && userDoc.data().disabled === true) {
        // If user is disabled, sign them out immediately and show an error.
        await auth.signOut();
        toast({
          title: "Cuenta Desactivada",
          description: "Esta cuenta ha sido desactivada por un administrador.",
          variant: "destructive",
        });
        setIsLoading(false);
        return; // Stop the login process.
      }
      
      // If user is not disabled, proceed with role-based redirection.
      if (userDoc.exists() && userDoc.data().role === 'super-admin') {
        router.push("/super-admin");
      } else {
        router.push("/dashboard");
      }

    } catch (error: any) {
      toast({
        title: "Inicio de Sesión Fallido",
        description: "Por favor, revisa tus credenciales e intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      // This will only be reached on success or credential failure, not on disabled account.
      if (isLoading) {
          setIsLoading(false);
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="nombre@ejemplo.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Iniciar Sesión
        </Button>
        <div className="text-center text-sm text-muted-foreground">
          ¿No tienes una cuenta?{" "}
          <Link href="/signup" className="underline hover:text-primary-foreground/80">
            Regístrate
          </Link>
        </div>
      </form>
    </Form>
  );
}
