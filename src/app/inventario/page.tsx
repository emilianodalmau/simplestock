'use client';

import { useMemo } from 'react';
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

// Type for the combined data displayed in the table
type InventoryItem = {
  productId: string;
  productName: string;
  productCode: string;
  categoryName: string;
  totalStock: number;
  minStock: number;
  unit: string;
  status: 'En Stock' | 'Stock Bajo' | 'Sin Stock';
};

export default function InventarioPage() {
  const firestore = useFirestore();

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
    
  const isLoading = isLoadingProducts || isLoadingCategories || isLoadingInventory;

  // Memoize the data processing logic
  const inventoryData = useMemo(() => {
    if (!products || !categories || !inventory) {
      return [];
    }

    // Create a map for quick category lookup
    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));

    // Create a map to aggregate stock for each product
    const stockMap = new Map<string, number>();
    for (const stockItem of inventory) {
      const currentStock = stockMap.get(stockItem.productId) || 0;
      stockMap.set(stockItem.productId, currentStock + stockItem.quantity);
    }

    // Combine all data into the final format
    const combinedData: InventoryItem[] = products.map((product) => {
      const totalStock = stockMap.get(product.id) || 0;
      const minStock = product.minStock;
      let status: 'En Stock' | 'Stock Bajo' | 'Sin Stock' = 'En Stock';
      if (totalStock === 0) {
        status = 'Sin Stock';
      } else if (totalStock <= minStock) {
        status = 'Stock Bajo';
      }

      return {
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        categoryName: categoryMap.get(product.categoryId) || 'Sin categoría',
        totalStock: totalStock,
        minStock: minStock,
        unit: product.unit,
        status: status,
      };
    });

    return combinedData;
  }, [products, categories, inventory]);

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Inventario General</h1>
        <p className="text-muted-foreground">
          Vista consolidada del stock de todos los productos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado del Inventario</CardTitle>
          <CardDescription>
            Aquí puedes ver el stock total de cada producto y su estado actual.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-6 w-24 mx-auto" /></TableCell>
                    </TableRow>
                  ))}
                {!isLoading && inventoryData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24">
                      No hay productos en el inventario.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  inventoryData.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-sm text-muted-foreground font-mono">{item.productCode}</div>
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
    