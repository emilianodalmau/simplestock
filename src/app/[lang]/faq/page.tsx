
'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n/i18n-provider';

const faqs = [
    {
        question: '¿Cuál es la diferencia entre los roles de usuario?',
        answer: 'Los roles determinan qué puede hacer cada usuario. Administrador: control total del workspace. Editor: puede crear y modificar productos, depósitos, etc., pero no gestionar usuarios ni facturación. Visualizador: solo puede ver la información, no puede modificar nada. Jefe de Depósito: gestiona los movimientos y ajustes de los depósitos que tiene asignados. Solicitante: solo puede crear solicitudes de productos.'
    },
    {
        question: '¿Cómo funciona el inventario? ¿Se actualiza solo?',
        answer: 'Sí. El stock de tu inventario se actualiza automáticamente cada vez que registras un movimiento (entrada, salida) o un ajuste. La página de Inventario te muestra la cantidad total de cada producto en tiempo real, sumando el stock de todos tus depósitos (o del depósito que filtres).'
    },
    {
        question: '¿Qué es un "ajuste" de stock?',
        answer: 'Un ajuste es una corrección manual del stock. Se usa cuando la cantidad física de un producto no coincide con la que figura en el sistema (por ejemplo, por roturas, pérdidas o errores de conteo). Un ajuste crea un movimiento para registrar esa diferencia y auditar el cambio.'
    },
    {
        question: '¿Puedo importar mis productos desde un archivo?',
        answer: '¡Sí! En la página de Productos, puedes descargar una plantilla de Excel. Completa esa plantilla con tus productos y luego usa la opción "Importar Productos" para cargarlos todos de una sola vez. Esto te ahorrará mucho tiempo si tienes muchos artículos.'
    },
    {
        question: '¿Qué pasa si alcanzo el límite de mi plan?',
        answer: 'Cuando alcanzas un límite de tu plan (por ejemplo, el número máximo de productos), la aplicación te mostrará una notificación y no te permitirá crear más elementos de ese tipo. Para seguir creciendo, puedes mejorar tu plan desde la sección "Suscripción".'
    },
    {
        question: '¿Cómo funcionan las "Solicitudes" y los "Pedidos"?',
        answer: 'Un "Solicitante" crea una "Solicitud" de productos desde el stock de un depósito. Esta solicitud aparece en la página de "Pedidos" para que un "Jefe de Depósito" o "Administrador" la revise. Al "Procesar el Pedido", se genera un remito de salida y se descuenta el stock, completando el ciclo.'
    }
];

export default function FAQPage() {
  const { dictionary } = useI18n();
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.faq.title}</h1>
        <p className="text-muted-foreground">
          {dictionary.pages.faq.description}
        </p>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Centro de Ayuda</CardTitle>
            <CardDescription>Haz clic en una pregunta para ver su respuesta.</CardDescription>
        </CardHeader>
        <CardContent>
            <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                    <AccordionItem value={`item-${index}`} key={index}>
                        <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                        <AccordionContent className="text-base text-muted-foreground">
                            {faq.answer}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </CardContent>
      </Card>

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
