
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, useFieldArray, type SubmitHandler } from 'react-hook-form';
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
  runTransaction,
  doc,
  serverTimestamp,
  increment,
  where,
  query,
  getDocs,
  getCountFromServer,
  limit,
  startAfter,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, PlusCircle, CalendarIcon, FileDown, FileText, ScanLine, Eye } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RemitoActions } from '@/components/remito-actions';
import type { AppSettings } from '@/types/settings';
import type { Product, Deposit, Supplier, UserProfile, StockMovementItem, StockMovement, InventoryStock, Batch, Workspace } from '@/types/inventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { useI18n } from '@/i18n/i18n-provider';
import { ProductComboBox } from '@/components/ui/product-combobox';
import { SelectBatchDialog } from '@/components/ui/select-batch-dialog';


// --- Zod Schemas ---
const batchSelectionSchema = z.object({
  batchId: z.string(),
  loteId: z.string(),
  quantity: z.number(),
});

const movementItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto.'),
  quantity: z.coerce.number().min(0.1, 'La cantidad debe ser mayor a 0.'),
  loteId: z.string().optional(),
  expirationDate: z.date().optional(),
  manualBatches: z.array(batchSelectionSchema).optional(),
});


const movementFormSchema = z.object({
  type: z.enum(['entrada', 'salida']),
  depositId: z.string().min(1, 'Selecciona un depósito.'),
  remitoNumber: z.string().optional(),
  actorId: z.string().optional(),
  observation: z.string().optional(),
  items: z.array(movementItemSchema).min(1, 'Debes agregar al menos un producto.'),
});

type MovementFormValues = z.infer<typeof movementFormSchema>;


// Removed local Workspace type, now using global type from @/types/inventory

// --- Skeleton Component ---
function MovementPageSkeleton() {
  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
       <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin" />
       </div>
    </div>
  );
}

