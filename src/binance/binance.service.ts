import { Injectable } from '@nestjs/common';
import { BinanceAuthService } from './binance-auth.service';
import { BinanceAccountService } from './binance-account.service';
import { BinanceSpotService } from './binance-spot.service';
import { BinanceMarginService } from './binance-margin.service';

@Injectable()
export class BinanceService {
  constructor(
    private readonly auth: BinanceAuthService,
    private readonly account: BinanceAccountService,
    private readonly spot: BinanceSpotService,
    private readonly margin: BinanceMarginService,
  ) {}

  // Auth methods (delegated to BinanceAuthService)
  canUseMargin(): boolean {
    return this.auth.canUseMargin();
  }

  sign(querystring: string): string {
    return this.auth.sign(querystring);
  }

  getContext() {
    return this.auth.getContext();
  }

  async getServerTime(): Promise<number> {
    return this.auth.getServerTime();
  }

  async postSigned(endpoint: string, params: Record<string, string | number>) {
    return this.auth.postSigned(endpoint, params);
  }

  async getSigned(endpoint: string, params: Record<string, string | number>) {
    return this.auth.getSigned(endpoint, params);
  }

  async getSignedRequest(endpoint: string, params: Record<string, string | number>) {
    return this.auth.getSignedRequest(endpoint, params);
  }

  // Account methods (delegated to BinanceAccountService)
  async getAccountInfo() {
    return this.account.getAccountInfo();
  }

  async getNonZeroBalances() {
    return this.account.getNonZeroBalances();
  }

  async getSpotBalances() {
    return this.account.getSpotBalances();
  }

  async getCrossMarginAccountInfo() {
    return this.account.getCrossMarginAccountInfo();
  }

  async getCrossMarginBalances() {
    return this.account.getCrossMarginBalances();
  }

  async getCrossMarginLoans() {
    return this.account.getCrossMarginLoans();
  }

  async getFullCrossMarginBalance() {
    return this.account.getFullCrossMarginBalance();
  }

  async getIsolatedMarginAccountInfo(symbol: string) {
    return this.account.getIsolatedMarginAccountInfo(symbol);
  }

  async getIsolatedMarginBalances() {
    return this.account.getIsolatedMarginBalances();
  }

  async getAccountBalanceMarginIsolated() {
    return this.account.getAccountBalanceMarginIsolated();
  }

  async getAccountBalancesAll() {
    return this.account.getAccountBalancesAll();
  }

  async getFuturesAccountBalance() {
    return this.account.getFuturesAccountBalance();
  }

  async getCrossMarginPositions() {
    return this.account.getCrossMarginPositions();
  }

  async getCrossMarginPosition(symbol: string) {
    return this.account.getCrossMarginPosition(symbol);
  }

  async getCrossMarginUnrealizedProfit(symbol: string) {
    return this.account.getCrossMarginUnrealizedProfit(symbol);
  }

  async getCrossMarginProfitPercent(symbol: string) {
    return this.account.getCrossMarginProfitPercent(symbol);
  }

  async calculateCrossMarginSummary() {
    return this.account.calculateCrossMarginSummary();
  }

  async getCrossMarginPNLSummary() {
    return this.account.getCrossMarginPNLSummary();
  }

  async getCrossMarginSaldo() {
    return this.account.getCrossMarginSaldo();
  }

  async transferBetweenSpotAndCrossMargin(asset: string, amount: string, type: 1 | 2) {
    return this.account.transferBetweenSpotAndCrossMargin(asset, amount, type);
  }

  async getConsolidatedBalance() {
    return this.account.getConsolidatedBalance();
  }

  async getAvailableToTrade() {
    return this.account.getAvailableToTrade();
  }

  async getEstimatedTotalValue() {
    return this.account.getEstimatedTotalValue();
  }

  async getMarginUtilization() {
    return this.account.getMarginUtilization();
  }

  async getWalletFundsSummary() {
    return this.account.getWalletFundsSummary();
  }

  async getAssetPerformanceAnalysis() {
    return this.account.getAssetPerformanceAnalysis();
  }

  async getAdvancedRiskMetrics() {
    return this.account.getAdvancedRiskMetrics();
  }

