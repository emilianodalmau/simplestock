
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  where,
  writeBatch,
  orderBy,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, Trash2, FileUp, FileDown, Info } from 'lucide-react';
import { MultiSelect, type Option } from '@/components/ui/multi-select';
import { Badge } from '@/components/ui/badge';
import * as XLSX from 'xlsx';
import { Checkbox } from '@/components/ui/checkbox';

const unitTypes = [
  'unidades',
  'litros',
  'kilos',
  'metros',
  'gramos',
  'cajas',
] as const;

const formSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  categoryId: z.string().min(1, { message: 'La categoría es requerida.' }),
  supplierId: z.string().min(1, { message: 'El proveedor es requerido.' }),
  price: z.coerce.number().min(0, { message: 'El precio no puede ser negativo.'}),
  minStock: z.coerce
    .number()
    .min(0, { message: 'El stock mínimo no puede ser negativo.' }),
  unit: z.enum(unitTypes, {
    required_error: 'El tipo de unidad es requerido.',
  }),
  depositIds: z.array(z.string()).min(1, { message: "Debe seleccionar al menos un depósito."}),
});

type FormValues = z.infer<typeof formSchema>;

type Category = {
  id: string;
  name: string;
};

type Supplier = {
  id: string;
  name: string;
};

type Deposit = {
    id: string;
    name: string;
}

type Product = {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  supplierId: string;
  price: number;
  minStock: number;
  unit: (typeof unitTypes)[number];
  isArchived?: boolean;
  depositIds?: string[];
  createdAt: any; // Used for client-side sorting
};

type Workspace = {
    subscription?: {
        limits?: {
            maxProducts?: number;
        }
    }
}

type UserProfile = {
  id: string;
  role?: 'administrador' | 'editor' | 'visualizador';
  workspaceId?: string;
};

const generateProductCode = (name: string): string => {
  const namePrefix = name.substring(0, 3).toUpperCase();
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  return `${namePrefix}-${randomNumber}`;
};

