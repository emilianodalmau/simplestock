
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
import { useRouter, useSearchParams } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useAuth, useFirestore } from "@/firebase";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { doc, setDoc } from "firebase/firestore";

const formSchema = z.object({
  firstName: z.string().min(1, { message: "Por favor, ingresa tu nombre." }),
  lastName: z.string().min(1, { message: "Por favor, ingresa tu apellido." }),
  email: z.string().email({ message: "Por favor, ingresa un email válido." }),
  password: z
    .string()
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
});

export function SignupForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!firestore || !auth) {
      toast({
        title: "Error",
        description: "El servicio de base de datos no está disponible.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      // 1. Create the Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      const user = userCredential.user;
      
      const displayName = `${values.firstName} ${values.lastName}`;
      await updateProfile(user, { displayName });

      const isSuperAdmin = values.email === "emilianodalmau@gmail.com";
      const role = isSuperAdmin ? "super-admin" : "administrador";

      // 2. Define the User document in Firestore
      const userDocRef = doc(firestore, "users", user.uid);
      const userData: any = {
        id: user.uid,
        email: user.email,
        firstName: values.firstName,
        lastName: values.lastName,
        photoURL: user.photoURL || "",
        role: role,
        workspaceId: null, // Critical: Starts as null
      };
      
      await setDoc(userDocRef, userData);
      
      // 3. Redirect to dashboard to force workspace creation
      const plan = searchParams.get('plan');
      const redirectUrl = plan ? `/dashboard?plan=${plan}` : "/dashboard";
      router.push(redirectUrl);

    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        toast({
          title: "Email ya en uso",
          description: "Este email ya está registrado. Intenta iniciar sesión.",
          variant: "destructive",
        });
      } else {
        console.error("Signup Error:", error);
        toast({
          title: "Registro Fallido",
          description: "Ocurrió un error inesperado. Por favor, intenta de nuevo.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Juan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellido</FormLabel>
                  <FormControl>
                    <Input placeholder="Pérez" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>
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
        <div className="space-y-2">
            <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear Cuenta
            </Button>
            <Button asChild variant="ghost" className="w-full">
                <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver al Inicio
                </Link>
            </Button>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          ¿Ya tienes una cuenta?{" "}
          <Link href="/login" className="underline hover:text-primary-foreground/80">
            Inicia Sesión
          </Link>
        </div>
      </form>
    </Form>
  );
}