  // Spot methods (delegated to BinanceSpotService)
  async createLimitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string, price: string, timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC') {
    return this.spot.createLimitOrder(symbol, side, quantity, price, timeInForce);
  }

  async createMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string) {
    return this.spot.createMarketOrder(symbol, side, quantity);
  }

  async createOcoOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string, price: string, stopPrice: string, stopLimitPrice: string, stopLimitTimeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC') {
    return this.spot.createOcoOrder(symbol, side, quantity, price, stopPrice, stopLimitPrice, stopLimitTimeInForce);
  }

  async createStopLossOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    stopPrice: string,
    options: Record<string, any> = {},
  ) {
    return this.spot.createStopLossOrder(symbol, side, quantity, stopPrice, options);
  }

  async checkOrderStatus(symbol: string, orderId: number) {
    return this.spot.checkOrderStatus(symbol, orderId);
  }

  async cancelOrder(symbol: string, orderId?: number) {
    return this.spot.cancelOrder(symbol, orderId);
  }

  async getAllOrders(symbol: string, limit = 500, fromId?: number) {
    return this.spot.getAllOrders(symbol, limit, fromId);
  }

  async getCandles(symbol: string, interval: string, limit: number) {
    return this.spot.getCandles(symbol, interval, limit);
  }

  async cancelAllOrders(symbol: string) {
    return this.spot.cancelAllOrders(symbol);
  }

  async getSymbolPrice(symbol: string) {
    return this.spot.getSymbolPrice(symbol);
  }

  async obtenerFiltrosSimbolo(symbol: string) {
    return this.spot.obtenerFiltrosSimbolo(symbol);
  }

  async getSymbolTickSize(symbol: string): Promise<number> {
    return this.spot.getSymbolTickSize(symbol);
  }

  async getDecimalsForSymbol(symbol: string): Promise<{ priceDecimals: number; quantityDecimals: number }> {
    return this.spot.getDecimalsForSymbol(symbol);
  }

  // Margin methods (delegated to BinanceMarginService)
  async createCrossMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC'
  ) {
    return this.margin.createCrossMarginLimitOrder(symbol, side, quantity, price, timeInForce);
  }

  async createCrossMarginMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string
  ) {
    return this.margin.createCrossMarginMarketOrder(symbol, side, quantity);
  }

  async createCrossMarginOcoOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    stopPrice: string,
    stopLimitPrice: string,
    stopLimitTimeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
  ) {
    return this.margin.createCrossMarginOcoOrder(symbol, side, quantity, price, stopPrice, stopLimitPrice, stopLimitTimeInForce);
  }

  async createCrossMarginStopLossOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    stopPrice: string,
    options: Record<string, any> = {}
  ) {
    return this.margin.createCrossMarginStopLossOrder(symbol, side, quantity, stopPrice, options);
  }

  async createIsolatedMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC'
  ) {
    return this.margin.createIsolatedMarginLimitOrder(symbol, side, quantity, price, timeInForce);
  }

  async createIsolatedMarginMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string
  ) {
    return this.margin.createIsolatedMarginMarketOrder(symbol, side, quantity);
  }

  async cancelCrossMarginOrder(symbol: string, orderId: number) {
    return this.margin.cancelCrossMarginOrder(symbol, orderId);
  }

  async cancelAllCrossMarginOrders(symbol: string) {
    return this.margin.cancelAllCrossMarginOrders(symbol);
  }

  async cancelAllCrossMarginOrdersBySide(symbol: string, side: 'BUY' | 'SELL') {
    return this.margin.cancelAllCrossMarginOrdersBySide(symbol, side);
  }

  async checkCrossMarginOrderStatus(symbol: string, orderId: number) {
    return this.margin.checkCrossMarginOrderStatus(symbol, orderId);
  }

  async getAllCrossMarginOrders(symbol: string, limit = 500, fromId?: number) {
    return this.margin.getAllCrossMarginOrders(symbol, limit, fromId);
  }

  async getCrossMarginOrderStatus(symbol: string, orderId: number) {
    return this.margin.getCrossMarginOrderStatus(symbol, orderId);
  }

  async borrowCrossMargin(asset: string, amount: string) {
    return this.margin.borrowCrossMargin(asset, amount);
  }

  async repayCrossMargin(asset: string, amount: string) {
    return this.margin.repayCrossMargin(asset, amount);
  }

  async liquiCrossMagin(): Promise<void> {
    return this.margin.liquiCrossMagin();
  }

  async panicLiquidateSymbol(payload: {
    strategyId: string;
    strategyType: string;
    symbol: string;
    market: 'spot' | 'margin';
  }): Promise<void> {
    return this.margin.panicLiquidateSymbol(payload);
  }

  async firmar() {
    // Stub public method maintained for compatibility
  }
}
