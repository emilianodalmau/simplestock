

export type Product = {
  id: string;
  name: string;
  unit: string;
  code: string;
  barcode?: string;
  imageUrl?: string;
  price: number;
  costPrice: number;
  productType: 'SIMPLE' | 'COMBO';
  components?: {
    productId: string;
    quantity: number;
  }[];
  trackingType: 'NONE' | 'BATCH_AND_EXPIRY';
  isArchived?: boolean;
  depositIds?: string[];
  preferredLocations?: { [key: string]: string };
  createdAt: any; // Allow both Timestamp and string for flexibility
  categoryId: string;
  supplierId: string;
  minStock: number;
};

export type Deposit = {
  id: string;
  name: string;
  jefeId?: string;
};

export type Location = {
  id: string;
  code: string;
  name: string;
};

export type Supplier = {
  id: string;
  name: string;
};

export type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role?: 'administrador' | 'editor' | 'visualizador' | 'jefe_deposito' | 'solicitante' | 'super-admin' | 'vendedor';
  workspaceId?: string;
  photoURL?: string;
  phone?: string;
  address?: string;
  disabled?: boolean;
};

export type StockMovementItem = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  loteId?: string;
  expirationDate?: any;
};

export type StockMovement = {
  id: string;
  remitoNumber?: string;
  type: 'entrada' | 'salida' | 'ajuste';
  depositId: string;
  depositName: string;
  actorName?: string;
  actorId?: string;
  userId: string;
  createdAt: any; 
  items: StockMovementItem[];
  totalValue: number;
  status?: 'pendiente' | 'procesado' | 'cancelado';
  processedAt?: any;
  processedBy?: string;
  processedFromRequestId?: string;
};


export type InventoryStock = {
  id: string;
  productId: string;
  depositId: string;
  quantity: number;
};

export type Batch = {
  id: string;
  workspaceId: string;
  productId: string;
  depositId: string;
  quantity: number;
  loteId: string;
  expirationDate: any; 
  createdAt: any; 
};

export type RequestItem = {
    productId: string;
    productName: string;
    requested: number;
    inStock: number;
    unit: string;
    toDeliver: number;
}

export type Client = {
  id: string;
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
};

export type QuoteItem = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
};

export type Quote = {
  id: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  userId: string;
  userName: string;
  status: 'borrador' | 'enviado' | 'aprobado' | 'rechazado';
  createdAt: any;
  validUntil: any;
  items: QuoteItem[];
  totalValue: number;
};

export type Workspace = {
    id: string;
    name: string;
    language?: 'es' | 'en' | 'pt';
    showStockToRequesters?: boolean;
}

export type FeedbackTicket = {
    id: string;
    ticketNumber: string;
    workspaceId: string;
    workspaceName: string;
    userId: string;
    userName: string;
    userEmail: string;
    subject: string;
    message: string;
    type: 'error' | 'sugerencia' | 'upgrade' | 'consulta';
    impact: 'bloqueante' | 'idea';
    section: 'General' | 'Dashboard' | 'Inventario' | 'Movimientos' | 'Ajustes' | 'Productos' | 'Categorías' | 'Proveedores' | 'Clientes' | 'Depósitos' | 'Ubicaciones' | 'Usuarios' | 'Suscripción' | 'Configuración' | 'Otro';
    imageUrl?: string;
    status: 'nuevo' | 'visto' | 'en-progreso' | 'resuelto' | 'cerrado';
    createdAt: any;
    updatedAt: any;
};

export type FeedbackReply = {
    id: string;
    userId: string;
    userName: string;
    message: string;
    createdAt: any;
    isSuperAdminReply: boolean;
};
