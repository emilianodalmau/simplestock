
'use client';

import { useMemo, useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StockStatusBadge } from '@/components/ui/stock-status-badge';

// Data types from Firestore
type Product = {
  id: string;
  name: string;
  code: string;
  categoryId: string;
  minStock: number;
  unit: string;
};

type Category = {
  id: string;
  name: string;
};

type InventoryStock = {
  id: string;
  productId: string;
  quantity: number;
};

type StockStatus = 'En Stock' | 'Stock Bajo' | 'Sin Stock';

// Type for the combined data displayed in the table
type InventoryItem = {
  productId: string;
  productName: string;
  productCode: string;
  categoryName: string;
  totalStock: number;
  minStock: number;
  unit: string;
  status: StockStatus;
};

export default function InventarioPage() {
  const firestore = useFirestore();

  // State for filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<StockStatus | 'all'>('all');

  // Fetch all necessary collections
  const productsCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsCollection);

  const categoriesCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'categories') : null),
    [firestore]
  );
  const { data: categories, isLoading: isLoadingCategories } =
    useCollection<Category>(categoriesCollection);

  const inventoryCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'inventory') : null),
    [firestore]
  );
  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryCollection);

  const isLoading =
    isLoadingProducts || isLoadingCategories || isLoadingInventory;

  // Memoize the data processing logic, including filtering and searching
  const filteredInventoryData = useMemo(() => {
    if (!products || !categories || !inventory) {
      return [];
    }

    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));
    const stockMap = new Map<string, number>();
    for (const stockItem of inventory) {
      const currentStock = stockMap.get(stockItem.productId) || 0;
      stockMap.set(stockItem.productId, currentStock + stockItem.quantity);
    }

    const combinedData: InventoryItem[] = products.map((product) => {
      const totalStock = stockMap.get(product.id) || 0;
      const minStock = product.minStock;
      let status: StockStatus = 'En Stock';
      if (totalStock === 0) {
        status = 'Sin Stock';
      } else if (totalStock <= minStock) {
        status = 'Stock Bajo';
      }

      return {
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        categoryId: product.categoryId, // Keep id for filtering
        categoryName: categoryMap.get(product.categoryId) || 'Sin categoría',
        totalStock: totalStock,
        minStock: minStock,
        unit: product.unit,
        status: status,
      };
    });

    // Apply filters and search
    return combinedData.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' || item.categoryId === selectedCategory;
      const matchesStatus =
        selectedStatus === 'all' || item.status === selectedStatus;
      const matchesSearch =
        searchTerm === '' ||
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [
    products,
    categories,
    inventory,
    searchTerm,
    selectedCategory,
    selectedStatus,
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Inventario General</h1>
        <p className="text-muted-foreground">
          Filtra y busca para ver el estado del stock de todos los productos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado del Inventario</CardTitle>
          <CardDescription>
            Utiliza los filtros para refinar la búsqueda de productos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row">
            <Input
              placeholder="Buscar por nombre o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow"
            />
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              disabled={isLoadingCategories}
            >
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
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="En Stock">En Stock</SelectItem>
                <SelectItem value="Stock Bajo">Stock Bajo</SelectItem>
                <SelectItem value="Sin Stock">Sin Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Stock Total</TableHead>
                  <TableHead className="text-right">Stock Mínimo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-6 w-24 mx-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && filteredInventoryData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24">
                      No se encontraron productos con los filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  filteredInventoryData.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {item.productCode}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.categoryName}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {`${item.totalStock} ${item.unit}`}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {`${item.minStock} ${item.unit}`}
                      </TableCell>
                      <TableCell className="text-center">
                        <StockStatusBadge status={item.status} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

