export interface CreateOrderParams {
  maker: string;
  makingAmount: string;
  takingAmount: string;
  inputMint: string;
  outputMint: string;
  expiredAt?: number;
}

export interface CreateOrderResponse {
  orderId: string;
  transaction: string;
  requestId: string;
}

export interface TriggerOrder {
  id: string;
  maker: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  expiredAt: number | null;
  createdAt: string;
  status: 'active' | 'filled' | 'cancelled' | 'expired';
  signature?: string;
  filledAt?: string;
}

export interface GetOrdersResponse {
  orders: TriggerOrder[];
  hasMoreData: boolean;
}

export interface CancelOrderResponse {
  transaction: string;
  requestId: string;
}

export interface CancelOrdersResponse {
  transactions: string[];
  requestId: string;
}

export interface ExecuteResponse {
  signature: string;
  status: string;
}
