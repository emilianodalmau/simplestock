
'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, Trash2, FileUp } from 'lucide-react';
import { MultiSelect, type Option } from '@/components/ui/multi-select';
import { Badge } from '@/components/ui/badge';
import * as XLSX from 'xlsx';

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
};

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
    () => (firestore && collectionPrefix ? query(collection(firestore, `${collectionPrefix}/products`), where('isArchived', '!=', true)) : null),
    [firestore, collectionPrefix]
  );
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsCollection);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter((product) => {
        const matchesSearch = searchTerm === '' ||
            product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.code.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesCategory = selectedCategory === 'all' || product.categoryId === selectedCategory;
        const matchesSupplier = selectedSupplier === 'all' || product.supplierId === selectedSupplier;
        const matchesDeposit = selectedDeposit === 'all' || product.depositIds?.includes(selectedDeposit);
        const matchesUnit = selectedUnit === 'all' || product.unit === selectedUnit;

        return matchesSearch && matchesCategory && matchesSupplier && matchesDeposit && matchesUnit;
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

  const handleExportModel = () => {
    const modelData = [
      {
        nombre: 'Ejemplo: Martillo de Goma',
        categoria_id: 'ID de la categoría (ver hoja de ayuda)',
        proveedor_id: 'ID del proveedor (ver hoja de ayuda)',
        precio: 1500.50,
        stock_minimo: 10,
        unidad: 'unidades (debe ser una de: unidades, litros, kilos, metros, gramos, cajas)',
        depositos_ids: 'ID1,ID2,ID3 (separados por comas)',
      },
    ];
    const categoriesData = categories?.map(c => ({ ID: c.id, Nombre: c.name })) || [];
    const suppliersData = suppliers?.map(s => ({ ID: s.id, Nombre: s.name })) || [];
    const depositsData = deposits?.map(d => ({ ID: d.id, Nombre: d.name })) || [];

    const wb = XLSX.utils.book_new();
    const wsModel = XLSX.utils.json_to_sheet(modelData, { header: ['nombre', 'categoria_id', 'proveedor_id', 'precio', 'stock_minimo', 'unidad', 'depositos_ids'] });
    const wsCategories = XLSX.utils.json_to_sheet(categoriesData);
    const wsSuppliers = XLSX.utils.json_to_sheet(suppliersData);
    const wsDeposits = XLSX.utils.json_to_sheet(depositsData);
    const wsHelp = XLSX.utils.json_to_sheet([
      { 'Instrucción': 'Complete la hoja "Modelo" con los datos de sus productos.'},
      { 'Instrucción': 'Utilice los IDs de las otras hojas (Categorias, Proveedores, Depositos) para llenar las columnas correspondientes.' },
      { 'Instrucción': 'Para la columna "depositos_ids", si un producto va en múltiples depósitos, separe los IDs con una coma (sin espacios). Ej: id_deposito_1,id_deposito_2' },
      { 'Instrucción': 'La columna "unidad" debe contener uno de los siguientes valores exactos: unidades, litros, kilos, metros, gramos, cajas.'}
    ]);
    
    XLSX.utils.book_append_sheet(wb, wsModel, 'Modelo');
    XLSX.utils.book_append_sheet(wb, wsHelp, 'Ayuda');
    XLSX.utils.book_append_sheet(wb, wsCategories, 'Categorias');
    XLSX.utils.book_append_sheet(wb, wsSuppliers, 'Proveedores');
    XLSX.utils.book_append_sheet(wb, wsDeposits, 'Depositos');
    
    XLSX.writeFile(wb, 'Modelo_Importacion_Productos.xlsx');
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

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
        <p className="text-muted-foreground">
          Administra los productos del inventario.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {canManageProducts && (
          <Card>
            <CardHeader>
              <CardTitle>Agregar Nuevo Producto</CardTitle>
              <CardDescription>
                Completa el formulario para añadir un producto.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                            <Input type="number" placeholder="Ej: 1500.50" {...field} />
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
                            <Input type="number" placeholder="Ej: 10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto"
                    >
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Agregar Producto
                    </Button>
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
                    {canManageProducts && (
                      <Button onClick={handleExportModel} variant="outline">
                        <FileUp className="mr-2 h-4 w-4" />
                        Exportar Modelo
                      </Button>
                    )}
                </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                          <TableCell>
                            <Skeleton className="h-4 w-20" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-40" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-48" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                           <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                           <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                          {canManageProducts && (
                            <TableCell>
                              <Skeleton className="ml-auto h-8 w-20" />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    {!isLoading && filteredProducts.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={canManageProducts ? 9 : 8}
                          className="text-center"
                        >
                          No hay productos que coincidan con los filtros aplicados.
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading &&
                      filteredProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-mono">
                            {product.code}
                          </TableCell>
                          <TableCell className="font-medium">
                            {product.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {getCategoryName(product.categoryId)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                                {product.depositIds?.map(id => (
                                    <Badge key={id} variant="secondary">{depositMap.get(id) || 'N/A'}</Badge>
                                )) || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {getSupplierName(product.supplierId)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {product.unit}
                          </TableCell>
                           <TableCell className="text-muted-foreground font-medium">
                            {formatPrice(product.price)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {product.minStock}
                          </TableCell>
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
