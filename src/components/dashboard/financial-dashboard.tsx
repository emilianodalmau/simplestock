
'use client';

import { useMemo } from 'react';
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
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import type { Product, Category, InventoryStock } from '@/types/inventory';
import { useI18n } from '@/i18n/i18n-provider';

interface FinancialDashboardProps {
  products: Product[];
  inventory: InventoryStock[];
  categories: Category[];
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe', '#00c49f', '#ffbb28'];

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(price);
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col space-y-1">
            <span className="text-muted-foreground">{payload[0].name}</span>
            <span className="font-bold">{formatPrice(payload[0].value)}</span>
             <span className="text-sm text-muted-foreground">
              {`${(payload[0].percent * 100).toFixed(2)}%`}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};


export function FinancialDashboard({
  products,
  inventory,
  categories,
}: FinancialDashboardProps) {
  const { dictionary } = useI18n();

  const financialData = useMemo(() => {
    if (!products || !inventory || !categories) {
      return { totalValue: 0, byCategory: [], topProducts: [] };
    }

    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));
    const stockMap = new Map<string, number>();

    for (const stockItem of inventory) {
      stockMap.set(
        stockItem.productId,
        (stockMap.get(stockItem.productId) || 0) + stockItem.quantity
      );
    }

    let totalValue = 0;
    const categoryValues: { [key: string]: number } = {};
    const productValues: { name: string; value: number }[] = [];

    for (const product of products) {
      const stock = stockMap.get(product.id) || 0;
      if (stock > 0 && !product.isArchived) {
        const value = stock * (product.costPrice || 0);
        totalValue += value;
        
        const categoryName = categoryMap.get(product.categoryId) || 'Sin Categoría';
        categoryValues[categoryName] = (categoryValues[categoryName] || 0) + value;

        productValues.push({ name: product.name, value });
      }
    }
    
    const byCategory = Object.keys(categoryValues).map((name) => ({
      name,
      value: categoryValues[name],
    })).sort((a,b) => b.value - a.value);

    const topProducts = productValues.sort((a, b) => b.value - a.value).slice(0, 3);

    return { totalValue, byCategory, topProducts };
  }, [products, inventory, categories]);

  return (
    <div className="space-y-8">
       <Card className="bg-primary/10 border-primary">
        <CardHeader>
          <CardTitle className="text-muted-foreground">{dictionary.pages.dashboard.inventoryCostTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold">{formatPrice(financialData.totalValue)}</p>
          <p className="text-sm text-muted-foreground">{dictionary.pages.dashboard.inventoryCostDescription}</p>
        </CardContent>
      </Card>
      
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle>Distribución por Categoría</CardTitle>
                <CardDescription>Valor del inventario agrupado por categoría.</CardDescription>
            </CardHeader>
            <CardContent>
                 <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={financialData.byCategory}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={120}
                            fill="#8884d8"
                            dataKey="value"
                            nameKey="name"
                        >
                            {financialData.byCategory.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{fontSize: "0.8rem"}}/>
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top 3 Productos</CardTitle>
            <CardDescription>Productos con mayor valor inmovilizado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {financialData.topProducts.map((product, index) => (
                        <TableRow key={index}>
                            <TableCell className="font-medium">{product.name}</TableCell>
                            <TableCell className="text-right">{formatPrice(product.value)}</TableCell>
                        </TableRow>
                    ))}
                    {financialData.topProducts.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={2} className="text-center text-muted-foreground h-24">
                                No hay productos con stock valorizado.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
