
export type Product = {
  id: string;
  name: string;
  unit: string;
  code: string;
  price: number;
  isArchived?: boolean;
};

export type Deposit = {
  id: string;
  name: string;
  jefeId?: string;
};

export type Supplier = {
  id: string;
  name: string;
};

export type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  role?: 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'solicitante';
  workspaceId?: string;
};

export type StockMovementItem = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
};

export type StockMovement = {
  id: string;
  remitoNumber?: string;
  type: 'entrada' | 'salida';
  depositId: string;
  depositName: string;
  actorName?: string;
  actorId?: string;
  userId: string;
  createdAt: {
    toDate: () => Date;
  };
  items: StockMovementItem[];
  totalValue: number;
};

export type InventoryStock = {
  id: string;
  productId: string;
  depositId: string;
  quantity: number;
};

export type RequestItem = {
    productId: string;
    productName: string;
    requested: number;
    inStock: number;
    unit: string;
    toDeliver: number;
}
