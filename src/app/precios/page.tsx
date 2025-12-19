
'use client';

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const plans = {
  monthly: [
    {
      name: 'Plan Inicial',
      price: 'GRATIS',
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
    },
    {
      name: 'Plan Crecimiento',
      price: 'US$ 29',
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
      href: '/signup?plan=crecimiento',
      featured: true,
    },
    {
      name: 'Plan Empresarial',
      price: 'US$ 79',
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
    },
  ],
  annually: [
     {
      name: 'Plan Inicial',
      price: 'GRATIS',
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
    },
    {
      name: 'Plan Crecimiento',
      price: 'US$ 290',
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
    },
    {
      name: 'Plan Empresarial',
      price: 'US$ 790',
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
    },
  ]
};

export default function PreciosPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');

  const currentPlans = plans[billingCycle];

  return (
    <div className="container mx-auto max-w-6xl py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight font-headline sm:text-5xl">
          Un plan para cada etapa de tu negocio
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
          Elige el plan que mejor se adapte al tamaño y a las necesidades de tu
          equipo.
        </p>
      </div>

       <div className="flex justify-center items-center space-x-3 mb-10">
        <Label htmlFor="billing-cycle" className={cn('transition-colors', billingCycle === 'monthly' ? 'text-foreground' : 'text-muted-foreground')}>
          Pago Mensual
        </Label>
        <Switch
          id="billing-cycle"
          checked={billingCycle === 'annually'}
          onCheckedChange={(checked) => setBillingCycle(checked ? 'annually' : 'monthly')}
        />
        <Label htmlFor="billing-cycle" className={cn('transition-colors', billingCycle === 'annually' ? 'text-foreground' : 'text-muted-foreground')}>
          Pago Anual (Ahorra 2 meses)
        </Label>
      </div>


      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {currentPlans.map((plan) => (
          <Card
            key={plan.name}
            className={cn(
              'flex flex-col border-2',
              plan.featured ? 'border-primary' : 'border-border'
            )}
          >
            <CardHeader className="text-left">
              <CardTitle className="text-2xl font-headline">{plan.name}</CardTitle>
              <CardDescription className="h-10">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="mb-6">
                 <p className="text-5xl font-bold">{plan.price}<span className="text-lg font-normal text-muted-foreground">{plan.period}</span></p>
              </div>
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start">
                    <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0 mt-1" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full" variant={plan.featured ? 'default' : 'outline'}>
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      
       <div className="mt-12 text-center text-sm text-muted-foreground max-w-4xl mx-auto">
         <p>
            *Los precios se muestran en dólares estadounidenses (USD) como referencia. El cobro se realizará en pesos argentinos (ARS) a través de Mercado Pago al tipo de cambio aplicable el día de la transacción, más los impuestos correspondientes (IVA, etc.).
         </p>
      </div>

        <div className="mt-12 text-center">
            <Button asChild variant="ghost">
            <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al Inicio
            </Link>
            </Button>
      </div>
    </div>
  );
}
