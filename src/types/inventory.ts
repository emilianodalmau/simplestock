
export type Product = {
  id: string;
  name: string;
  unit: string;
  code: string;
  price: number;
  isArchived?: boolean;
  depositIds?: string[];
  createdAt: any; // Allow both Timestamp and string for flexibility
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

// This type is adjusted to handle both server (string) and client (Date object) representations
export type StockMovement = {
  id: string;
  remitoNumber?: string;
  type: 'entrada' | 'salida' | 'ajuste';
  depositId: string;
  depositName: string;
  actorName?: string;
  actorId?: string;
  userId: string;
  createdAt: any; // Allow both Timestamp and string for flexibility
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
