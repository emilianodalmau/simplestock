
'use client';

import { useState, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  addDoc,
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { FeedbackTicket, FeedbackReply, Workspace, UserProfile } from '@/types/inventory';
import { useI18n } from '@/i18n/i18n-provider';

const replySchema = z.object({
  message: z.string().min(1, 'La respuesta no puede estar vacía.'),
});
type ReplyFormValues = z.infer<typeof replySchema>;

const statusConfig = {
  nuevo: { label: 'Nuevo', color: 'bg-blue-500' },
  visto: { label: 'Visto', color: 'bg-gray-500' },
  'en-progreso': { label: 'En Progreso', color: 'bg-yellow-500 text-black' },
  resuelto: { label: 'Resuelto', color: 'bg-green-500' },
  cerrado: { label: 'Cerrado', color: 'bg-red-500' },
};

function TicketDetailDialog({ 
    ticket, 
    isOpen, 
    onClose, 
    onStatusChange 
}: { 
    ticket: FeedbackTicket | null, 
    isOpen: boolean, 
    onClose: () => void, 
    onStatusChange: (ticketId: string, status: FeedbackTicket['status']) => void 
}) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const repliesQuery = useMemoFirebase(() => 
    ticket ? query(collection(firestore, `feedback/${ticket.id}/replies`), orderBy('createdAt', 'asc')) : null
  , [ticket, firestore]);
  const { data: replies, isLoading: isLoadingReplies } = useCollection<FeedbackReply>(repliesQuery);

  const replyForm = useForm<ReplyFormValues>({ resolver: zodResolver(replySchema), defaultValues: { message: '' } });

  if (!ticket) return null;

  const handleReplySubmit: SubmitHandler<ReplyFormValues> = async (data) => {
    if (!user || !firestore) return;
    setIsSubmitting(true);
    try {
        const replyRef = collection(firestore, `feedback/${ticket.id}/replies`);
        await addDoc(replyRef, {
            message: data.message,
            userId: user.uid,
            userName: 'Super Admin',
            isSuperAdminReply: true,
            createdAt: serverTimestamp()
        });
        
        if (ticket.status === 'nuevo' || ticket.status === 'visto') {
            onStatusChange(ticket.id, 'en-progreso');
        }

        replyForm.reset();
        toast({ title: 'Respuesta enviada' });
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo enviar la respuesta.' });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Ticket #{ticket.ticketNumber}: {ticket.subject}</DialogTitle>
                <DialogDescription>De: {ticket.userName} ({ticket.userEmail}) | Workspace: {ticket.workspaceName}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
                <Card className="bg-muted/50">
                    <CardHeader><CardTitle className="text-base">Mensaje Original</CardTitle></CardHeader>
                    <CardContent><p className="whitespace-pre-wrap">{ticket.message}</p></CardContent>
                </Card>
                
                {isLoadingReplies ? <Loader2 className="animate-spin" /> : replies?.map(reply => (
                    <Card key={reply.id} className={cn(reply.isSuperAdminReply ? 'bg-primary/10' : '')}>
                        <CardHeader className="pb-2">
                          <CardDescription className="text-xs">
                            {reply.userName} - {format(reply.createdAt.toDate(), 'dd/MM/yy HH:mm')}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="whitespace-pre-wrap">{reply.message}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-4 items-start">
              <Form {...replyForm}>
                <form onSubmit={replyForm.handleSubmit(handleReplySubmit)} className="flex-grow w-full flex items-start gap-2">
                  <FormField
                    control={replyForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem className="flex-grow"><FormControl><Textarea placeholder="Escribe tu respuesta..." {...field} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isSubmitting} size="icon"><Send className="h-4 w-4"/></Button>
                </form>
              </Form>
              <DialogClose asChild><Button variant="outline">Cerrar</Button></DialogClose>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}

export default function FeedbackPage() {
  const [selectedTicket, setSelectedTicket] = useState<FeedbackTicket | null>(null);
  const firestore = useFirestore();
  const { user } = useUser();
  const { dictionary } = useI18n();
  const { toast } = useToast();

  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedWorkspace, setSelectedWorkspace] = useState('all');

  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(
    useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user, firestore])
  );
  
  const workspacesQuery = useMemoFirebase(() => collection(firestore, 'workspaces'), [firestore]);
  const { data: workspaces, isLoading: isLoadingWorkspaces } = useCollection<Workspace>(workspacesQuery);
  const workspaceMap = useMemo(() => new Map(workspaces?.map(ws => [ws.id, ws.name])), [workspaces]);

  const ticketsQuery = useMemoFirebase(() => query(collection(firestore, 'feedback'), orderBy('createdAt', 'desc')), [firestore]);
  const { data: tickets, isLoading: isLoadingTickets } = useCollection<FeedbackTicket>(ticketsQuery);

  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter(ticket => {
      const statusMatch = selectedStatus === 'all' || ticket.status === selectedStatus;
      const workspaceMatch = selectedWorkspace === 'all' || ticket.workspaceId === selectedWorkspace;
      return statusMatch && workspaceMatch;
    });
  }, [tickets, selectedStatus, selectedWorkspace]);

  const groupedTickets = useMemo(() => {
    const groups: { [key: string]: FeedbackTicket[] } = {};
    for (const ticket of filteredTickets) {
      const workspaceId = ticket.workspaceId || 'no-workspace';
      if (!groups[workspaceId]) groups[workspaceId] = [];
      groups[workspaceId].push(ticket);
    }
    return groups;
  }, [filteredTickets]);

  const sortedGroupKeys = useMemo(() => Object.keys(groupedTickets).sort((a,b) => (workspaceMap.get(a) || '').localeCompare(workspaceMap.get(b) || '')), [groupedTickets, workspaceMap]);
  
  const handleStatusChange = async (ticketId: string, status: FeedbackTicket['status']) => {
    try {
      await updateDoc(doc(firestore, `feedback/${ticketId}`), { status, updatedAt: serverTimestamp() });
      toast({ title: 'Estado actualizado', description: `El ticket ahora está ${statusConfig[status].label}.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado del ticket.' });
    }
  };

  const isLoading = isLoadingProfile || isLoadingWorkspaces || isLoadingTickets;
  const isSuperAdmin = currentUserProfile?.role === 'super-admin';

  if (isLoading) {
    return <div className="container mx-auto p-8 flex justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  if (!isSuperAdmin) {
    return <div className="container mx-auto p-8"><Card><CardHeader><CardTitle>Acceso Denegado</CardTitle></CardHeader></Card></div>
  }

  return (
    <>
      <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Gestión de Feedback</h1>
          <p className="text-muted-foreground">Revisa y responde a las consultas de los usuarios.</p>
        </div>
        
        <Card>
            <CardHeader><CardTitle>Filtros</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filtrar por estado" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los Estados</SelectItem>
                        {Object.entries(statusConfig).map(([key, {label}]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                    <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filtrar por workspace" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los Workspaces</SelectItem>
                        {workspaces?.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </CardContent>
        </Card>

        <Accordion type="multiple" className="w-full space-y-4">
            {sortedGroupKeys.length > 0 ? sortedGroupKeys.map(workspaceId => {
                const workspaceName = workspaceMap.get(workspaceId) || 'Sin Workspace';
                const ticketsInGroup = groupedTickets[workspaceId];
                return (
                    <AccordionItem value={workspaceId} key={workspaceId} className="border-none">
                        <Card>
                          <CardHeader className="p-4">
                              <AccordionTrigger className="p-2 text-lg hover:no-underline">
                                  {workspaceName} ({ticketsInGroup.length} tickets)
                              </AccordionTrigger>
                          </CardHeader>
                          <AccordionContent>
                              <CardContent className="pt-0">
                                  <Table>
                                      <TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Asunto</TableHead><TableHead>Usuario</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                                      <TableBody>
                                          {ticketsInGroup.map(ticket => {
                                              const config = statusConfig[ticket.status] || {label: ticket.status, color: 'bg-gray-400'};
                                              return (
                                                  <TableRow key={ticket.id}>
                                                      <TableCell className="font-mono">{ticket.ticketNumber}</TableCell>
                                                      <TableCell className="font-medium">{ticket.subject}</TableCell>
                                                      <TableCell>{ticket.userName}</TableCell>
                                                      <TableCell>{format(ticket.createdAt.toDate(), 'dd/MM/yyyy HH:mm')}</TableCell>
                                                      <TableCell><Badge className={cn("text-white", config.color)}>{config.label}</Badge></TableCell>
                                                      <TableCell className="text-right">
                                                          <Button variant="outline" size="sm" onClick={() => setSelectedTicket(ticket)}>Ver y Responder</Button>
                                                          <Select value={ticket.status} onValueChange={(status) => handleStatusChange(ticket.id, status as any)}>
                                                            <SelectTrigger className="w-40 ml-2 inline-flex"><SelectValue/></SelectTrigger>
                                                            <SelectContent>
                                                              {Object.entries(statusConfig).map(([key, {label}]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                                                            </SelectContent>
                                                          </Select>
                                                      </TableCell>
                                                  </TableRow>
                                              );
                                          })}
                                      </TableBody>
                                  </Table>
                              </CardContent>
                          </AccordionContent>
                        </Card>
                    </AccordionItem>
                )
            }) : <Card><CardContent className="p-6 text-center text-muted-foreground">No se encontraron tickets con los filtros aplicados.</CardContent></Card>}
        </Accordion>
      </div>

      <TicketDetailDialog ticket={selectedTicket} isOpen={!!selectedTicket} onClose={() => setSelectedTicket(null)} onStatusChange={handleStatusChange} />
    </>
  );
}
