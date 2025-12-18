
'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const plans = [
  {
    name: 'Básico',
    price: '$10',
    period: '/mes',
    description: 'Ideal para individuos y equipos pequeños que empiezan.',
    features: [
      '1 Workspace',
      'Hasta 5 usuarios',
      '1000 productos',
      'Soporte por email',
    ],
    cta: 'Comenzar ahora',
    href: '/signup',
  },
  {
    name: 'Profesional',
    price: '$25',
    period: '/mes',
    description: 'Para negocios en crecimiento que necesitan más potencia.',
    features: [
      '5 Workspaces',
      'Hasta 20 usuarios',
      'Productos ilimitados',
      'Soporte prioritario',
      'Roles y permisos avanzados',
    ],
    cta: 'Empezar plan Pro',
    href: '/signup',
    featured: true,
  },
  {
    name: 'Empresarial',
    price: 'Contacto',
    period: '',
    description: 'Soluciones a medida para grandes organizaciones.',
    features: [
      'Workspaces ilimitados',
      'Usuarios ilimitados',
      'Soporte dedicado 24/7',
      'Integraciones personalizadas (API)',
      'Auditorías de seguridad',
    ],
    cta: 'Contactar Ventas',
    href: 'mailto:ventas@simplestock.com',
  },
];

export default function PreciosPage() {
  return (
    <div className="container mx-auto max-w-5xl py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight font-headline sm:text-5xl">
          Un plan para cada necesidad
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
          Elige el plan que mejor se adapte al tamaño y a las necesidades de tu
          equipo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={cn(
              'flex flex-col',
              plan.featured ? 'border-primary ring-2 ring-primary' : ''
            )}
          >
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="text-center mb-6">
                <span className="text-5xl font-bold">{plan.price}</span>
                {plan.period && (
                  <span className="text-muted-foreground">{plan.period}</span>
                )}
              </div>
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start">
                    <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-1" />
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
    </div>
  );
}
