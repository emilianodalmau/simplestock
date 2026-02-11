
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { createPreference } from '@/lib/actions';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { CheckoutButton } from '@/components/checkout-button';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useI18n } from '@/i18n/i18n-provider';


type UserProfile = {
  workspaceId?: string;
  role?: 'administrador';
};

const plans = {
  monthly: [
    {
      name: 'Plan Inicial',
      price: 'GRATIS',
      priceValue: 0,
      period: '',
      description: 'Ideal para emprendedores y para validar tu negocio.',
      features: [
        '1 Usuario (Solo Rol Admin)',
        '1 Workspace',
        'Máximo 2 Depósitos',
        'Máximo 100 Productos',
        'Máximo 100 Movimientos/mes',
        'Reportes básicos en pantalla',
        'Soporte comunitario',
        'Marca de agua "Powered by..."',
      ],
      cta: 'Crear Cuenta Gratis',
      href: '/signup',
      featured: false,
      planId: 'inicial',
    },
    {
      name: 'Plan Crecimiento',
      price: 'US$ 1',
      priceValue: 1,
      period: '/mes',
      description: 'Para PyMEs y equipos en expansión que necesitan más potencia.',
      features: [
        'Hasta 5 Usuarios (Todos los roles)',
        '1 Workspace',
        'Hasta 5 Depósitos',
        'Hasta 2,000 Productos',
        'Movimientos de stock ilimitados',
        'Exportación completa (Excel/PDF)',
        'Logo y nombre propio en interfaz y reportes',
        'Soporte por email prioritario',
      ],
      cta: 'Elegir Plan Crecimiento',
      href: '/signup?plan=crecimiento_mensual',
      featured: true,
      planId: 'crecimiento_mensual',
    },
    {
      name: 'Plan Empresarial',
      price: 'US$ 1.5',
      priceValue: 1.5,
      period: '/mes',
      description: 'Soluciones a medida para empresas y consultores.',
      features: [
        'Usuarios Ilimitados (base 50)',
        'Múltiples Workspaces (3 incluidos)',
        'Depósitos ilimitados',
        'Productos ilimitados',
        'Movimientos de stock ilimitados',
        'Reportes avanzados (próximamente)',
        'Personalización completa',
        'Soporte Dedicado (Chat/Teléfono)',
      ],
      cta: 'Contactar Ventas',
      href: 'mailto:ventas@simplestock.com',
      featured: false,
      planId: 'empresarial_mensual',
    },
  ],
  annually: [
    {
      name: 'Plan Inicial',
      price: 'GRATIS',
      priceValue: 0,
      period: '',
      description: 'Ideal para emprendedores y para validar tu negocio.',
      features: [
        '1 Usuario (Solo Rol Admin)',
        '1 Workspace',
        'Máximo 2 Depósitos',
        'Máximo 100 Productos',
        'Máximo 100 Movimientos/mes',
        'Reportes básicos en pantalla',
        'Soporte comunitario',
        'Marca de agua "Powered by..."',
      ],
      cta: 'Crear Cuenta Gratis',
      href: '/signup',
      featured: false,
      planId: 'inicial',
    },
    {
      name: 'Plan Crecimiento',
      price: 'US$ 10',
      priceValue: 10,
      period: '/año',
      description: 'Ahorra ~2 meses con el plan anual.',
      features: [
        'Hasta 5 Usuarios (Todos los roles)',
        '1 Workspace',
        'Hasta 5 Depósitos',
        'Hasta 2,000 Productos',
        'Movimientos de stock ilimitados',
        'Exportación completa (Excel/PDF)',
        'Logo y nombre propio en interfaz y reportes',
        'Soporte por email prioritario',
      ],
      cta: 'Elegir Plan Crecimiento',
      href: '/signup?plan=crecimiento_anual',
      featured: true,
      planId: 'crecimiento_anual',
    },
    {
      name: 'Plan Empresarial',
      price: 'US$ 15',
      priceValue: 15,
      period: '/año',
      description: 'Ahorra ~2 meses con el plan anual.',
      features: [
        'Usuarios Ilimitados (base 50)',
        'Múltiples Workspaces (3 incluidos)',
        'Depósitos ilimitados',
        'Productos ilimitados',
        'Movimientos de stock ilimitados',
        'Reportes avanzados (próximamente)',
        'Personalización completa',
        'Soporte Dedicado (Chat/Teléfono)',
      ],
      cta: 'Contactar Ventas',
      href: 'mailto:ventas@simplestock.com',
      featured: false,
      planId: 'empresarial_anual',
    },
  ],
};

