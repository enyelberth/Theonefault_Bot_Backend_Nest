export interface Order {
  orderId: number;
  price: string;
  origQty: string;
  timestamp: number;
  isSell?: boolean;
  orderListId?: number; // <- agregar aquí como opcional
}

export interface OrderLevel {
  id: number;
  price: number;
  quantity: number;
}