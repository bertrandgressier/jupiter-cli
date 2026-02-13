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
  id?: string;
  orderId?: string;
  orderKey?: string;
  userPubkey?: string;
  maker: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  remainingMakingAmount?: string;
  remainingTakingAmount?: string;
  expiredAt: number | null;
  createdAt: string;
  updatedAt?: string;
  status: 'active' | 'filled' | 'Completed' | 'cancelled' | 'expired';
  signature?: string;
  openTx?: string;
  closeTx?: string;
  filledAt?: string;
  inputSymbol?: string;
  outputSymbol?: string;
  trades?: TriggerOrderTrade[];
}

export interface TriggerOrderTrade {
  orderKey: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  txId: string;
  confirmedAt: string;
  action: string;
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