function PlanCard({ plan, onSelectPlan, isProcessing, isUserLoggedIn }: { plan: any; onSelectPlan: (plan: any) => void; isProcessing: string | null, isUserLoggedIn: boolean }) {
  const isButtonDisabled = plan.priceValue === 0 || plan.cta.startsWith('Contactar');
  const isLoading = isProcessing === plan.planId;
  const router = useRouter();
  
  const handleButtonClick = () => {
    if (isUserLoggedIn) {
        onSelectPlan(plan);
    } else {
        router.push(plan.href);
    }
  };

  return (
    <Card key={plan.name} className={cn('flex flex-col border-2', plan.featured ? 'border-primary' : 'border-border')}>
      <CardHeader className="text-left">
        <CardTitle className="text-2xl font-headline">{plan.name}</CardTitle>
        <CardDescription className="h-10">{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="mb-6">
          <p className="text-5xl font-bold">
            {plan.price}
            <span className="text-lg font-normal text-muted-foreground">{plan.period}</span>
          </p>
        </div>
        <ul className="space-y-3">
          {plan.features.map((feature: string) => (
            <li key={feature} className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0 mt-1" />
              <span className="text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button onClick={handleButtonClick} className="w-full" variant={plan.featured ? 'default' : 'outline'} disabled={(isUserLoggedIn && isButtonDisabled) || isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            plan.cta
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function PreciosPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { dictionary } = useI18n();

  const userDocRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [user, firestore]);
  const { data: userProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const currentPlans = plans[billingCycle];
  
  const handleSelectPlan = async (plan: any) => {
    if (!userProfile?.workspaceId) {
        if(userProfile?.role === 'administrador' && !userProfile.workspaceId){
             toast({
                variant: 'default',
                title: 'Acción Requerida',
                description: 'Primero debes crear un workspace. Serás redirigido.',
            });
            router.push(`/dashboard?plan=${plan.planId}`);
        } else {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo encontrar tu workspace. Asegúrate de haber completado la configuración inicial.',
            });
        }
        return;
    }
    
    setIsProcessing(plan.planId);
    setPreferenceId(null);
    
    try {
        const result = await createPreference(plan.planId, plan.name, plan.priceValue, userProfile.workspaceId);
        if (result.error) {
            throw new Error(result.error);
        }
        if (result.id) {
            setPreferenceId(result.id);
        }
    } catch (error) {
        console.error(error);
        toast({
            variant: 'destructive',
            title: 'Error al generar el pago',
            description: 'No se pudo crear el enlace de pago. Por favor, intenta de nuevo.',
        });
    } finally {
        setIsProcessing(null);
    }
  };

  useEffect(() => {
    const planIdToPurchase = searchParams.get('plan');
    if (planIdToPurchase && user && !isUserLoading && userProfile && !isLoadingProfile && userProfile.workspaceId) {
        const allPlans = [...plans.monthly, ...plans.annually];
        const selectedPlan = allPlans.find(p => p.planId === planIdToPurchase);
        if (selectedPlan) {
            handleSelectPlan(selectedPlan);
            router.replace('/precios', {scroll: false});
        }
    }
  }, [searchParams, user, isUserLoading, userProfile, isLoadingProfile, router]);


  return (
    <div className="container mx-auto max-w-6xl py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight font-headline sm:text-5xl">{dictionary.pages.precios.title}</h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">{dictionary.pages.precios.description}</p>
      </div>

      <div className="flex justify-center items-center space-x-3 mb-10">
        <Label htmlFor="billing-cycle" className={cn('transition-colors', billingCycle === 'monthly' ? 'text-foreground' : 'text-muted-foreground')}>
          Pago Mensual
        </Label>
        <Switch id="billing-cycle" checked={billingCycle === 'annually'} onCheckedChange={(checked) => setBillingCycle(checked ? 'annually' : 'monthly')} />
        <Label htmlFor="billing-cycle" className={cn('transition-colors', billingCycle === 'annually' ? 'text-foreground' : 'text-muted-foreground')}>
          Pago Anual (Ahorra 2 meses)
        </Label>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {currentPlans.map((plan) => (
          <PlanCard key={plan.planId} plan={plan} onSelectPlan={handleSelectPlan} isProcessing={isProcessing} isUserLoggedIn={!!user} />
        ))}
      </div>
      
      <Dialog open={!!preferenceId} onOpenChange={(open) => !open && setPreferenceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completa tu Pago</DialogTitle>
            <DialogDescription>
              Haz clic en el botón de Mercado Pago para finalizar la compra de tu
              plan. Serás redirigido a una página segura.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {preferenceId && <CheckoutButton preferenceId={preferenceId} />}
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-12 text-center text-sm text-muted-foreground max-w-4xl mx-auto">
        <p>*Los precios se muestran en dólares estadounidenses (USD) como referencia. El cobro se realizará en pesos argentinos (ARS) a través de Mercado Pago al tipo de cambio aplicable el día de la transacción, más los impuestos correspondientes (IVA, etc.).</p>
      </div>

      <div className="mt-12 text-center">
        <Button asChild variant="ghost">
            <Link href={user ? "/dashboard" : "/"}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
            </Link>
        </Button>
      </div>
    </div>
  );
}
