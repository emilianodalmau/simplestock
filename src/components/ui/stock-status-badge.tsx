
import { Badge } from '@/components/ui/badge';

type StockStatus = 'En Stock' | 'Stock Bajo' | 'Sin Stock';

interface StockStatusBadgeProps {
  status: StockStatus;
}

export function StockStatusBadge({ status }: StockStatusBadgeProps) {
  const statusStyles: Record<
    StockStatus,
    { variant: 'default' | 'secondary' | 'destructive'; className: string }
  > = {
    'En Stock': {
      variant: 'default',
      className: 'bg-green-500 hover:bg-green-500/80 text-white',
    },
    'Stock Bajo': {
      variant: 'secondary',
      className: 'bg-yellow-500 hover:bg-yellow-500/80 text-black',
    },
    'Sin Stock': {
      variant: 'destructive',
      className: 'bg-red-600 hover:bg-red-600/80 text-white',
    },
  };

  const style = statusStyles[status];

  return (
    <Badge variant={style.variant} className={style.className}>
      {status}
    </Badge>
  );
}

    