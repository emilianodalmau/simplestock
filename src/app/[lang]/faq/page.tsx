
'use client';

import { useState, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  useFirestore,
  useDoc,
  useMemoFirebase,
  useUser,
  useStorage,
} from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/i18n/i18n-provider';
import type { UserProfile, Workspace } from '@/types/inventory';


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

const sections = [
  'General', 'Dashboard', 'Inventario', 'Movimientos', 'Ajustes', 'Productos', 'Categorías', 'Proveedores', 'Clientes', 'Depósitos', 'Ubicaciones', 'Usuarios', 'Suscripción', 'Configuración', 'Otro'
] as const;

const feedbackFormSchema = z.object({
    type: z.enum(['consulta', 'error', 'sugerencia']),
    section: z.enum(sections),
    subject: z.string().min(5, "El asunto debe tener al menos 5 caracteres.").max(100, "El asunto no puede superar los 100 caracteres."),
    message: z.string().min(20, "El mensaje debe tener al menos 20 caracteres.").max(1500, "El mensaje no puede superar los 1500 caracteres."),
    image: z.instanceof(File).optional()
        .refine(file => !file || file.size <= 2 * 1024 * 1024, `El tamaño máximo de la imagen es 2MB.`)
        .refine(file => !file || ['image/jpeg', 'image/png', 'image/gif'].includes(file.type), 'Solo se admiten formatos JPG, PNG y GIF.'),
});

type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

function FeedbackForm() {
    const { user } = useUser();
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(
        useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [user, firestore])
    );
    
    const { data: workspace, isLoading: isLoadingWorkspace } = useDoc<Workspace>(
        useMemoFirebase(() => (currentUserProfile?.workspaceId ? doc(firestore, 'workspaces', currentUserProfile.workspaceId) : null), [currentUserProfile?.workspaceId, firestore])
    );

    const form = useForm<FeedbackFormValues>({
        resolver: zodResolver(feedbackFormSchema),
        defaultValues: {
            type: 'consulta',
            section: 'General',
            subject: '',
            message: '',
        }
    });

    const onSubmit: SubmitHandler<FeedbackFormValues> = async (data) => {
        if (!firestore || !storage || !user || !currentUserProfile || !workspace) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo enviar el feedback. Faltan datos de sesión.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const ticketRef = doc(collection(firestore, 'feedback'));
            let imageUrl = '';
            if (data.image) {
                const imagePath = `feedback_attachments/${workspace.id}/${ticketRef.id}/${data.image.name}`;
                const imageStorageRef = ref(storage, imagePath);
                await uploadBytes(imageStorageRef, data.image);
                imageUrl = await getDownloadURL(imageStorageRef);
            }

            await runTransaction(firestore, async (transaction) => {
                const counterRef = doc(firestore, `counters/feedbackCounter`);
                const counterSnap = await transaction.get(counterRef);
                const lastNumber = counterSnap.exists() ? counterSnap.data().lastNumber : 0;
                const newTicketNumber = lastNumber + 1;

                transaction.set(ticketRef, {
                    id: ticketRef.id,
                    ticketNumber: `T-${String(newTicketNumber).padStart(6, '0')}`,
                    workspaceId: workspace.id,
                    workspaceName: workspace.name,
                    userId: user.uid,
                    userName: `${currentUserProfile.firstName} ${currentUserProfile.lastName}`,
                    userEmail: currentUserProfile.email,
                    type: data.type,
                    section: data.section,
                    subject: data.subject,
                    message: data.message,
                    imageUrl: imageUrl,
                    status: 'nuevo',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });

                transaction.set(counterRef, { lastNumber: newTicketNumber }, { merge: true });
            });
            
            toast({ title: 'Feedback Enviado', description: 'Gracias por tu mensaje. Lo revisaremos pronto.' });
            form.reset();

        } catch (error) {
            console.error("Error submitting feedback:", error);
            toast({ variant: 'destructive', title: 'Error al enviar', description: 'Ocurrió un problema al enviar tu mensaje.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // Do not render the form for guests or super admins
    if (!user || !currentUserProfile || currentUserProfile.role === 'super-admin') {
        return null;
    }

    if (isLoadingProfile || isLoadingWorkspace) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Contactar a Soporte</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="animate-spin" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
             <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardHeader>
                        <CardTitle>¿Necesitas Ayuda?</CardTitle>
                        <CardDescription>Envíanos una consulta, sugerencia o reporta un error. Te responderemos a la brevedad.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="type" render={({ field }) => (
                                <FormItem><FormLabel>Tipo de Mensaje</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                                    <SelectItem value="consulta">Tengo una consulta</SelectItem>
                                    <SelectItem value="error">Quiero reportar un error</SelectItem>
                                    <SelectItem value="sugerencia">Tengo una sugerencia</SelectItem>
                                </SelectContent></Select><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="section" render={({ field }) => (
                                <FormItem><FormLabel>Sección Relevante</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                                    {sections.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent></Select><FormMessage /></FormItem>
                            )}/>
                        </div>
                         <FormField control={form.control} name="subject" render={({ field }) => (
                            <FormItem><FormLabel>Asunto</FormLabel><FormControl><Input placeholder="Un título breve para tu mensaje" {...field} /></FormControl><FormMessage /></FormItem>
                         )}/>
                         <FormField control={form.control} name="message" render={({ field }) => (
                            <FormItem><FormLabel>Mensaje</FormLabel><FormControl><Textarea placeholder="Describe tu consulta, error o sugerencia en detalle..." {...field} rows={6} /></FormControl><FormMessage /></FormItem>
                         )}/>
                         <FormField control={form.control} name="image" render={({ field: { value, onChange, ...fieldProps } }) => (
                            <FormItem><FormLabel>Adjuntar Imagen (Opcional)</FormLabel><FormControl><Input type="file" accept="image/png, image/jpeg, image/gif" onChange={(e) => onChange(e.target.files && e.target.files[0])} {...fieldProps} /></FormControl><FormDescription>Puedes adjuntar una captura de pantalla. Máx 2MB.</FormDescription><FormMessage /></FormItem>
                         )}/>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enviar Mensaje
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}


export default function FAQPage() {
  const { dictionary } = useI18n();
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.faq.title}</h1>
        <p className="text-muted-foreground">
          {dictionary.pages.faq.description}
        </p>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Preguntas Frecuentes</CardTitle>
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

      <FeedbackForm />
    </div>
  );
}

