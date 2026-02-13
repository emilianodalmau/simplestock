
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, doc, where, query } from 'firebase/firestore';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { ArrowUpDown, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/components/ui/badge';

// Data types from Firestore
type Product = {
  id: string;
  name: string;
  code: string;
  categoryId: string;
  minStock: number;
  unit: string;
  price: number;
  costPrice: number;
  depositIds?: string[];
  productType?: 'SIMPLE' | 'COMBO';
  components?: { productId: string; quantity: number }[];
};

type Category = {
  id: string;
  name: string;
};

type Deposit = {
  id: string;
  name: string;
  jefeId?: string;
};

type UserProfile = {
  id: string;
  role?: 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito';
  workspaceId?: string;
};

type InventoryStock = {
  id: string;
  productId: string;
  depositId: string;
  quantity: number;
};

type StockStatus = 'En Stock' | 'Stock Bajo' | 'Sin Stock';

// Type for the combined data displayed in the table
type InventoryItem = {
  productId: string;
  productName: string;
  productCode: string;
  categoryId: string;
  categoryName: string;
  totalStock: number;
  minStock: number;
  totalValue: number;
  totalCost: number;
  unit: string;
  status: StockStatus;
  productType?: 'SIMPLE' | 'COMBO';
};

type SortConfig = {
  key: keyof InventoryItem | null;
  direction: 'ascending' | 'descending';
};


export default function InventarioPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { dictionary } = useI18n();

  // State for filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDeposit, setSelectedDeposit] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<StockStatus | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'productName', direction: 'ascending' });


  // State for detail modal
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  
  const [assignedDepositId, setAssignedDepositId] = useState<string | null>(null);

  // --- Data Loading ---
  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(currentUserDocRef);
  
  const isJefeDeposito = currentUserProfile?.role === 'jefe_deposito';
  const workspaceId = currentUserProfile?.workspaceId;

  const collectionPrefix = useMemo(() => {
    if (!workspaceId) return null;
    return `workspaces/${workspaceId}`;
  }, [workspaceId]);

  const depositsCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/deposits`) : null),
    [firestore, collectionPrefix]
  );
  const { data: deposits, isLoading: isLoadingDeposits } = useCollection<Deposit>(depositsCollection);
  
  useEffect(() => {
    if (isJefeDeposito && deposits) {
      const assignedDeposit = deposits.find(d => d.jefeId === user?.uid);
      if (assignedDeposit) {
        setAssignedDepositId(assignedDeposit.id);
        setSelectedDeposit(assignedDeposit.id); // Pre-select the assigned deposit for 'jefe_deposito'
      }
    }
  }, [isJefeDeposito, deposits, user]);


  // Fetch all necessary collections
  const productsCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/products`) : null),
    [firestore, collectionPrefix]
  );
  const { data: products, isLoading: isLoadingProducts } =
    useCollection<Product>(productsCollection);

  const categoriesCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/categories`) : null),
    [firestore, collectionPrefix]
  );
  const { data: categories, isLoading: isLoadingCategories } =
    useCollection<Category>(categoriesCollection);

  const inventoryQuery = useMemoFirebase(() => {
    if (!firestore || !collectionPrefix) return null;
    
    // For 'jefe_deposito' with an assigned deposit, we can optimize the query
    if (isJefeDeposito && assignedDepositId) {
        return query(collection(firestore, `${collectionPrefix}/inventory`), where('depositId', '==', assignedDepositId));
    }
    
    // Admins/Editors/Viewers see all inventory. 'jefe_deposito' without an assigned deposit also fetches all to show an empty state.
    return collection(firestore, `${collectionPrefix}/inventory`);
  }, [firestore, collectionPrefix, isJefeDeposito, assignedDepositId]);

  const { data: inventory, isLoading: isLoadingInventory } =
    useCollection<InventoryStock>(inventoryQuery);

  const isLoading =
    isLoadingProfile ||
    isLoadingProducts ||
    isLoadingCategories ||
    isLoadingInventory ||
    isLoadingDeposits;
    
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  }

  // Memoize the data processing for the main table
  const processedInventoryData = useMemo(() => {
    if (!products || !categories || !inventory) {
      return [];
    }

    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));
    const productsMap = new Map(products.map((p) => [p.id, p]));
    const stockMap = new Map<string, number>();
    
    const relevantInventory = selectedDeposit === 'all' 
      ? inventory 
      : inventory.filter(stock => stock.depositId === selectedDeposit);

    for (const stockItem of relevantInventory) {
      const currentStock = stockMap.get(stockItem.productId) || 0;
      stockMap.set(stockItem.productId, currentStock + stockItem.quantity);
    }
    
    const productsInScope = selectedDeposit === 'all'
      ? products
      : products.filter(p => p.productType === 'COMBO' || p.depositIds?.includes(selectedDeposit));


    const combinedData: InventoryItem[] = productsInScope.map((product) => {
        let totalStock: number;
        let totalCost: number;
        let unit: string = product.unit;

        if (product.productType === 'COMBO') {
            let maxKits = Infinity;
            let componentsCost = 0;
            if (product.components && product.components.length > 0) {
                for (const component of product.components) {
                    const componentStock = stockMap.get(component.productId) || 0;
                    const possibleSets = Math.floor(componentStock / component.quantity);
                    if (possibleSets < maxKits) {
                        maxKits = possibleSets;
                    }
                    const componentProduct = productsMap.get(component.productId);
                    componentsCost += (componentProduct?.costPrice || 0) * component.quantity;
                }
            } else {
                maxKits = 0;
            }
            totalStock = maxKits === Infinity ? 0 : maxKits;
            totalCost = totalStock * componentsCost;
            unit = 'combo';
        } else {
            totalStock = stockMap.get(product.id) || 0;
            totalCost = (product.costPrice || 0) * totalStock;
        }

      const minStock = product.minStock;
      const totalValue = (product.price || 0) * totalStock;
      let status: StockStatus = 'En Stock';
      if (totalStock === 0) {
        status = 'Sin Stock';
      } else if (totalStock <= minStock && product.productType !== 'COMBO') { // Min stock alert doesn't apply to combos
        status = 'Stock Bajo';
      }

      return {
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        categoryId: product.categoryId,
        categoryName: categoryMap.get(product.categoryId) || 'Sin categoría',
        totalStock: totalStock,
        minStock: product.productType === 'COMBO' ? 0 : minStock,
        totalValue: totalValue,
        totalCost: totalCost,
        unit: unit,
        status: status,
        productType: product.productType,
      };
    });

    // Apply other filters and search
    let filteredData = combinedData.filter((item) => {
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

    // Apply sorting
    if (sortConfig.key !== null) {
      const statusOrder: Record<StockStatus, number> = {
        'Sin Stock': 1,
        'Stock Bajo': 2,
        'En Stock': 3,
      };

      filteredData.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];

        let comparison = 0;

        if (sortConfig.key === 'status') {
            comparison = statusOrder[aValue as StockStatus] - statusOrder[bValue as StockStatus];
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
            comparison = aValue - bValue;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
            comparison = aValue.localeCompare(bValue);
        }

        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }

    return filteredData;

  }, [
    products,
    categories,
    inventory,
    searchTerm,
    selectedCategory,
    selectedDeposit,
    selectedStatus,
    sortConfig,
  ]);

  // Memoize data for the detail modal, now with aggregation
  const productStockDetails = useMemo(() => {
    if (!selectedProduct || !inventory || !deposits) return [];

    if (selectedProduct.productType === 'COMBO') {
        const combo = products?.find(p => p.id === selectedProduct.productId);
        if (!combo || !combo.components) return [];

        const componentDetails = combo.components.map(comp => {
            const componentProduct = products?.find(p => p.id === comp.productId);
            const totalStock = Array.from(inventory.values())
                                    .filter(inv => inv.productId === comp.productId)
                                    .reduce((sum, inv) => sum + inv.quantity, 0);
            return {
                depositName: componentProduct?.name || 'Componente desconocido',
                quantity: `${totalStock} ${componentProduct?.unit || ''} (Req: ${comp.quantity} por combo)`
            };
        });
        return componentDetails;
    }
    
    // Non-jefes see all deposits, so we need the full deposit map.
    // Jefes only see their own deposit.
    const depositMap = new Map(deposits.map((dep) => [dep.id, dep.name]));

    const stockByDeposit = new Map<string, number>();

    // Filter and aggregate stock for the selected product
    inventory
      .filter((stock) => stock.productId === selectedProduct.productId)
      .forEach((stockItem) => {
        // If the user is a jefe, only include their assigned deposit.
        if (isJefeDeposito && stockItem.depositId !== assignedDepositId) {
            return;
        }
        const currentQuantity = stockByDeposit.get(stockItem.depositId) || 0;
        stockByDeposit.set(stockItem.depositId, currentQuantity + stockItem.quantity);
      });

    // Create the final details array from the aggregated map
    return Array.from(stockByDeposit.entries()).map(([depositId, quantity]) => ({
      depositName: depositMap.get(depositId) || 'Depósito desconocido',
      quantity: `${quantity} ${selectedProduct?.unit}`,
    }));
  }, [selectedProduct, inventory, deposits, isJefeDeposito, assignedDepositId, products]);
  
  const requestSort = (key: keyof InventoryItem) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: keyof InventoryItem) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-50" />;
    }
    if (sortConfig.direction === 'ascending') {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const handleExportToExcel = () => {
    const dataToExport = processedInventoryData.map(item => ({
      'Producto': item.productName,
      'Código': item.productCode,
      'Categoría': item.categoryName,
      'Stock Total': item.totalStock,
      'Unidad': item.unit,
      'Stock Mínimo': item.minStock,
      'Costo Total': item.totalCost,
      'Valor Total (Venta)': item.totalValue,
      'Estado': item.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
    XLSX.writeFile(workbook, `Inventario_${selectedDeposit === 'all' ? 'General' : deposits?.find(d => d.id === selectedDeposit)?.name || 'Filtrado'}.xlsx`);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">{dictionary.pages.inventario.title}</h1>
        <p className="text-muted-foreground">
          {isJefeDeposito ? dictionary.pages.inventario.jefe_description : dictionary.pages.inventario.general_description}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado del Inventario</CardTitle>
          <CardDescription>
            Utiliza los filtros para refinar la búsqueda de productos. Haz clic en una fila para ver el detalle por depósito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
            <Input
              placeholder="Buscar por nombre o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow"
            />
            <Select
              value={selectedDeposit}
              onValueChange={setSelectedDeposit}
              disabled={isLoadingDeposits || isJefeDeposito}
            >
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
            <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as StockStatus | 'all')}>
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
            <Button onClick={handleExportToExcel} variant="outline" className="w-full sm:w-auto">
              <FileDown className="mr-2 h-4 w-4" />
              Exportar a Excel
            </Button>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('productName')} className="group px-0">
                        Producto
                        {getSortIndicator('productName')}
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('categoryName')} className="group px-0">
                        Categoría
                        {getSortIndicator('categoryName')}
                        </Button>
                    </TableHead>
                    <TableHead className="text-right">
                        <Button variant="ghost" onClick={() => requestSort('totalStock')} className="group px-0">
                        Stock Total
                        {getSortIndicator('totalStock')}
                        </Button>
                    </TableHead>
                    <TableHead className="text-right">
                        <Button variant="ghost" onClick={() => requestSort('minStock')} className="group px-0">
                        Stock Mínimo
                        {getSortIndicator('minStock')}
                        </Button>
                    </TableHead>
                    <TableHead className="text-right">
                        <Button variant="ghost" onClick={() => requestSort('totalCost')} className="group px-0">
                        {dictionary.pages.inventario.totalCostHeader}
                        {getSortIndicator('totalCost')}
                        </Button>
                    </TableHead>
                    <TableHead className="text-right">
                        <Button variant="ghost" onClick={() => requestSort('totalValue')} className="group px-0">
                        Valor Total
                        {getSortIndicator('totalValue')}
                        </Button>
                    </TableHead>
                    <TableHead className="text-center">
                        <Button variant="ghost" onClick={() => requestSort('status')} className="group px-0">
                        Estado
                        {getSortIndicator('status')}
                        </Button>
                    </TableHead>
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
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-20 ml-auto" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-20 ml-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-6 w-24 mx-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && processedInventoryData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24">
                      { isJefeDeposito && !assignedDepositId ? "No tienes un depósito asignado." : "No se encontraron productos con los filtros aplicados." }
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  processedInventoryData.map((item) => (
                    <TableRow key={item.productId} onClick={() => setSelectedProduct(item)} className="cursor-pointer">
                      <TableCell>
                        <div className="font-medium flex items-center gap-2">
                            {item.productName}
                            {item.productType === 'COMBO' && <Badge variant="outline">Combo</Badge>}
                        </div>
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
                        {item.productType !== 'COMBO' ? `${item.minStock} ${item.unit}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(item.totalCost)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(item.totalValue)}
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
      
      {/* Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(isOpen) => !isOpen && setSelectedProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedProduct?.productName}</DialogTitle>
            <DialogDescription>
              {selectedProduct?.productType === 'COMBO' 
                ? `Desglose de componentes. Stock disponible para armar: ${selectedProduct?.totalStock}`
                : `Desglose de stock por depósito. Stock total: ${selectedProduct?.totalStock} ${selectedProduct?.unit}.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
             {productStockDetails.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{selectedProduct?.productType === 'COMBO' ? 'Componente' : 'Depósito'}</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {productStockDetails.map((detail, index) => (
                            <TableRow key={index}>
                                <TableCell className="font-medium">{detail.depositName}</TableCell>
                                <TableCell className="text-right">{detail.quantity}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
             ) : (
                <p className="text-center text-muted-foreground py-4">
                    Este producto no tiene stock registrado en ningún depósito.
                </p>
             )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

