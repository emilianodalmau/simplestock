
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, doc, where, query, getDocs, getCountFromServer, limit, startAfter, orderBy, increment, serverTimestamp } from 'firebase/firestore';
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
  totalStock?: number;
  stockStatus?: string;
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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
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

  // Pagination and Fetching State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<any>(null);
  const [firstVisibleDoc, setFirstVisibleDoc] = useState<any>(null);
  const [pageHistory, setPageHistory] = useState<any[]>([]); // To handle "Previous"
  const [totalCount, setTotalCount] = useState(0);
  const [pagedProducts, setPagedProducts] = useState<Product[]>([]);
  const [isFetching, setIsFetching] = useState(false);

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

  const categoriesCollection = useMemoFirebase(
    () => (firestore && collectionPrefix ? collection(firestore, `${collectionPrefix}/categories`) : null),
    [firestore, collectionPrefix]
  );
  const { data: categories, isLoading: isLoadingCategories } = useCollection<Category>(categoriesCollection);

  // Fetch Paged Products
  useEffect(() => {
    if (!firestore || !collectionPrefix) return;

    const fetchProducts = async () => {
      setIsFetching(true);
      try {
        const productsRef = collection(firestore, `${collectionPrefix}/products`);
        let baseQuery = query(productsRef, where('isArchived', '==', false));

        // Apply Status Filter
        if (selectedStatus !== 'all') {
            const statusMap: Record<StockStatus, string> = {
                'Sin Stock': 'out-of-stock',
                'Stock Bajo': 'low-stock',
                'En Stock': 'in-stock'
            };
            baseQuery = query(baseQuery, where('stockStatus', '==', statusMap[selectedStatus]));
        }

        // Apply Category Filter
        if (selectedCategory !== 'all') {
            baseQuery = query(baseQuery, where('categoryId', '==', selectedCategory));
        }

        // Apply Deposit Filter
        if (selectedDeposit !== 'all') {
            baseQuery = query(baseQuery, where('depositIds', 'array-contains', selectedDeposit));
        }

        // Apply Search (Prefix)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            // Assuming we added a 'name_lowercase' or similar if case-insensitivity is needed, 
            // but for now we'll use 'name' and assume users type correctly or we fix the data.
            // A better way is a 'searchKeywords' array, but let's stick to prefix for simplicity.
            baseQuery = query(baseQuery, 
                where('name', '>=', searchTerm), 
                where('name', '<=', searchTerm + '\uf8ff')
            );
        }

        // Apply Sort
        const sortField = sortConfig.key === 'productName' ? 'name' : 
                          sortConfig.key === 'totalStock' ? 'totalStock' : 
                          sortConfig.key === 'status' ? 'stockStatus' : 'name';
        
        const sortDirection = sortConfig.direction === 'ascending' ? 'asc' : 'desc';
        let finalQuery = query(baseQuery, orderBy(sortField, sortDirection as any));

        // Get Total Count (Only on first load or filter change)
        if (currentPage === 1) {
            const countSnapshot = await getCountFromServer(baseQuery);
            setTotalCount(countSnapshot.data().count);
        }

        // Pagination
        if (currentPage > 1 && lastVisibleDoc) {
            finalQuery = query(finalQuery, startAfter(lastVisibleDoc), limit(pageSize));
        } else {
            finalQuery = query(finalQuery, limit(pageSize));
        }

        const snapshot = await getDocs(finalQuery);
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        
        setPagedProducts(docs);
        setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1]);
        setFirstVisibleDoc(snapshot.docs[0]);
      } catch (error) {
        console.error("Error fetching inventory:", error);
      } finally {
        setIsFetching(false);
      }
    };

    fetchProducts();
  }, [firestore, collectionPrefix, selectedCategory, selectedStatus, searchTerm, sortConfig, currentPage, pageSize]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
    setLastVisibleDoc(null);
    setPageHistory([]);
  }, [selectedCategory, selectedStatus, searchTerm, sortConfig]);

  // We no longer fetch all inventory here. 
  const [productInventory, setProductInventory] = useState<InventoryStock[]>([]);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);

  // Fetch Detail Inventory when a product is selected
  useEffect(() => {
    if (!firestore || !collectionPrefix || !selectedProduct) {
        setProductInventory([]);
        return;
    }

    const fetchDetail = async () => {
        setIsFetchingDetail(true);
        try {
            const inventoryRef = collection(firestore, `${collectionPrefix}/inventory`);
            
            if (selectedProduct.productType === 'COMBO') {
                // For combos, we need inventory of ALL components
                const componentIds = selectedProduct.components?.map((c: any) => c.productId) || [];
                if (componentIds.length === 0) {
                    setProductInventory([]);
                    return;
                }
                const q = query(inventoryRef, where('productId', 'in', componentIds));
                const snap = await getDocs(q);
                setProductInventory(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryStock)));
            } else {
                const q = query(inventoryRef, where('productId', '==', selectedProduct.id));
                const snap = await getDocs(q);
                setProductInventory(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryStock)));
            }
        } catch (error) {
            console.error("Error fetching detail inventory:", error);
        } finally {
            setIsFetchingDetail(false);
        }
    };

    fetchDetail();
  }, [firestore, collectionPrefix, selectedProduct]);

  const { data: inventory, isLoading: isLoadingInventory } = { data: productInventory, isLoading: isFetchingDetail };

  const isLoading =
    isLoadingProfile ||
    isFetching ||
    isLoadingCategories ||
    isLoadingDeposits;
    
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
  }

  // Processed Data for the current page
  const processedInventoryData = useMemo(() => {
    if (!pagedProducts || !categories) return [];

    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));

    return pagedProducts.map((product) => {
      const statusMap: Record<string, StockStatus> = {
        'out-of-stock': 'Sin Stock',
        'low-stock': 'Stock Bajo',
        'in-stock': 'En Stock'
      };

      return {
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        categoryId: product.categoryId,
        categoryName: categoryMap.get(product.categoryId) || 'Sin categoría',
        totalStock: product.totalStock || 0,
        minStock: product.minStock || 0,
        totalValue: (product.price || 0) * (product.totalStock || 0),
        totalCost: (product.costPrice || 0) * (product.totalStock || 0),
        unit: product.unit,
        status: statusMap[product.stockStatus || 'in-stock'] || 'En Stock',
        productType: product.productType,
      };
    });
  }, [pagedProducts, categories]);

  // Memoize data for the detail modal, now with aggregation
  const productStockDetails = useMemo(() => {
    if (!selectedProduct || !deposits || !productInventory) {
      return [];
    }

    const depositMap = new Map(deposits.map((d) => [d.id, d.name]));
    
    // Aggregates stock by deposit
    const stockByDeposit = new Map<string, number>();

    if (selectedProduct.productType === 'COMBO') {
        // Calculate combo stock per deposit
        const componentsSnap = selectedProduct.components || [];
        // Map component stock per deposit: Map<depositId, Map<productId, quantity>>
        const componentStockByDeposit = new Map<string, Map<string, number>>();
        
        productInventory.forEach(stockItem => {
            if (!componentStockByDeposit.has(stockItem.depositId)) {
                componentStockByDeposit.set(stockItem.depositId, new Map());
            }
            componentStockByDeposit.get(stockItem.depositId)!.set(stockItem.productId, stockItem.quantity);
        });

        // For each deposit, calculate how many combos can be made
        deposits.forEach(deposit => {
            if (isJefeDeposito && deposit.id !== assignedDepositId) return;
            
            const depositStock = componentStockByDeposit.get(deposit.id);
            if (!depositStock) {
                stockByDeposit.set(deposit.id, 0);
                return;
            }

            let minKits = Infinity;
            componentsSnap.forEach((comp: any) => {
                const available = depositStock.get(comp.productId) || 0;
                const kits = Math.floor(available / comp.quantity);
                if (kits < minKits) minKits = kits;
            });
            
            if (minKits !== Infinity && minKits > 0) {
                stockByDeposit.set(deposit.id, minKits);
            }
        });

    } else {
        productInventory.forEach((stockItem) => {
            if (isJefeDeposito && stockItem.depositId !== assignedDepositId) {
                return;
            }
            const currentQuantity = stockByDeposit.get(stockItem.depositId) || 0;
            stockByDeposit.set(stockItem.depositId, currentQuantity + stockItem.quantity);
        });
    }

    // Create the final details array from the aggregated map
    return Array.from(stockByDeposit.entries())
      .filter(([_, qty]) => qty > 0) // Only show deposits with stock
      .map(([depositId, quantity]) => ({
        depositName: depositMap.get(depositId) || 'Depósito desconocido',
        quantity: `${quantity} ${selectedProduct?.unit || ''}`,
      }));
  }, [selectedProduct, productInventory, deposits, isJefeDeposito, assignedDepositId]);
  
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
                {deposits?.sort((a, b) => a.name.localeCompare(b.name)).map((dep) => (
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
                {categories?.sort((a, b) => a.name.localeCompare(b.name)).map((cat) => (
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
                    <TableRow 
                      key={item.productId} 
                      onClick={() => {
                        const product = pagedProducts.find(p => p.id === item.productId);
                        if (product) setSelectedProduct(product);
                      }} 
                      className="cursor-pointer"
                    >
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

          {/* Pagination Controls */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Mostrando {processedInventoryData.length} de {totalCount} productos
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newHistory = [...pageHistory];
                  const prevDoc = newHistory.pop();
                  setPageHistory(newHistory);
                  setLastVisibleDoc(prevDoc);
                  setCurrentPage(prev => Math.max(1, prev - 1));
                }}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPageHistory([...pageHistory, firstVisibleDoc]);
                  setCurrentPage(prev => prev + 1);
                }}
                disabled={processedInventoryData.length < pageSize}
              >
                Siguiente
              </Button>
            </div>
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