// --- Child Component with Data Logic ---
function MovimientosContent({ currentUserProfile }: { currentUserProfile: UserProfile }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfSettings, setPdfSettings] = useState<AppSettings & { workspaceAppName?: string; workspaceLogoUrl?: string } | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { dictionary } = useI18n();
  
  const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
  const [dialogSearchTerm, setDialogSearchTerm] = useState('');
  const [dialogQuantities, setDialogQuantities] = useState<Record<string, number>>({});
  
  const [scanMode, setScanMode] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedMovementForDetail, setSelectedMovementForDetail] = useState<StockMovement | null>(null);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scannedQuantity, setScannedQuantity] = useState<number>(1);
  
  const [batchSelectorState, setBatchSelectorState] = useState<{ open: boolean, itemIndex: number | null }>({ open: false, itemIndex: null });


  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedDeposit, setSelectedDeposit] = useState('all');
  const [selectedActor, setSelectedActor] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const role = currentUserProfile?.role;
  const isJefeDeposito = role === 'jefe_deposito';
  const isSolicitante = role === 'solicitante';
  const isAdmin = role === 'administrador';
  
  const canManageMovements = useMemo(() => {
    if (!role) return false;
    return ['administrador', 'editor', 'jefe_deposito'].includes(role);
  }, [role]);

  const workspaceId = currentUserProfile?.workspaceId;
  
  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId ? doc(firestore, 'workspaces', workspaceId) : null),
    [firestore, workspaceId]
  );
  const { data: workspaceData, isLoading: isLoadingWorkspace } = useDoc<Workspace>(workspaceDocRef);

  useEffect(() => {
    if (!isLoadingWorkspace) {
        setPdfSettings({
            appName: workspaceData?.appName || 'Inventario',
            logoUrl: workspaceData?.logoUrl || '',
            workspaceAppName: workspaceData?.appName,
            workspaceLogoUrl: workspaceData?.logoUrl,
        });
    }
  }, [workspaceData, isLoadingWorkspace]);

  const collectionPrefix = useMemo(
    () => (workspaceId ? `workspaces/${workspaceId}` : null),
    [workspaceId]
  );

  const productsCollection = useMemoFirebase(
    () =>
      firestore && collectionPrefix
        ? query(collection(firestore, `${collectionPrefix}/products`), where('isArchived', '!=', true))
        : null,
    [firestore, collectionPrefix]
  );
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsCollection);

  const depositsForJefeQuery = useMemoFirebase(
    () => {
        if (!firestore || !collectionPrefix || !isJefeDeposito || !user) return null;
        return query(collection(firestore, `${collectionPrefix}/deposits`), where('jefeId', '==', user.uid));
    },
    [firestore, collectionPrefix, isJefeDeposito, user]
  );

  const allDepositsQuery = useMemoFirebase(
    () => {
        if (!firestore || !collectionPrefix || isJefeDeposito) return null;
        return collection(firestore, `${collectionPrefix}/deposits`);
    },
    [firestore, collectionPrefix, isJefeDeposito]
  );

  const { data: depositsForJefe, isLoading: isLoadingDepositsForJefe } = useCollection<Deposit>(depositsForJefeQuery);
  const { data: allDeposits, isLoading: isLoadingAllDeposits } = useCollection<Deposit>(allDepositsQuery);
  
  const deposits = isJefeDeposito ? depositsForJefe : allDeposits;
  const isLoadingDeposits = isJefeDeposito ? isLoadingDepositsForJefe : isLoadingAllDeposits;

  const assignedDepositIds = useMemo(() => {
    if (!isJefeDeposito || !deposits) return null;
    if (deposits.length === 0) return [];
    return deposits.map(d => d.id);
  }, [isJefeDeposito, deposits]);
  
  useEffect(() => {
    if (isJefeDeposito && deposits?.length === 1) {
      setSelectedDeposit(deposits[0].id);
    }
  }, [isJefeDeposito, deposits]);

  const suppliersCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/suppliers`) : null),
    [firestore, collectionPrefix]
  );
  const { data: suppliers, isLoading: isLoadingSuppliers } =
    useCollection<Supplier>(suppliersCollection);

  // Pagination and Fetching State (History)
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
  const [historyPageSize] = useState(20);
  const [historyLastVisible, setHistoryLastVisible] = useState<any>(null);
  const [historyFirstVisible, setHistoryFirstVisible] = useState<any>(null);
  const [historyPageHistory, setHistoryPageHistory] = useState<any[]>([]);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [pagedMovements, setPagedMovements] = useState<StockMovement[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentHistoryPage(1);
    setHistoryLastVisible(null);
    setHistoryPageHistory([]);
  }, [searchTerm, selectedType, selectedDeposit, dateRange]);

  // Fetch Paged Movements History
  useEffect(() => {
    if (!firestore || !collectionPrefix || !user) return;

    const fetchHistory = async () => {
        setIsFetchingHistory(true);
        try {
            const movementsRef = collection(firestore, `${collectionPrefix}/stockMovements`);
            let baseQuery = query(movementsRef);

            // Role-based restrictions
            if (isJefeDeposito) {
                if (assignedDepositIds && assignedDepositIds.length > 0) {
                    baseQuery = query(baseQuery, where('depositId', 'in', assignedDepositIds));
                } else {
                    setPagedMovements([]);
                    setHistoryTotalCount(0);
                    setIsFetchingHistory(false);
                    return;
                }
            } else if (isSolicitante) {
                baseQuery = query(baseQuery, where('actorId', '==', user.uid));
            }

            // Apply Filters
            if (selectedType !== 'all') {
                baseQuery = query(baseQuery, where('type', '==', selectedType));
            }
            if (selectedDeposit !== 'all' && !isJefeDeposito) {
                baseQuery = query(baseQuery, where('depositId', '==', selectedDeposit));
            }
            if (dateRange?.from) {
                baseQuery = query(baseQuery, where('createdAt', '>=', dateRange.from));
            }
            if (dateRange?.to) {
                const toDate = new Date(dateRange.to);
                toDate.setHours(23, 59, 59, 999);
                baseQuery = query(baseQuery, where('createdAt', '<=', toDate));
            }
            
            // Note: Search by remitoNumber or productName is complex natively. 
            // We'll prioritize the other filters first.

            // Get Total Count (Only on first load or filter change)
            if (currentHistoryPage === 1) {
                const countSnapshot = await getCountFromServer(baseQuery);
                setHistoryTotalCount(countSnapshot.data().count);
            }

            // Apply Sort and Pagination
            let finalQuery = query(baseQuery, orderBy('createdAt', 'desc'));

            if (currentHistoryPage > 1 && historyLastVisible) {
                finalQuery = query(finalQuery, startAfter(historyLastVisible), limit(historyPageSize));
            } else {
                finalQuery = query(finalQuery, limit(historyPageSize));
            }

            const snapshot = await getDocs(finalQuery);
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StockMovement));
            
            setPagedMovements(docs);
            setHistoryLastVisible(snapshot.docs[snapshot.docs.length - 1]);
            setHistoryFirstVisible(snapshot.docs[0]);
        } catch (error) {
            console.error("Error fetching movements history:", error);
        } finally {
            setIsFetchingHistory(false);
        }
    };

    fetchHistory();
  }, [firestore, collectionPrefix, isJefeDeposito, isSolicitante, user, assignedDepositIds, selectedType, selectedDeposit, dateRange, currentHistoryPage, historyPageSize]);

  // We no longer need movementsQuery and the bulk useCollection
  const { data: movements, isLoading: isLoadingMovements } = { data: pagedMovements, isLoading: isFetchingHistory };

  // filteredMovements is now just pagedMovements
  const filteredMovements = pagedMovements;


  const inventoryCollection = useMemoFirebase(
    () => {
        if (!firestore || !collectionPrefix) return null;
        return collection(firestore, `${collectionPrefix}/inventory`);
    },
    [firestore, collectionPrefix]
  );
  
  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryCollection);

  const isLoading =
    isLoadingProducts ||
    isLoadingDeposits ||
    isLoadingSuppliers ||
    isLoadingWorkspace;

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: {
      type: 'salida',
      depositId: '',
      remitoNumber: '',
      actorId: '',
      observation: '',
      items: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const movementType = form.watch('type');
  const selectedDepositId = form.watch('depositId');
  
  const stockForSelectedDeposit = useMemo(() => {
    const stockMap = new Map<string, number>();
    if (!inventory || !selectedDepositId) return stockMap;

    inventory.forEach(stockItem => {
        if (stockItem.depositId === selectedDepositId) {
            stockMap.set(stockItem.productId, (stockMap.get(stockItem.productId) || 0) + stockItem.quantity);
        }
    });
    return stockMap;
  }, [inventory, selectedDepositId]);
  
  useEffect(() => {
    if (isJefeDeposito && deposits?.length === 1) {
        form.setValue('depositId', deposits[0].id);
    }
  }, [isJefeDeposito, deposits, form]);

  useEffect(() => {
    replace([]);
  }, [selectedDepositId, replace]);

  useEffect(() => {
    replace([]);
    form.setValue('actorId', '');
  }, [movementType, replace, form]);

  const productsMap = useMemo(() => new Map(products?.map((p) => [p.id, p])), [
    products,
  ]);
  
  const allActorsForFilter = useMemo(() => {
    const uniqueActors = new Map<string, { id: string; name: string }>();
    movements.forEach(m => {
      if (m.actorId && m.actorName) {
        uniqueActors.set(m.actorId, { id: m.actorId, name: m.actorName });
      }
    });
    return Array.from(uniqueActors.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [movements]);

  const availableProductsForMovement = useMemo(() => {
    if (!products || !selectedDepositId) return [];

    const productsInDeposit = products.filter(
        (p) => !p.isArchived && (p.productType === 'COMBO' || p.depositIds?.includes(selectedDepositId))
    );

    let result: Product[] = [];
    if (movementType === 'entrada') {
        result = productsInDeposit.filter(p => p.productType !== 'COMBO'); // Cannot stock a combo
    } else if (movementType === 'salida') {
        if (!inventory) return []; 
        const productsWithStockInDeposit = new Set(
            inventory
                .filter(stockItem => stockItem.depositId === selectedDepositId && stockItem.quantity > 0)
                .map(stockItem => stockItem.productId)
        );
        
        result = productsInDeposit.filter(product => {
            if (product.productType === 'COMBO') {
                if (!product.components) return false;
                 // A combo is available if all its components are available
                return product.components.every(comp => productsWithStockInDeposit.has(comp.productId));
            }
            return productsWithStockInDeposit.has(product.id);
        });
    }
    
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [movementType, selectedDepositId, products, inventory]);
  
  const openBatchSelector = (index: number) => {
    setBatchSelectorState({ open: true, itemIndex: index });
  };
  
  const handleBatchSelectionConfirm = (selections: { batchId: string; loteId: string; quantity: number }[]) => {
    if (batchSelectorState.itemIndex === null) return;
  
    const totalQuantity = selections.reduce((sum, s) => sum + s.quantity, 0);
  
    form.setValue(`items.${batchSelectorState.itemIndex}.quantity`, totalQuantity, { shouldValidate: true });
    form.setValue(`items.${batchSelectorState.itemIndex}.manualBatches`, selections, { shouldValidate: true });
  
    setBatchSelectorState({ open: false, itemIndex: null });
    toast({ title: "Lotes Seleccionados", description: `Se asignaron ${totalQuantity} unidades desde ${selections.length} lote(s).` });
  };

  const dialogFilteredProducts = useMemo(() => {
    if (!availableProductsForMovement) return [];
    if (!dialogSearchTerm) return availableProductsForMovement;
    return availableProductsForMovement.filter(p => 
        p.name.toLowerCase().includes(dialogSearchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(dialogSearchTerm.toLowerCase())
    );
  }, [availableProductsForMovement, dialogSearchTerm]);

  const handleAddProductFromDialog = (product: Product) => {
    const quantity = dialogQuantities[product.id];
    
    if (!quantity || quantity <= 0) {
        toast({ variant: 'destructive', title: "Cantidad no válida", description: "Por favor, ingresa una cantidad mayor a 0." });
        return;
    }

    if (movementType === 'salida' && product.productType !== 'COMBO') {
        const availableStock = stockForSelectedDeposit.get(product.id) || 0;
        if (quantity > availableStock) {
            toast({
                variant: 'destructive',
                title: "Stock Insuficiente",
                description: `No puedes agregar ${quantity} ${product.unit}. Solo hay ${availableStock} disponibles.`,
            });
            return;
        }
    }
    
    append({ productId: product.id, quantity: quantity });
    toast({ title: "Producto Agregado", description: `${product.name} ha sido agregado al remito.` });
    setDialogQuantities(prev => ({...prev, [product.id]: 0}));
  };
  
  const handleScanSuccess = (barcode: string) => {
    setIsScannerOpen(false);
    
    const product = availableProductsForMovement.find(p => p.barcode === barcode);

    if (product) {
        setScannedProduct(product);
        setScannedQuantity(1); // Reset quantity for new scan
    } else {
        toast({
            variant: "destructive",
            title: "Producto no encontrado",
            description: "El código de barras no corresponde a un producto disponible para este depósito y tipo de movimiento.",
        });
    }
  };
  
  const handleAddScannedProduct = () => {
    if (!scannedProduct || scannedQuantity <= 0) {
        toast({
            variant: 'destructive',
            title: 'Cantidad no válida',
            description: 'Por favor, ingresa una cantidad mayor a 0.',
        });
        return;
    }

    const currentItems = form.getValues('items');
    const existingItemIndex = currentItems.findIndex(item => item.productId === scannedProduct.id);

    if (existingItemIndex > -1) {
        const newQuantity = currentItems[existingItemIndex].quantity + scannedQuantity;
        if (movementType === 'salida' && scannedProduct.productType !== 'COMBO') {
            const availableStock = stockForSelectedDeposit.get(scannedProduct.id) || 0;
            if (newQuantity > availableStock) {
                 toast({
                    variant: 'destructive',
                    title: 'Stock Insuficiente',
                    description: `No se puede agregar. Solicitados: ${newQuantity}, Disponibles: ${availableStock}.`,
                });
                return;
            }
        }
        form.setValue(`items.${existingItemIndex}.quantity`, newQuantity, { shouldValidate: true });
        toast({
            title: 'Cantidad Actualizada',
            description: `Se actualizó la cantidad de ${scannedProduct.name}.`,
        });

    } else {
        if (movementType === 'salida' && scannedProduct.productType !== 'COMBO') {
            const availableStock = stockForSelectedDeposit.get(scannedProduct.id) || 0;
            if (scannedQuantity > availableStock) {
                toast({
                    variant: 'destructive',
                    title: 'Stock Insuficiente',
                    description: `No puedes agregar ${scannedQuantity} ${scannedProduct.unit}. Solo hay ${availableStock} disponibles.`,
                });
                return;
            }
        }
        append({ productId: scannedProduct.id, quantity: scannedQuantity });
        toast({
            title: 'Producto Agregado',
            description: `${scannedQuantity} x ${scannedProduct.name} agregado al remito.`,
        });
    }
    
    setScannedProduct(null);
  };

  const onSubmit: SubmitHandler<MovementFormValues> = async (data) => {
    if (!firestore || !user || !productsMap.size || !collectionPrefix || !workspaceId) return;
    setIsSubmitting(true);
    
    const totalMovementValue = data.items.reduce((acc, item) => {
        const product = productsMap.get(item.productId);
        const price = product?.price || 0;
        return acc + (price * item.quantity);
    }, 0);

    try {
        await runTransaction(firestore, async (transaction) => {
            const movementDocRef = doc(collection(firestore, `${collectionPrefix}/stockMovements`));
            const counterRef = doc(firestore, `${collectionPrefix}/counters/remitoCounter`);
            const counterSnap = await transaction.get(counterRef);
            
            const lastNumber = counterSnap.exists() ? counterSnap.data().lastNumber : 0;
            const newRemitoNumber = lastNumber + 1;
            const formattedRemitoNumber = `R-${String(newRemitoNumber).padStart(5, '0')}`;
            
            let finalMovementItems: StockMovementItem[] = [];
            // 1. Collect all affected simple product IDs
            const affectedProductIds = new Set<string>();
            for (const item of data.items) {
                const product = productsMap.get(item.productId);
                if (product?.productType === 'COMBO') {
                    product.components?.forEach(c => affectedProductIds.add(c.productId));
                } else {
                    affectedProductIds.add(item.productId);
                }
            }

            // 2. Read current product data for affected products to get minStock and current totalStock
            const productDocsMap = new Map<string, any>();
            for (const id of affectedProductIds) {
                const pRef = doc(firestore, `${collectionPrefix}/products`, id);
                const pSnap = await transaction.get(pRef);
                if (pSnap.exists()) {
                    productDocsMap.set(id, { id, ...pSnap.data() });
                }
            }

            // Delta tracking for real-time update
            const deltas = new Map<string, number>();

            for (const formItem of data.items) {
                const product = productsMap.get(formItem.productId);
                if (!product) throw new Error(`Producto con ID ${formItem.productId} no encontrado.`);

                if (product.productType === 'COMBO') {
                    if (data.type === 'entrada') throw new Error('No se pueden registrar entradas de productos tipo "Combo".');
                    if (!product.components?.length) throw new Error(`El combo "${product.name}" no tiene componentes.`);

                    for (const component of product.components) {
                        const componentProduct = productsMap.get(component.productId);
                        if (!componentProduct) throw new Error(`Componente con ID ${component.productId} no encontrado.`);

                        const quantityToDeduct = formItem.quantity * component.quantity;
                        const componentStockDocId = `${component.productId}_${data.depositId}`;
                        const componentStockRef = doc(firestore, `${collectionPrefix}/inventory/${componentStockDocId}`);
                        
                        transaction.set(componentStockRef, { 
                            quantity: increment(-quantityToDeduct),
                            productId: component.productId,
                            depositId: data.depositId,
                            workspaceId,
                            updatedAt: serverTimestamp()
                        }, { merge: true });

                        // Track delta for product document
                        deltas.set(component.productId, (deltas.get(component.productId) || 0) - quantityToDeduct);

                        const price = componentProduct.price || 0;
                        finalMovementItems.push({
                            productId: componentProduct.id,
                            productName: `${componentProduct.name} (de: ${product.name})`,
                            quantity: quantityToDeduct,
                            unit: componentProduct.unit,
                            price,
                            total: price * quantityToDeduct,
                        });
                    }
                } else { // Product is SIMPLE
                    const inventoryDocId = `${formItem.productId}_${data.depositId}`;
                    const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${inventoryDocId}`);
                    const movementQty = data.type === 'entrada' ? formItem.quantity : -formItem.quantity;

                    transaction.set(stockDocRef, { 
                        quantity: increment(movementQty), 
                        lastUpdated: serverTimestamp(), 
                        productId: formItem.productId, 
                        depositId: data.depositId,
                        workspaceId,
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    // Track delta for product document
                    deltas.set(formItem.productId, (deltas.get(formItem.productId) || 0) + movementQty);

                    if (product.trackingType === 'BATCH_AND_EXPIRY') {
                        if (data.type === 'entrada') {
                            if (!formItem.loteId || !formItem.expirationDate) throw new Error(`El producto ${product.name} requiere lote y fecha de vencimiento.`);
                            const batchRef = doc(collection(firestore, `${collectionPrefix}/batches`));
                            transaction.set(batchRef, {
                                id: batchRef.id, productId: formItem.productId, depositId: data.depositId, loteId: formItem.loteId,
                                quantity: formItem.quantity, expirationDate: formItem.expirationDate, createdAt: serverTimestamp(), workspaceId: workspaceId,
                            });
                        } else { // Salida de producto SIMPLE con lotes
                            if (formItem.manualBatches && formItem.manualBatches.length > 0) {
                                for (const selection of formItem.manualBatches) {
                                    const batchRef = doc(firestore, `${collectionPrefix}/batches`, selection.batchId);
                                    const batchSnap = await transaction.get(batchRef);
                                    if (!batchSnap.exists() || batchSnap.data()!.quantity < selection.quantity) throw new Error(`Stock insuficiente para el lote ${selection.loteId}.`);
                                    transaction.update(batchRef, { quantity: increment(-selection.quantity) });
                                }
                            } else {
                                let quantityToDeduct = formItem.quantity;
                                const availableBatchesQuery = query(
                                    collection(firestore, `${collectionPrefix}/batches`),
                                    where('depositId', '==', data.depositId), where('productId', '==', formItem.productId),
                                    where('quantity', '>', 0), orderBy('expirationDate', 'asc')
                                );
                                const availableBatchesSnap = await getDocs(availableBatchesQuery);
                                
                                for (const batchDoc of availableBatchesSnap.docs) {
                                    if (quantityToDeduct <= 0) break;
                                    const batchData = batchDoc.data();
                                    const deductFromThisBatch = Math.min(batchData.quantity, quantityToDeduct);
                                    transaction.update(batchDoc.ref, { quantity: increment(-deductFromThisBatch) });
                                    quantityToDeduct -= deductFromThisBatch;
                                }
                                if (quantityToDeduct > 0) throw new Error(`Stock de lotes insuficiente para ${product.name}.`);
                            }
                        }
                    }

                    const price = product.price || 0;
                    finalMovementItems.push({
                        productId: formItem.productId, 
                        productName: product.name, 
                        quantity: formItem.quantity, 
                        unit: product.unit,
                        price: price, 
                        total: price * formItem.quantity, 
                        loteId: formItem.loteId || null, 
                        expirationDate: formItem.expirationDate || null,
                    });
                }
            }

            // 3. Update Product documents with new totalStock and status
            for (const [productId, delta] of deltas.entries()) {
                const productData = productDocsMap.get(productId);
                if (!productData) continue;

                const currentTotal = productData.totalStock || 0;
                const newTotal = currentTotal + delta;
                const minStock = productData.minStock || 0;

                let newStatus: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
                if (newTotal <= 0) newStatus = 'out-of-stock';
                else if (newTotal < minStock) newStatus = 'low-stock';

                const pRef = doc(firestore, `${collectionPrefix}/products`, productId);
                transaction.update(pRef, {
                    totalStock: newTotal,
                    stockStatus: newStatus
                });
            }
            
            const deposit = deposits?.find((d) => d.id === data.depositId);
            let actorName: string | null = null, actorType: 'user' | 'supplier' | null = null, finalActorId = data.actorId;
    
            if (data.type === 'salida') {
              actorType = 'user'; 
              finalActorId = user.uid;
              actorName = `${currentUserProfile?.firstName || ''} ${currentUserProfile?.lastName || ''}`.trim() || user.email || user.uid;
            } else {
              actorType = 'supplier'; 
              const actor = suppliers?.find((s) => s.id === data.actorId);
              actorName = actor ? actor.name : 'N/A';
            }
            
            transaction.set(movementDocRef, {
              id: movementDocRef.id, 
              remitoNumber: data.remitoNumber || formattedRemitoNumber, 
              type: data.type, 
              depositId: data.depositId,
              depositName: deposit?.name || 'N/A', 
              actorId: finalActorId || null, 
              actorName: actorName || 'N/A', 
              actorType: finalActorId ? actorType : null,
              createdAt: serverTimestamp(), 
              userId: user.uid, 
              items: finalMovementItems, 
              totalValue: totalMovementValue,
              observation: data.observation || null,
            });
            transaction.set(counterRef, { lastNumber: newRemitoNumber }, { merge: true });
        });
        toast({ title: 'Movimiento Registrado', description: 'El remito ha sido registrado exitosamente.' });
        form.reset({
            type: 'salida', depositId: isJefeDeposito && deposits?.length === 1 ? deposits[0].id : '', remitoNumber: '', actorId: '', observation: '', items: [],
        });
    } catch(error: any) {
        console.error("Error en transacción de movimiento: ", error);
        toast({ variant: 'destructive', title: 'Error al registrar movimiento', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteMovement = (movement: StockMovement) => {
    if (!firestore || !collectionPrefix) return;
    
    let movementDocRef: any = doc(firestore, `${collectionPrefix}/stockMovements/${movement.id}`);
    
    runTransaction(firestore, async (transaction) => {
        for (const item of movement.items) {
          const inventoryDocId = `${item.productId}_${movement.depositId}`;
          const stockDocRef = doc(firestore, `${collectionPrefix}/inventory/${inventoryDocId}`);
          const change = movement.type === 'entrada' ? -item.quantity : item.quantity;
          transaction.set(stockDocRef, { quantity: increment(change), lastUpdated: serverTimestamp() }, { merge: true });
        }
        transaction.delete(movementDocRef);
    }).then(() => {
        toast({
            title: 'Remito Anulado',
            description: `El remito ${movement.remitoNumber} ha sido anulado y el stock ha sido revertido.`,
        });
    }).catch((error: any) => {
        const permissionError = new FirestorePermissionError({ path: movementDocRef.path, operation: 'delete' });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleExportToExcel = () => {
    const dataToExport = filteredMovements.flatMap(mov => 
        mov.items.map(item => ({
            'Fecha': format(mov.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: es }),
            'Remito Nº': mov.remitoNumber || '-',
            'Tipo': mov.type,
            'Depósito': mov.depositName,
            'Origen/Destino': mov.actorName || '-',
            'ID Usuario': mov.userId,
            'Producto (Nombre)': item.productName,
            'Producto (ID)': item.productId,
            'Cantidad': item.quantity,
            'Unidad': item.unit,
            'Precio Unitario': item.price,
            'Subtotal': item.total,
            'Valor Total Remito': mov.totalValue,
        }))
    );

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');
    XLSX.writeFile(workbook, 'Movimientos.xlsx');
  };

  const handleExportToPdf = () => {
    if (!filteredMovements || filteredMovements.length === 0) {
      toast({ variant: 'destructive', title: 'No hay datos', description: 'No hay movimientos filtrados para exportar.' }); return;
    }
    setIsGeneratingPdf(true);
    const docPdf = new jsPDF();
    const tableData = filteredMovements.flatMap(mov => 
      mov.items.map(item => [
        format(mov.createdAt.toDate(), 'dd/MM/yy', { locale: es }), mov.remitoNumber || '-', mov.type, item.productName,
        `${item.quantity} ${item.unit}`, mov.actorName || mov.userId, 
      ])
    );
    const appName = workspaceData?.name || workspaceData?.appName || 'Reporte de Movimientos';
    const date = format(new Date(), 'dd/MM/yyyy');
    docPdf.setFontSize(18); docPdf.text(appName, 14, 22);
    docPdf.setFontSize(11); docPdf.text('Reporte de Movimientos de Stock', 14, 30); docPdf.text(`Fecha: ${date}`, 150, 30);
    autoTable(docPdf, {
      startY: 35, head: [['Fecha', 'Remito Nº', 'Tipo', 'Producto', 'Cantidad', 'Actor/Usuario']],
      body: tableData, theme: 'grid', headStyles: { fillColor: [22, 160, 133] },
    });
    docPdf.save('Reporte_Movimientos.pdf');
    setIsGeneratingPdf(false);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  };
  
  const isDataLoading = isLoading || isLoadingMovements;
  
  if (isDataLoading && !movements) {
    return <MovementPageSkeleton />;
  }

  // Removed restrictve check that blocked non-managers from the entire page
  // if (!canManageMovements) { ... }

  return (
    <>
      {batchSelectorState.open && batchSelectorState.itemIndex !== null && (
        <SelectBatchDialog
          isOpen={batchSelectorState.open}
          onClose={() => setBatchSelectorState({ open: false, itemIndex: null })}
          onConfirm={handleBatchSelectionConfirm}
          productId={form.getValues(`items.${batchSelectorState.itemIndex}.productId`)}
          productName={productsMap.get(form.getValues(`items.${batchSelectorState.itemIndex}.productId`))?.name || null}
          depositId={selectedDepositId}
          workspaceId={workspaceId || null}
          totalNeeded={form.getValues(`items.${batchSelectorState.itemIndex}.quantity`)}
        />
      )}
      <div className="container mx-auto p-4 sm:p-6 md:p-8 space-y-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.movimientos.title}</h1>
          <p className="text-muted-foreground">{dictionary.pages.movimientos.description}</p>
        </div>
        <Tabs defaultValue={canManageMovements ? "create" : "history"}>
          <TabsList className={`grid w-full ${canManageMovements ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {canManageMovements && <TabsTrigger value="create">Registrar Nuevo Remito</TabsTrigger>}
            <TabsTrigger value="history">Historial de Remitos</TabsTrigger>
          </TabsList>
          {canManageMovements && (
            <TabsContent value="create">
              <Card>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardHeader>
                      <CardTitle>Registrar Nuevo Remito</CardTitle>
                      <CardDescription>Completa el formulario para registrar una entrada o salida.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <FormField control={form.control} name="type" render={({ field }) => (
                            <FormItem><FormLabel>Tipo</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="salida">Salida</SelectItem><SelectItem value="entrada">Entrada</SelectItem></SelectContent></Select></FormItem>
                        )}/>
                        <FormField control={form.control} name="depositId" render={({ field }) => (
                            <FormItem><FormLabel>Depósito</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isJefeDeposito && deposits?.length === 1}><FormControl><SelectTrigger><SelectValue placeholder="Selecciona un depósito" /></SelectTrigger></FormControl><SelectContent>{deposits?.sort((a, b) => a.name.localeCompare(b.name)).map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                        )}/>
                        {movementType === 'entrada' && (
                          <FormField control={form.control} name="actorId" render={({ field }) => (
                              <FormItem><FormLabel>Proveedor</FormLabel><Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger><SelectValue placeholder="Selecciona un proveedor"/></SelectTrigger></FormControl><SelectContent>{suppliers?.sort((a, b) => a.name.localeCompare(b.name)).map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent></Select></FormItem>
                          )}/>
                        )}
                        <FormField control={form.control} name="remitoNumber" render={({ field }) => (
                            <FormItem><FormLabel>Nº Remito (Auto)</FormLabel><FormControl><Input placeholder="Se genera automáticamente" {...field} disabled /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={form.control} name="observation" render={({ field }) => (
                            <FormItem className="sm:col-span-2 lg:col-span-4"><FormLabel>Observación</FormLabel><FormControl><Textarea placeholder="Notas adicionales sobre este movimiento..." {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                      </div>
                      <Separator />
                      <div>
                        <h3 className="text-lg font-medium mb-4">Productos del Remito</h3>
                          <div className="space-y-4">
                            {fields.map((item, index) => {
                              const product = productsMap.get(form.watch(`items.${index}.productId`));
                              const isTracked = product?.trackingType === 'BATCH_AND_EXPIRY';
                              return (
                                  <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 p-4 border rounded-md">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <FormField control={form.control} name={`items.${index}.productId`} render={({ field }) => (
                                              <FormItem className="sm:col-span-2"><FormLabel>Producto</FormLabel><ProductComboBox products={availableProductsForMovement} value={field.value} onChange={field.onChange} disabled={!selectedDepositId} noStockMessage={!selectedDepositId ? 'Selecciona un depósito' : 'Busca un producto'}/><FormMessage /></FormItem>
                                          )}/>
                                          {movementType === 'salida' && isTracked && product?.productType !== 'COMBO' ? (
                                            <FormItem>
                                                <FormLabel>Cantidad</FormLabel>
                                                <div className="flex items-center gap-2">
                                                    <FormControl>
                                                        <Input type="number" readOnly value={form.watch(`items.${index}.quantity`) || 0} />
                                                    </FormControl>
                                                    <Button type="button" variant="outline" onClick={() => openBatchSelector(index)}>Seleccionar Lotes</Button>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                          ) : (
                                            <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                                                <FormItem><FormLabel>Cantidad</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                                            )}/>
                                          )}
                                          {movementType === 'entrada' && isTracked && product?.productType !== 'COMBO' && (
                                              <>
                                                  <FormField control={form.control} name={`items.${index}.loteId`} render={({ field }) => (
                                                      <FormItem><FormLabel>Nº de Lote</FormLabel><FormControl><Input placeholder="Lote ABC-123" {...field}/></FormControl><FormMessage /></FormItem>
                                                  )}/>
                                                  <FormField control={form.control} name={`items.${index}.expirationDate`} render={({ field }) => (
                                                      <FormItem className="flex flex-col"><FormLabel>Fecha de Vencimiento</FormLabel>
                                                      <Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", {locale:es}) : <span>Elige una fecha</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover>
                                                      <FormMessage /></FormItem>
                                                  )}/>
                                              </>
                                          )}
                                      </div>
                                      <div className="flex items-start justify-end md:items-center">
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                      </div>
                                  </div>
                              );
                            })}
                          </div>
                        {form.formState.errors.items && (<p className="text-sm font-medium text-destructive mt-2">{ (form.formState.errors.items as any).root?.message}</p>)}
                      </div>
                    </CardContent>
                    <CardFooter className="flex items-center gap-4 flex-wrap">
                      <Button type="button" variant="outline" onClick={() => append({productId: '', quantity: 1})} disabled={!selectedDepositId} className="w-auto"><PlusCircle className="mr-2 h-4 w-4" />Añadir Producto</Button>
                      <Button type="button" variant="outline" onClick={() => setIsScannerOpen(true)} disabled={!selectedDepositId} className="w-auto"><ScanLine className="mr-2 h-4 w-4" />Escanear Producto</Button>
                      <Button type="submit" disabled={isSubmitting} className="w-auto">{isSubmitting && (<Loader2 className="mr-2 h-4 w-4 animate-spin" />)}Registrar Remito</Button>
                    </CardFooter>
                  </form>
                </Form>
              </Card>
          </TabsContent>
          )}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Historial de Movimientos</CardTitle>
                {isJefeDeposito ? (
                  <CardDescription>Solo se muestran los movimientos de tus depósitos asignados.</CardDescription>
                ) : isSolicitante ? (
                  <CardDescription>Se muestran tus solicitudes y los remitos de entrega realizados para ti.</CardDescription>
                ) : (
                  <CardDescription>Filtra y busca entre todos los remitos generados.</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                  <Input placeholder="Buscar por Nº Remito o producto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-grow"/>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos los tipos</SelectItem><SelectItem value="entrada">Entrada</SelectItem><SelectItem value="salida">Salida</SelectItem><SelectItem value="ajuste">Ajuste</SelectItem></SelectContent>
                  </Select>
                  <Select value={selectedDeposit} onValueChange={setSelectedDeposit} disabled={isJefeDeposito}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar por depósito" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos los depósitos</SelectItem>{deposits?.sort((a, b) => a.name.localeCompare(b.name)).map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={selectedActor} onValueChange={setSelectedActor}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar por actor" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos los actores</SelectItem>{allActorsForFilter.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button id="date" variant={"outline"} className={cn("w-full sm:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : (format(dateRange.from, "LLL dd, y"))) : (<span>Seleccionar rango de fechas</span>)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2}/></PopoverContent>
                  </Popover>
                   <Button onClick={handleExportToExcel} variant="outline" className="w-full sm:w-auto"><FileDown className="mr-2 h-4 w-4" />Excel</Button>
                  <Button onClick={handleExportToPdf} variant="outline" className="w-full sm:w-auto" disabled={isGeneratingPdf}>{isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}PDF</Button>
                </div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead><TableHead>Remito Nº</TableHead><TableHead>Tipo</TableHead><TableHead>Depósito</TableHead><TableHead>Origen/Destino</TableHead><TableHead>Observación</TableHead><TableHead>Productos</TableHead><TableHead className='text-right'>Valor Total</TableHead>
                        {(canManageMovements || isSolicitante) && (<TableHead className="text-right">Acciones</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isFetchingHistory ? (
                        <TableRow>
                          <TableCell colSpan={canManageMovements ? 9 : 8} className="h-24 text-center">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                            <span className="text-sm text-muted-foreground mt-2 block">Cargando movimientos...</span>
                          </TableCell>
                        </TableRow>
                      ) : (filteredMovements || [])?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={(canManageMovements || isSolicitante) ? 9 : 8} className="text-center h-24">
                            {isJefeDeposito && (!assignedDepositIds || assignedDepositIds.length === 0) 
                              ? "No tienes depósitos asignados para ver movimientos." 
                              : "No se encontraron movimientos con los filtros aplicados."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        (filteredMovements || []).map((mov) => (
                          <TableRow key={mov.id}>
                              <TableCell className="font-medium">{format(mov.createdAt.toDate(), 'PPpp', { locale: es })}</TableCell>
                              <TableCell className="font-mono">{mov.remitoNumber || '-'}</TableCell>
                              <TableCell><span className={`px-2 py-1 text-xs font-semibold rounded-full ${mov.type === 'entrada' ? 'bg-green-100 text-green-800' : mov.type === 'salida' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{mov.type.charAt(0).toUpperCase() + mov.type.slice(1)}</span></TableCell>
                              <TableCell>{mov.depositName}</TableCell><TableCell>{mov.actorName || '-'}</TableCell>
                              <TableCell className="max-w-[200px] truncate" title={mov.observation}>{mov.observation || '-'}</TableCell>
                              <TableCell>{mov.items.length}</TableCell>
                              <TableCell className="text-right font-medium">{mov.type === 'ajuste' && mov.items[0]?.quantity < 0 ? '-' : ''}{formatPrice(Math.abs(mov.totalValue || 0))}</TableCell>
                              {(canManageMovements || isSolicitante) && (
                                <TableCell className="text-right flex items-center justify-end gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => setSelectedMovementForDetail(mov)}
                                    title="Ver detalle"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <RemitoActions movement={mov} settings={pdfSettings} canDelete={isAdmin} onDelete={() => handleDeleteMovement(mov)}/>
                                </TableCell>
                              )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <BarcodeScanner 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScanSuccess={handleScanSuccess}
      />
      
      <Dialog open={!!scannedProduct} onOpenChange={() => setScannedProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Producto Escaneado: {scannedProduct?.name}</DialogTitle>
            <DialogDescription>
              Ingresa la cantidad que deseas agregar al remito.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-1">
                <Label htmlFor="quantity">Cantidad</Label>
                <Input 
                    id="quantity" 
                    type="number"
                    value={scannedQuantity}
                    onChange={(e) => setScannedQuantity(Number(e.target.value))}
                    min={1}
                />
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScannedProduct(null)}>Cancelar</Button>
            <Button onClick={handleAddScannedProduct}>Agregar al Remito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedMovementForDetail} onOpenChange={() => setSelectedMovementForDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del Remito {selectedMovementForDetail?.remitoNumber}</DialogTitle>
            <DialogDescription>
              {selectedMovementForDetail?.type === 'salida' ? 'Entrega de Productos' : selectedMovementForDetail?.type === 'entrada' ? 'Ingreso de Productos' : 'Ajuste de Stock'} - {selectedMovementForDetail && format(selectedMovementForDetail.createdAt.toDate(), 'PPpp', { locale: es })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Depósito</p>
                <p className="font-medium">{selectedMovementForDetail?.depositName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{selectedMovementForDetail?.type === 'entrada' ? 'Proveedor' : 'Solicitante'}</p>
                <p className="font-medium">{selectedMovementForDetail?.actorName || '-'}</p>
              </div>
              {selectedMovementForDetail?.observation && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Observación</p>
                  <p>{selectedMovementForDetail.observation}</p>
                </div>
              )}
            </div>
            <Separator />
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Unitario</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedMovementForDetail?.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                      <TableCell className="text-right">{formatPrice(item.price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPrice(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end pt-2">
              <p className="text-lg font-bold">Total: {formatPrice(selectedMovementForDetail?.totalValue || 0)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSelectedMovementForDetail(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function MovimientosPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const userDocRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [user, firestore]);
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userDocRef);

  const canAccessPage = useMemo(() => {
    if (!currentUserProfile?.role) return false;
    return ['administrador', 'editor', 'jefe_deposito', 'solicitante', 'visualizador'].includes(currentUserProfile.role);
  }, [currentUserProfile?.role]);

  if (isUserLoading || isLoadingProfile) { return <MovementPageSkeleton />; }

  if (!currentUserProfile || !canAccessPage) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8">
        <Card><CardHeader><CardTitle>Acceso Denegado</CardTitle><CardDescription>No tienes permisos para ver esta página.</CardDescription></CardHeader></Card>
      </div>
    );
  }

  return <MovimientosContent currentUserProfile={currentUserProfile} />;
}

    