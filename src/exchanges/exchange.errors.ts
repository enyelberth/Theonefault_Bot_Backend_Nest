export class ExchangeError extends Error {
  constructor(
    message: string,
    public readonly exchange: string,
    public readonly code?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ExchangeError';
  }
}

export class NotImplementedByExchangeError extends ExchangeError {
  constructor(exchange: string, feature: string) {
    super(`${feature} not implemented for ${exchange}`, exchange, 'NOT_IMPLEMENTED');
    this.name = 'NotImplementedByExchangeError';
  }
}

export class InsufficientBalanceError extends ExchangeError {
  constructor(exchange: string, asset: string, required: number, available: number) {
    super(
      `Insufficient ${asset} balance on ${exchange}: required ${required}, available ${available}`,
      exchange,
      'INSUFFICIENT_BALANCE',
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class OrderRejectedError extends ExchangeError {
  constructor(exchange: string, reason: string, cause?: unknown) {
    super(`Order rejected on ${exchange}: ${reason}`, exchange, 'ORDER_REJECTED', cause);
    this.name = 'OrderRejectedError';
  }
}

export class SymbolNotFoundError extends ExchangeError {
  constructor(exchange: string, symbol: string) {
    super(`Symbol ${symbol} not found on ${exchange}`, exchange, 'SYMBOL_NOT_FOUND');
    this.name = 'SymbolNotFoundError';
  }
}