export default function ProductosPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  
  // State for filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [selectedDeposit, setSelectedDeposit] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState<(typeof unitTypes)[number] | 'all'>('all');
  
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();

  const userDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  const { data: currentUserProfile } = useDoc<UserProfile>(userDocRef);
  const workspaceId = currentUserProfile?.workspaceId;

  const workspaceDocRef = useMemoFirebase(
    () => (firestore && workspaceId ? doc(firestore, 'workspaces', workspaceId) : null),
    [firestore, workspaceId]
  );
  const { data: workspaceData } = useDoc<Workspace>(workspaceDocRef);

  const collectionPrefix = useMemo(() => {
      if (!workspaceId) return null;
      return `workspaces/${workspaceId}`;
  }, [workspaceId]);

  const categoriesCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? query(collection(firestore, `${collectionPrefix}/categories`)) : null),
    [firestore, collectionPrefix]
  );
  const { data: categories, isLoading: isLoadingCategories } =
    useCollection<Category>(categoriesCollection);

  const suppliersCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? query(collection(firestore, `${collectionPrefix}/suppliers`)) : null),
    [firestore, collectionPrefix]
  );
  const { data: suppliers, isLoading: isLoadingSuppliers } =
    useCollection<Supplier>(suppliersCollection);
    
  const depositsCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? query(collection(firestore, `${collectionPrefix}/deposits`)) : null),
    [firestore, collectionPrefix]
  );
  const { data: deposits, isLoading: isLoadingDeposits } =
    useCollection<Deposit>(depositsCollection);
    
  const depositOptions: Option[] = useMemo(() => {
    return deposits?.map(d => ({ value: d.id, label: d.name })) || [];
  }, [deposits]);

  const productsCollection = useMemoFirebase(
    () =>
      firestore && collectionPrefix
        ? query(
            collection(firestore, `${collectionPrefix}/products`),
            where('isArchived', '!=', true)
          )
        : null,
    [firestore, collectionPrefix]
  );
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsCollection);

  const productsLimit = workspaceData?.subscription?.limits?.maxProducts ?? 0;
  const productCount = products?.length ?? 0;
  const atLimit = productCount >= productsLimit;

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    const filtered = products.filter((product) => {
        const matchesSearch = searchTerm === '' ||
            product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.code.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesCategory = selectedCategory === 'all' || product.categoryId === selectedCategory;
        const matchesSupplier = selectedSupplier === 'all' || product.supplierId === selectedSupplier;
        const matchesDeposit = selectedDeposit === 'all' || product.depositIds?.includes(selectedDeposit);
        const matchesUnit = selectedUnit === 'all' || product.unit === selectedUnit;

        return matchesSearch && matchesCategory && matchesSupplier && matchesDeposit && matchesUnit;
    });

    // Sort by creation date on the client side
    return filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dateB - dateA;
    });

  }, [products, searchTerm, selectedCategory, selectedSupplier, selectedDeposit, selectedUnit]);


  const createForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      supplierId: '',
      price: 0,
      minStock: 0,
      unit: 'unidades',
      depositIds: [],
    },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    if (editingProduct) {
      editForm.reset({
        name: editingProduct.name,
        categoryId: editingProduct.categoryId,
        supplierId: editingProduct.supplierId,
        price: editingProduct.price || 0,
        minStock: editingProduct.minStock || 0,
        unit: editingProduct.unit,
        depositIds: editingProduct.depositIds || [],
      });
    }
  }, [editingProduct, editForm]);

  const onCreateSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore || !collectionPrefix) return;
    setIsSubmitting(true);
    try {
      const productCode = generateProductCode(data.name);
      await addDoc(collection(firestore, `${collectionPrefix}/products`), {
        ...data,
        code: productCode,
        isArchived: false,
        createdAt: serverTimestamp(),
      });
      toast({
        title: 'Producto Creado',
        description: `El producto "${data.name}" con código "${productCode}" ha sido agregado.`,
      });
      // Smart form reset
      createForm.reset({
        ...data, // Keep previous data
        name: '', // Clear only name
        price: 0,
        minStock: 0, // Reset minStock
        depositIds: [],
      });
    } catch (error) {
      console.error('Error creating product:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          'Ocurrió un error al crear el producto. Revisa los permisos.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEditSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!firestore || !editingProduct || !collectionPrefix) return;
    setIsEditSubmitting(true);
    try {
      const productRef = doc(firestore, `${collectionPrefix}/products`, editingProduct.id);
      await updateDoc(productRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      toast({
        title: 'Producto Actualizado',
        description: `El producto "${data.name}" ha sido actualizado.`,
      });
      setEditingProduct(null);
    } catch (error) {
      console.error('Error updating product:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al actualizar el producto.',
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleArchiveProduct = async (productId: string) => {
    if (!firestore || !collectionPrefix) return;
    try {
      await updateDoc(doc(firestore, `${collectionPrefix}/products`, productId), {
        isArchived: true
      });
      toast({
        title: 'Producto Archivado',
        description: 'El producto ha sido archivado y no aparecerá en nuevas transacciones.',
      });
    } catch (error) {
      console.error('Error archiving product:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al archivar el producto.',
      });
    }
  };
  
  const handleBulkArchive = async () => {
    if (!firestore || !collectionPrefix || selectedProducts.length === 0) return;
    
    const batch = writeBatch(firestore);
    selectedProducts.forEach(productId => {
        const productRef = doc(firestore, `${collectionPrefix}/products`, productId);
        batch.update(productRef, { isArchived: true });
    });

    try {
        await batch.commit();
        toast({
            title: 'Archivado Masivo Exitoso',
            description: `${selectedProducts.length} productos han sido archivados.`
        });
        setSelectedProducts([]); // Clear selection
    } catch(error) {
        console.error('Error during bulk archive:', error);
        toast({
            variant: 'destructive',
            title: 'Error de Archivado Masivo',
            description: 'No se pudieron archivar los productos seleccionados.',
        });
    }
  };

  const handleExportModel = () => {
    const modelData = [
      {
        nombre: 'Ejemplo: Martillo de Goma',
        categoria_nombre: 'Electrónica',
        proveedor_nombre: 'Proveedor de Ejemplo',
        precio: 1500.50,
        stock_minimo: 10,
        unidad: 'unidades (debe ser una de: unidades, litros, kilos, metros, gramos, cajas)',
        depositos_nombres: 'Depósito Central,Depósito Secundario',
      },
    ];
    const categoriesData = categories?.map(c => ({ ID: c.id, Nombre: c.name })) || [];
    const suppliersData = suppliers?.map(s => ({ ID: s.id, Nombre: s.name })) || [];
    const depositsData = deposits?.map(d => ({ ID: d.id, Nombre: d.name })) || [];

    const wb = XLSX.utils.book_new();
    const wsModel = XLSX.utils.json_to_sheet(modelData, { header: ['nombre', 'categoria_nombre', 'proveedor_nombre', 'precio', 'stock_minimo', 'unidad', 'depositos_nombres'] });
    const wsCategories = XLSX.utils.json_to_sheet(categoriesData);
    const wsSuppliers = XLSX.utils.json_to_sheet(suppliersData);
    const wsDeposits = XLSX.utils.json_to_sheet(depositsData);
    const wsHelp = XLSX.utils.json_to_sheet([
      { 'Instrucción': 'Complete la hoja "Modelo" con los datos de sus productos.'},
      { 'Instrucción': 'Utilice los NOMBRES de las otras hojas (Categorias, Proveedores, Depositos) para llenar las columnas correspondientes.' },
      { 'Instrucción': 'Para la columna "depositos_nombres", si un producto va en múltiples depósitos, separe los NOMBRES con una coma (sin espacios). Ej: Deposito A,Deposito B' },
      { 'Instrucción': 'La columna "unidad" debe contener uno de los siguientes valores exactos: unidades, litros, kilos, metros, gramos, cajas.'}
    ]);
    
    XLSX.utils.book_append_sheet(wb, wsModel, 'Modelo');
    XLSX.utils.book_append_sheet(wb, wsHelp, 'Ayuda');
    XLSX.utils.book_append_sheet(wb, wsCategories, 'Categorias');
    XLSX.utils.book_append_sheet(wb, wsSuppliers, 'Proveedores');
    XLSX.utils.book_append_sheet(wb, wsDeposits, 'Depositos');
    
    XLSX.writeFile(wb, 'Modelo_Importacion_Productos.xlsx');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!firestore || !collectionPrefix || !categories || !suppliers || !deposits) {
        toast({
            variant: 'destructive',
            title: 'Datos no cargados',
            description: 'Espera a que todos los datos de la página se carguen antes de importar.',
        });
        return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
        const supplierMap = new Map(suppliers.map(s => [s.name.toLowerCase(), s.id]));
        const depositMap = new Map(deposits.map(d => [d.name.toLowerCase(), d.id]));

        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (json.length === 0) {
          throw new Error("El archivo está vacío o no tiene datos.");
        }
        
        const batch = writeBatch(firestore);
        let productsCreated = 0;

        for (const [index, row] of json.entries()) {
          const rowNum = index + 2; // +1 for header, +1 for 0-index

          const categoryId = categoryMap.get(String(row.categoria_nombre).toLowerCase());
          if (!categoryId) throw new Error(`Fila ${rowNum}: No se encontró la categoría '${row.categoria_nombre}'.`);

          const supplierId = supplierMap.get(String(row.proveedor_nombre).toLowerCase());
          if (!supplierId) throw new Error(`Fila ${rowNum}: No se encontró el proveedor '${row.proveedor_nombre}'.`);
          
          const depositNames = String(row.depositos_nombres).split(',');
          const depositIds = depositNames.map(name => {
              const id = depositMap.get(name.trim().toLowerCase());
              if (!id) throw new Error(`Fila ${rowNum}: No se encontró el depósito '${name.trim()}'.`);
              return id;
          });

          const newProductRef = doc(collection(firestore, `${collectionPrefix}/products`));
          batch.set(newProductRef, {
            name: row.nombre,
            categoryId: categoryId,
            supplierId: supplierId,
            price: Number(row.precio),
            minStock: Number(row.stock_minimo),
            unit: row.unidad,
            depositIds: depositIds,
            code: generateProductCode(row.nombre),
            isArchived: false,
            createdAt: serverTimestamp(),
          });
          productsCreated++;
        }
        
        await batch.commit();

        toast({
          title: 'Importación Completa',
          description: `Se han creado ${productsCreated} productos nuevos.`,
        });

      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error de Importación',
          description: error.message || 'No se pudieron importar los productos. Revisa el formato del archivo.',
        });
      } finally {
        setIsImporting(false);
        // Reset file input
        if (importFileRef.current) {
          importFileRef.current.value = '';
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };


  const canManageProducts =
    currentUserProfile?.role === 'administrador' ||
    currentUserProfile?.role === 'editor';
    
  const depositMap = useMemo(() => {
    return new Map(deposits?.map(d => [d.id, d.name]));
  }, [deposits]);

  const getCategoryName = (categoryId: string) => {
    return categories?.find((c) => c.id === categoryId)?.name || 'N/A';
  };

  const getSupplierName = (supplierId: string) => {
    return suppliers?.find((s) => s.id === supplierId)?.name || 'N/A';
  };

  const isLoading = isLoadingProducts || isLoadingCategories || isLoadingSuppliers || isLoadingDeposits;
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  }
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(filteredProducts.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSelectProduct = (productId: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts(prev => [...prev, productId]);
    } else {
      setSelectedProducts(prev => prev.filter(id => id !== productId));
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Productos</h1>
        <p className="text-muted-foreground">
          Administra los productos del inventario.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {canManageProducts && (
          <Card>
            <CardHeader>
              <CardTitle>Agregar Nuevo Producto</CardTitle>
            </CardHeader>
            <CardContent>
              {atLimit && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Has alcanzado el límite de {productsLimit} productos para tu plan actual. Para agregar más, considera actualizar tu plan.
                  </AlertDescription>
                </Alert>
              )}
              <Form {...createForm}>
                <form
                  onSubmit={createForm.handleSubmit(onCreateSubmit)}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <FormField
                      control={createForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre del Producto</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ej: Martillo de Goma"
                              {...field}
                              disabled={atLimit}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Categoría</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={atLimit}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona una categoría" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isLoadingCategories ? (
                                <SelectItem value="loading" disabled>
                                  Cargando...
                                </SelectItem>
                              ) : (
                                categories?.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="supplierId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Proveedor</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={atLimit}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona un proveedor" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isLoadingSuppliers ? (
                                <SelectItem value="loading" disabled>
                                  Cargando...
                                </SelectItem>
                              ) : (
                                suppliers?.map((sup) => (
                                  <SelectItem key={sup.id} value={sup.id}>
                                    {sup.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="depositIds"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Depósitos Asignados</FormLabel>
                            <MultiSelect 
                                options={depositOptions}
                                selected={field.value}
                                onChange={field.onChange}
                            />
                            <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={createForm.control}
                      name="unit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Unidad</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={atLimit}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona una unidad" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {unitTypes.map((unit) => (
                                <SelectItem key={unit} value={unit}>
                                  {unit.charAt(0).toUpperCase() + unit.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={createForm.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Precio</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Ej: 1500.50" {...field} disabled={atLimit}/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="minStock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stock Mínimo</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Ej: 10" {...field} disabled={atLimit}/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="submit"
                      disabled={isSubmitting || atLimit}
                      className="w-full sm:w-auto"
                    >
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Agregar Producto
                    </Button>
                    <div className="flex gap-2">
                        <Button onClick={handleExportModel} variant="outline" type="button">
                          <FileUp className="mr-2 h-4 w-4" />
                          Exportar Modelo
                        </Button>
                        <Button
                          onClick={() => importFileRef.current?.click()}
                          variant="outline"
                          type="button"
                          disabled={isImporting}
                        >
                          {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileDown className="mr-2 h-4 w-4" />}
                          Importar Productos
                        </Button>
                         <input
                          type="file"
                          ref={importFileRef}
                          onChange={handleImport}
                          className="hidden"
                          accept=".xlsx, .xls"
                        />
                      </div>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Lista de Productos</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                    <Input
                        placeholder="Buscar por nombre o código..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-grow"
                    />
                     <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isLoadingCategories}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue placeholder="Filtrar por categoría" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las categorías</SelectItem>
                            {categories?.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                     <Select value={selectedSupplier} onValueChange={setSelectedSupplier} disabled={isLoadingSuppliers}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue placeholder="Filtrar por proveedor" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los proveedores</SelectItem>
                            {suppliers?.map((sup) => (
                            <SelectItem key={sup.id} value={sup.id}>
                                {sup.name}
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={selectedDeposit} onValueChange={setSelectedDeposit} disabled={isLoadingDeposits}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue placeholder="Filtrar por depósito" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los depósitos</SelectItem>
                            {deposits?.map((dep) => (
                            <SelectItem key={dep.id} value={dep.id}>
                                {dep.name}
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                     <Select value={selectedUnit} onValueChange={(value) => setSelectedUnit(value as any)}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                            <SelectValue placeholder="Filtrar por unidad" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las unidades</SelectItem>
                            {unitTypes.map(unit => (
                                <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {selectedProducts.length > 0 && canManageProducts && (
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    <Trash2 className="mr-2 h-4 w-4"/>
                                    Archivar ({selectedProducts.length})
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Estás seguro de archivar los productos seleccionados?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción no se puede deshacer. Se archivarán {selectedProducts.length} productos.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleBulkArchive} className="bg-destructive hover:bg-destructive/90">
                                        Sí, archivar
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                         <Checkbox
                            checked={selectedProducts.length > 0 && selectedProducts.length === filteredProducts.length}
                            onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                            aria-label="Seleccionar todo"
                         />
                      </TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Depósitos</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Stock Mínimo</TableHead>
                      {canManageProducts && (
                        <TableHead className="text-right">Acciones</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading &&
                      [...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-5"/></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          {canManageProducts && (
                            <TableCell><Skeleton className="ml-auto h-8 w-20" /></TableCell>
                          )}
                        </TableRow>
                      ))}
                    {!isLoading && filteredProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canManageProducts ? 10 : 9} className="text-center">
                          No hay productos que coincidan con los filtros aplicados.
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading &&
                      filteredProducts.map((product) => (
                        <TableRow key={product.id} data-state={selectedProducts.includes(product.id) ? "selected" : ""}>
                          <TableCell>
                            <Checkbox
                                checked={selectedProducts.includes(product.id)}
                                onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                                aria-label={`Seleccionar producto ${product.name}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono">{product.code}</TableCell>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell className="text-muted-foreground">{getCategoryName(product.categoryId)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                                {product.depositIds?.map(id => (
                                    <Badge key={id} variant="secondary">{depositMap.get(id) || 'N/A'}</Badge>
                                )) || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{getSupplierName(product.supplierId)}</TableCell>
                          <TableCell className="text-muted-foreground">{product.unit}</TableCell>
                          <TableCell className="text-muted-foreground font-medium">{formatPrice(product.price)}</TableCell>
                          <TableCell className="text-muted-foreground">{product.minStock}</TableCell>
                          {canManageProducts && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingProduct(product)}
                              >
                                <Edit className="h-4 w-4" />
                                <span className="sr-only">Editar</span>
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    <span className="sr-only">Archivar</span>
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      ¿Estás seguro de archivar este producto?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no eliminará el producto, pero lo ocultará de las listas y no podrá ser usado en nuevos movimientos. El historial existente no se verá afectado.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleArchiveProduct(product.id)
                                      }
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Archivar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Product Dialog */}
      <Dialog
        open={!!editingProduct}
        onOpenChange={(isOpen) => !isOpen && setEditingProduct(null)}
      >
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
            <DialogDescription>
              Modifica los detalles del producto.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Producto</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proveedor</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un proveedor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers?.map((sup) => (
                          <SelectItem key={sup.id} value={sup.id}>
                            {sup.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={editForm.control}
                name="depositIds"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                      <FormLabel>Depósitos Asignados</FormLabel>
                      <MultiSelect 
                          options={depositOptions}
                          selected={field.value}
                          onChange={field.onChange}
                      />
                      <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Unidad</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una unidad" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {unitTypes.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit.charAt(0).toUpperCase() + unit.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="minStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Mínimo</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={isEditSubmitting}>
                  {isEditSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
