import { JupiterClient } from '../shared/jupiter-client';
import {
  CreateOrderParams,
  CreateOrderResponse,
  GetOrdersResponse,
  CancelOrderResponse,
  CancelOrdersResponse,
  ExecuteResponse,
} from './trigger.types';

export class TriggerApiService {
  private client: JupiterClient;

  constructor(client?: JupiterClient) {
    this.client = client ?? new JupiterClient();
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
    const response = await this.client.post<CreateOrderResponse>('/trigger/v1/createOrder', {
      payer: params.maker,
      maker: params.maker,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      params: {
        makingAmount: params.makingAmount,
        takingAmount: params.takingAmount,
        expiredAt: params.expiredAt,
      },
      computeUnitPrice: 'auto',
      wrapAndUnwrapSol: true,
    });

    return response;
  }

  async getOrders(
    walletAddress: string,
    status: 'active' | 'history',
    page: number = 1
  ): Promise<GetOrdersResponse> {
    const response = await this.client.get<GetOrdersResponse>('/trigger/v1/getTriggerOrders', {
      user: walletAddress,
      orderStatus: status,
      page,
    });

    return response;
  }

  async cancelOrder(maker: string, orderId: string): Promise<CancelOrderResponse> {
    const response = await this.client.post<CancelOrderResponse>('/trigger/v1/cancelOrder', {
      maker,
      order: orderId,
      computeUnitPrice: 'auto',
    });

    return response;
  }

  async cancelOrders(maker: string, orderIds: string[]): Promise<CancelOrdersResponse> {
    const response = await this.client.post<CancelOrdersResponse>('/trigger/v1/cancelOrders', {
      maker,
      orders: orderIds,
      computeUnitPrice: 'auto',
    });

    return response;
  }

  async execute(signedTransaction: string, requestId: string): Promise<ExecuteResponse> {
    const response = await this.client.post<ExecuteResponse>('/trigger/v1/execute', {
      signedTransaction,
      requestId,
    });

    return response;
  }
}
