import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BinanceAuthService } from './binance-auth.service';

@Injectable()
export class BinanceAccountService {
  constructor(private readonly auth: BinanceAuthService) {}

  async getAccountInfo() {
    const params = { timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.getSigned('/api/v3/account', params);
  }

  async getNonZeroBalances() {
    const accountInfo = await this.getAccountInfo();
    const balances = accountInfo.balances.filter(
      (asset: any) => parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0
    );
    return balances;
  }

  async getSpotBalances() {
    const accountInfo = await this.getAccountInfo();
    return accountInfo.balances.filter((asset: any) => parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0);
  }

  async getCrossMarginAccountInfo() {
    const params = { timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.getSigned('/sapi/v1/margin/account', params);
  }

  async getCrossMarginBalances() {
    const crossMarginInfo = await this.getCrossMarginAccountInfo();
    return crossMarginInfo.userAssets.filter(
      (asset: any) => parseFloat(asset.free) > 0 || parseFloat(asset.borrowed) > 0 || parseFloat(asset.netAsset) > 0
    );
  }

  async getCrossMarginLoans() {
    const accountInfo = await this.getCrossMarginAccountInfo();
    return accountInfo;
  }

  async getFullCrossMarginBalance() {
    const params = { timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.getSigned('/sapi/v1/margin/account', params);
  }

  async getIsolatedMarginAccountInfo(symbol: string) {
    const params = { timestamp: await this.auth.getServerTime(), recvWindow: 10000, symbol };
    return this.auth.getSigned('/api/v1/margin/isolated/account', params);
  }

  async getIsolatedMarginBalances() {
    const isolatedMarginInfo = await this.getAccountBalanceMarginIsolated();
    return isolatedMarginInfo.filter((asset: any) =>
      (asset.baseAsset && (parseFloat(asset.baseAsset.free) > 0 || parseFloat(asset.baseAsset.locked) > 0)) ||
      (asset.quoteAsset && (parseFloat(asset.quoteAsset.free) > 0 || parseFloat(asset.quoteAsset.locked) > 0))
    );
  }

  async getAccountBalanceMarginIsolated() {
    const params = { timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    const response = await this.auth.getSigned('/sapi/v1/margin/isolated/account', params);
    return response.assets;
  }

  async getAccountBalancesAll() {
    const params = { timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.getSigned('/sapi/v1/margin/account', params);
  }

  async getFuturesAccountBalance() {
    const params = { timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.getSigned('/fapi/v2/balance', params);
  }

  async getCrossMarginPositions() {
    try {
      const params = { timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
      const response = await this.auth.getSigned('/sapi/v1/margin/positionRisk', params);
      if (!Array.isArray(response)) {
        throw new Error('La respuesta no es un array de posiciones');
      }
      return response;
    } catch (error) {
      throw new Error(`Error obteniendo posiciones margin cruzado: ${(error as Error).message}`);
    }
  }

  async getCrossMarginPosition(symbol: string) {
    const positions = await this.getCrossMarginPositions();
    const position = positions.find((pos: any) => pos.symbol === symbol);
    if (!position) {
      throw new Error(`No hay posición abierta para el símbolo ${symbol}`);
    }
    return position;
  }

  async getCrossMarginUnrealizedProfit(symbol: string) {
    const position = await this.getCrossMarginPosition(symbol);
    return {
      symbol,
      positionAmt: position.positionAmt,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice,
      unRealizedProfit: parseFloat(position.unRealizedProfit),
    };
  }

  async getCrossMarginProfitPercent(symbol: string) {
    const { entryPrice, markPrice, positionAmt } = await this.getCrossMarginUnrealizedProfit(symbol);
    if (parseFloat(entryPrice) === 0) return 0;
    const profitPercent = ((parseFloat(markPrice) - parseFloat(entryPrice)) / parseFloat(entryPrice)) * 100;
    return profitPercent * (parseFloat(positionAmt) >= 0 ? 1 : -1);
  }

  async calculateCrossMarginSummary() {
    const accountInfo = await this.getCrossMarginAccountInfo();

    const marginLevel = parseFloat(accountInfo.marginLevel);
    const totalAsset = parseFloat(accountInfo.totalAssetOfBtc);
    const totalLiability = parseFloat(accountInfo.totalLiabilityOfBtc);
    const totalNetAsset = parseFloat(accountInfo.totalNetAssetOfBtc);

    const netProfitLoss = totalNetAsset;

    return {
      marginLevel,
      totalAsset,
      totalLiability,
      netProfitLoss,
      userAssets: accountInfo.userAssets.map((asset: any) => ({
        asset: asset.asset,
        free: parseFloat(asset.free),
        borrowed: parseFloat(asset.borrowed),
        interest: parseFloat(asset.interest),
        netAsset: parseFloat(asset.netAsset),
      })),
    };
  }

  async getCrossMarginPNLSummary() {
    if (!this.auth.canUseMargin()) {
      return {
        totalUnrealizedPNL: '0.00000000',
        pnlCurrency: 'USDT',
        marginLevel: '999.00000000',
        riskLevel: 'BAJO',
        liquidationStatus: 'Margin desactivado en desarrollo. Activa ENABLE_MARGIN_IN_DEV=true para habilitarlo.',
        totalLiabilityOfBtc: '0.00000000',
        pnlAsPercentageOfLiability: '0.00',
        assetsSummary: [],
      };
    }

    const accountInfo = await this.getCrossMarginAccountInfo();

    const marginLevel = parseFloat(accountInfo.marginLevel);
    const totalNetAssetOfBtc = parseFloat(accountInfo.totalNetAssetOfBtc);
    const totalLiabilityOfBtc = parseFloat(accountInfo.totalLiabilityOfBtc);

    const unrealizedPNL = totalNetAssetOfBtc;

    let liquidationStatus: string = 'Estado no determinado';
    let riskLevel: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO' | 'LIQUIDACIÓN INMINENTE' = 'BAJO';

    const WARNING_LEVEL = 1.5;
    const CRITICAL_LEVEL = 1.1;

    if (marginLevel > WARNING_LEVEL) {
      riskLevel = 'BAJO';
      liquidationStatus = 'El Nivel de Margen es saludable.';
    } else if (marginLevel > CRITICAL_LEVEL) {
      riskLevel = 'MEDIO';
      liquidationStatus = `El Nivel de Margen (${marginLevel.toFixed(4)}) está por debajo de ${WARNING_LEVEL}. Considere añadir colateral.`;
    } else if (marginLevel > 1.0) {
      riskLevel = 'ALTO';
      liquidationStatus = `¡ATENCIÓN! Nivel de Margen (${marginLevel.toFixed(4)}) muy cerca del límite de liquidación. Necesita añadir colateral URGENTE.`;
    } else if (marginLevel <= 1.0) {
      riskLevel = 'CRÍTICO';
      liquidationStatus = `¡PELIGRO DE LIQUIDACIÓN! Nivel de Margen en ${marginLevel.toFixed(4)}. La liquidación forzosa es inminente o ya está en proceso.`;
    }

    const pnlPercentage = totalLiabilityOfBtc > 0 ? (unrealizedPNL / totalLiabilityOfBtc) * 100 : 0;

    return {
      totalUnrealizedPNL: unrealizedPNL.toFixed(8),
      pnlCurrency: accountInfo.quoteAsset,
      marginLevel: marginLevel.toFixed(8),
      riskLevel,
      liquidationStatus,
      totalLiabilityOfBtc: totalLiabilityOfBtc.toFixed(8),
      pnlAsPercentageOfLiability: pnlPercentage.toFixed(2),
      assetsSummary: accountInfo.userAssets
        .filter((asset: any) => parseFloat(asset.borrowed) > 0 || parseFloat(asset.netAsset) !== 0)
        .map((asset: any) => ({
          asset: asset.asset,
          netAsset: parseFloat(asset.netAsset).toFixed(8),
          borrowed: parseFloat(asset.borrowed).toFixed(8),
        })),
    };
  }

  async getCrossMarginSaldo() {
    const accountInfo = await this.getCrossMarginAccountInfo();

    return {
      assetsSummary: accountInfo.userAssets
        .filter((asset: any) => parseFloat(asset.borrowed) > 0 || parseFloat(asset.netAsset) !== 0)
        .map((asset: any) => ({
          asset: asset.asset,
          netAsset: parseFloat(asset.netAsset).toFixed(8),
          borrowed: parseFloat(asset.borrowed).toFixed(8),
        })),
    };
  }

  async transferBetweenSpotAndCrossMargin(asset: string, amount: string, type: 1 | 2) {
    const params = { asset, amount, type, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.postSigned('/sapi/v1/margin/transfer', params);
  }

  async getConsolidatedBalance() {
    const spotAccount = await this.getAccountInfo();
    const marginAccount = this.auth.canUseMargin() ? await this.getCrossMarginAccountInfo() : null;
    let futuresAccount = null;
    try {
      futuresAccount = await this.getFuturesAccountBalance();
    } catch (error) {
      console.warn('Futures account not available:', (error as Error).message);
    }

    const consolidatedByAsset: Record<string, any> = {};

    spotAccount.balances.forEach((asset: any) => {
      const free = parseFloat(asset.free);
      const locked = parseFloat(asset.locked);
      if (free > 0 || locked > 0) {
        if (!consolidatedByAsset[asset.asset]) {
          consolidatedByAsset[asset.asset] = { asset: asset.asset, spot: 0, margin: 0, futures: 0, total: 0 };
        }
        consolidatedByAsset[asset.asset].spot = free + locked;
      }
    });

    if (marginAccount) {
      marginAccount.userAssets.forEach((asset: any) => {
        const netAsset = parseFloat(asset.netAsset);
        if (netAsset !== 0) {
          if (!consolidatedByAsset[asset.asset]) {
            consolidatedByAsset[asset.asset] = { asset: asset.asset, spot: 0, margin: 0, futures: 0, total: 0 };
          }
          consolidatedByAsset[asset.asset].margin = netAsset;
        }
      });
    }

    if (futuresAccount && Array.isArray(futuresAccount)) {
      futuresAccount.forEach((asset: any) => {
        const walletBalance = parseFloat(asset.walletBalance);
        if (walletBalance > 0) {
          if (!consolidatedByAsset[asset.asset]) {
            consolidatedByAsset[asset.asset] = { asset: asset.asset, spot: 0, margin: 0, futures: 0, total: 0 };
          }
          consolidatedByAsset[asset.asset].futures = walletBalance;
        }
      });
    }

    Object.keys(consolidatedByAsset).forEach((key) => {
      const asset = consolidatedByAsset[key];
      asset.total = asset.spot + asset.margin + asset.futures;
    });

    return {
      timestamp: new Date().toISOString(),
      byAsset: Object.values(consolidatedByAsset).filter((a: any) => a.total > 0),
      summary: {
        totalSpot: Object.values(consolidatedByAsset).reduce((sum: number, a: any) => sum + a.spot, 0),
        totalMargin: Object.values(consolidatedByAsset).reduce((sum: number, a: any) => sum + a.margin, 0),
        totalFutures: Object.values(consolidatedByAsset).reduce((sum: number, a: any) => sum + a.futures, 0),
      },
    };
  }

  async getAvailableToTrade() {
    const spotAccount = await this.getAccountInfo();
    const marginAccount = this.auth.canUseMargin() ? await this.getCrossMarginAccountInfo() : null;

    const spotFree = spotAccount.balances.reduce((sum: number, asset: any) => sum + parseFloat(asset.free), 0);

    let marginFree = 0;
    let marginBorrowed = 0;
    if (marginAccount) {
      marginFree = marginAccount.userAssets.reduce((sum: number, asset: any) => sum + parseFloat(asset.free), 0);
      marginBorrowed = marginAccount.userAssets.reduce((sum: number, asset: any) => sum + parseFloat(asset.borrowed), 0);
    }

    const totalBorrowingPower = marginAccount ? parseFloat(marginAccount.borrowingUser?.totalAssetOfBtc || 0) : 0;
    const usedBorrowingPower = marginAccount ? totalBorrowingPower - parseFloat(marginAccount.totalNetAssetOfBtc) : 0;

    return {
      spot: {
        available: spotFree.toFixed(8),
        locked: spotAccount.balances.reduce((sum: number, asset: any) => sum + parseFloat(asset.locked), 0).toFixed(8),
        description: 'Capital disponible inmediatamente sin margen',
      },
      margin: {
        free: marginFree.toFixed(8),
        borrowed: marginBorrowed.toFixed(8),
        available: marginAccount ? Math.max(0, parseFloat(marginAccount.totalAssetOfBtc) - parseFloat(marginAccount.totalLiabilityOfBtc)).toFixed(8) : '0',
        borrowingPower: totalBorrowingPower.toFixed(8),
        usedBorrowingPower: usedBorrowingPower.toFixed(8),
        marginLevel: marginAccount ? parseFloat(marginAccount.marginLevel).toFixed(4) : 'N/A',
        description: 'Capital disponible con margen cruzado',
      },
      totalAvailable: (spotFree + marginFree).toFixed(8),
      recommendation: marginBorrowed > 0 ? 'Tienes deudas activas en margin. Considera repagar préstamos.' : 'Sin deudas de margen.',
    };
  }

  async getEstimatedTotalValue() {
    const consolidated = await this.getConsolidatedBalance();
    const valuations: any[] = [];
    let totalValueUSDT = 0;

    for (const asset of consolidated.byAsset) {
      if (asset.total <= 0) continue;

      const symbol = `${asset.asset}USDT`;
      try {
        const url = `${this.auth.getBaseUrl()}/api/v3/ticker/price?symbol=${symbol}`;
        const response = await axios.get(url, { httpsAgent: this.auth.getHttpsAgent() });
        const priceData = response.data;

        if (priceData?.price) {
          const price = parseFloat(priceData.price);
          const value = asset.total * price;
          totalValueUSDT += value;

          valuations.push({
            asset: asset.asset,
            quantity: asset.total.toFixed(8),
            priceUSDT: price.toFixed(2),
            valueUSDT: value.toFixed(2),
            breakdown: {
              spotValue: (asset.spot * price).toFixed(2),
              marginValue: (asset.margin * price).toFixed(2),
              futuresValue: (asset.futures * price).toFixed(2),
            },
          });
        }
      } catch (error) {
        console.warn(`No se pudo obtener precio para ${symbol}`);
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalValueUSDT: totalValueUSDT.toFixed(2),
      valuations,
      summary: {
        spotValue: consolidated.byAsset.reduce((sum: number, a: any) => sum + a.spot, 0).toFixed(2),
        marginValue: consolidated.byAsset.reduce((sum: number, a: any) => sum + a.margin, 0).toFixed(2),
        futuresValue: consolidated.byAsset.reduce((sum: number, a: any) => sum + a.futures, 0).toFixed(2),
      },
    };
  }

  async getMarginUtilization() {
    if (!this.auth.canUseMargin()) {
      return {
        marginEnabled: false,
        message: 'Margin deshabilitado en desarrollo. Activa ENABLE_MARGIN_IN_DEV=true.',
      };
    }

    const marginAccount = await this.getCrossMarginAccountInfo();
    const marginLevel = parseFloat(marginAccount.marginLevel);
    const totalAssetOfBtc = parseFloat(marginAccount.totalAssetOfBtc);
    const totalLiabilityOfBtc = parseFloat(marginAccount.totalLiabilityOfBtc);
    const totalNetAssetOfBtc = parseFloat(marginAccount.totalNetAssetOfBtc);

    const utilizationRatio = totalAssetOfBtc > 0 ? ((totalLiabilityOfBtc / totalAssetOfBtc) * 100).toFixed(2) : '0.00';

    let riskLevel: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO' = 'BAJO';
    let recommendation = 'Sistema saludable';

    if (marginLevel > 3) {
      riskLevel = 'BAJO';
      recommendation = 'Puedes tomar más margen si lo necesitas';
    } else if (marginLevel > 1.5) {
      riskLevel = 'MEDIO';
      recommendation = 'Margen disponible pero considera tu estrategia';
    } else if (marginLevel > 1.1) {
      riskLevel = 'ALTO';
      recommendation = 'Nivel de margen peligroso. Considera añadir colateral o cerrar posiciones';
    } else {
      riskLevel = 'CRÍTICO';
      recommendation = 'RIESGO DE LIQUIDACIÓN INMINENTE. Acción inmediata requerida.';
    }

    return {
      marginEnabled: true,
      marginLevel: marginLevel.toFixed(4),
      utilizationRatio: `${utilizationRatio}%`,
      totalAssetOfBtc: totalAssetOfBtc.toFixed(8),
      totalLiabilityOfBtc: totalLiabilityOfBtc.toFixed(8),
      totalNetAssetOfBtc: totalNetAssetOfBtc.toFixed(8),
      riskLevel,
      recommendation,
      alerts: {
        isWarningLevel: marginLevel <= 1.5 && marginLevel > 1.1,
        isLiquidationRisk: marginLevel <= 1.1,
        isHealthy: marginLevel > 1.5,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async getWalletFundsSummary() {
    const consolidated = await this.getConsolidatedBalance();
    const available = await this.getAvailableToTrade();
    const estimatedValue = await this.getEstimatedTotalValue();

    const spotAccount = await this.getAccountInfo();
    const spotTotal = spotAccount.balances.reduce((sum: number, asset: any) => sum + parseFloat(asset.free) + parseFloat(asset.locked), 0);
    const spotAvailable = parseFloat(available.spot.available);
    const spotLocked = parseFloat(available.spot.locked);

    const marginAccount = this.auth.canUseMargin() ? await this.getCrossMarginAccountInfo() : null;
    const marginTotal = marginAccount ? marginAccount.userAssets.reduce((sum: number, asset: any) => sum + parseFloat(asset.netAsset), 0) : 0;
    const marginAvailable = marginAccount ? parseFloat(available.margin.available) : 0;
    const marginBorrowed = marginAccount ? parseFloat(available.margin.borrowed) : 0;

    let futuresTotal = 0;
    try {
      const futuresAccount = await this.getFuturesAccountBalance();
      futuresTotal = Array.isArray(futuresAccount) ? futuresAccount.reduce((sum: number, asset: any) => sum + parseFloat(asset.walletBalance), 0) : 0;
    } catch (error) {
      console.warn('Futures account not available for wallet summary');
    }

    const totalFundsUSDT = parseFloat(estimatedValue.totalValueUSDT);
    const totalAvailableUSDT = spotAvailable + marginAvailable;

    let healthStatus = 'EXCELENTE';
    if (spotLocked > spotTotal * 0.3) healthStatus = 'ALERTA: Mucho dinero bloqueado en órdenes';
    if (marginBorrowed > 0 && marginBorrowed > marginAvailable) healthStatus = 'CRÍTICA: Deuda > Capital disponible';
    if (marginBorrowed > marginAvailable * 0.8) healthStatus = 'CUIDADO: Alto nivel de deuda';

    const topAssets = consolidated.byAsset
      .sort((a: any, b: any) => b.total - a.total)
      .slice(0, 5)
      .map((asset: any) => {
        const valuation = estimatedValue.valuations.find((v: any) => v.asset === asset.asset);
        return {
          asset: asset.asset,
          quantity: asset.total.toFixed(8),
          valueUSDT: valuation?.valueUSDT || '0.00',
          percentage: ((parseFloat(valuation?.valueUSDT || 0) / totalFundsUSDT) * 100).toFixed(2) + '%',
        };
      });

    return {
      timestamp: new Date().toISOString(),
      walletStatus: healthStatus,
      totalFunds: {
        totalUSDT: totalFundsUSDT.toFixed(2),
        totalAvailableUSDT: totalAvailableUSDT.toFixed(2),
        totalLockedUSDT: (spotLocked + (marginAccount ? parseFloat(marginAccount.totalLiabilityOfBtc) : 0)).toFixed(2),
      },
      byAccount: {
        spot: {
          totalUSDT: spotTotal.toFixed(2),
          availableUSDT: spotAvailable.toFixed(2),
          lockedUSDT: spotLocked.toFixed(2),
          percentage: ((spotTotal / totalFundsUSDT) * 100).toFixed(2) + '%',
        },
        margin: {
          totalUSDT: marginTotal.toFixed(2),
          availableUSDT: marginAvailable.toFixed(2),
          borrowedUSDT: marginBorrowed.toFixed(2),
          percentage: ((marginTotal / totalFundsUSDT) * 100).toFixed(2) + '%',
          marginLevel: marginAccount ? parseFloat(marginAccount.marginLevel).toFixed(4) : 'N/A',
        },
        futures: {
          totalUSDT: futuresTotal.toFixed(2),
          percentage: ((futuresTotal / totalFundsUSDT) * 100).toFixed(2) + '%',
        },
      },
      topAssets,
      buyingPower: {
        spotBuyingPower: spotAvailable.toFixed(2),
        marginBuyingPower: (marginAvailable * 3).toFixed(2), // Asumiendo 3x leverage
        totalBuyingPower: (spotAvailable + marginAvailable * 3).toFixed(2),
      },
      alerts: {
        hasLockedFunds: spotLocked > 0,
        hasMarginDebt: marginBorrowed > 0,
        isLowOnCapital: totalAvailableUSDT < totalFundsUSDT * 0.2,
        requiresAttention: healthStatus !== 'EXCELENTE',
      },
      recommendations: this.getWalletRecommendations(spotLocked, spotTotal, marginBorrowed, marginAvailable, totalFundsUSDT),
    };
  }

  private getWalletRecommendations(spotLocked: number, spotTotal: number, marginBorrowed: number, marginAvailable: number, totalUSDT: number): string[] {
    const recommendations: string[] = [];

    if (spotLocked > spotTotal * 0.3) {
      recommendations.push('Tienes más del 30% del capital bloqueado en órdenes. Considera cancelar órdenes innecesarias.');
    }

    if (marginBorrowed > marginAvailable * 0.8) {
      recommendations.push('Nivel de deuda muy alto. Considera repagar préstamos o añadir colateral.');
    }

    if (totalUSDT < 100) {
      recommendations.push('Capital muy bajo. Considera depositar más fondos para diversificar estrategias.');
    }

    if (marginBorrowed > 0 && marginAvailable === 0) {
      recommendations.push('⚠️ CRÍTICO: Cero capital disponible en margin. Acción inmediata requerida.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Tu billetera está en buen estado. Continúa monitoreando.');
    }

    return recommendations;
  }

  async getAssetPerformanceAnalysis() {
    const consolidated = await this.getConsolidatedBalance();
    const estimatedValue = await this.getEstimatedTotalValue();
    const totalPortfolioValue = parseFloat(estimatedValue.totalValueUSDT);

    const assetPerformance = consolidated.byAsset.map((asset: any) => {
      const valuation = estimatedValue.valuations.find((v: any) => v.asset === asset.asset);
      const currentValue = parseFloat(valuation?.valueUSDT || 0);
      const percentage = (currentValue / totalPortfolioValue) * 100;

      return {
        asset: asset.asset,
        quantity: asset.total.toFixed(8),
        currentPriceUSDT: valuation?.priceUSDT || '0.00',
        currentValueUSDT: valuation?.valueUSDT || '0.00',
        portfolioPercentage: percentage.toFixed(2) + '%',
        allocation: {
          spot: asset.spot.toFixed(8),
          margin: asset.margin.toFixed(8),
          futures: asset.futures.toFixed(8),
        },
      };
    });

    const topAssets = assetPerformance.sort((a: any, b: any) =>
      parseFloat(b.currentValueUSDT) - parseFloat(a.currentValueUSDT)
    ).slice(0, 10);

    const diversification = {
      numberOfAssets: assetPerformance.length,
      topAssetPercentage: topAssets.length > 0 ? topAssets[0].portfolioPercentage : '0.00%',
      top5TotalPercentage: topAssets.slice(0, 5)
        .reduce((sum: number, a: any) => sum + parseFloat(a.portfolioPercentage), 0)
        .toFixed(2) + '%',
      concentrationLevel: topAssets.length > 0 && parseFloat(topAssets[0].portfolioPercentage) > 50 ? 'ALTA' : 'MEDIA',
    };

    return {
      timestamp: new Date().toISOString(),
      totalAssets: assetPerformance.length,
      totalPortfolioValueUSDT: totalPortfolioValue.toFixed(2),
      topAssets,
      allAssets: assetPerformance,
      diversification,
      recommendation: diversification.concentrationLevel === 'ALTA'
        ? 'Tu portafolio está muy concentrado. Considera diversificar.'
        : 'Diversificación equilibrada.',
    };
  }

  async getAdvancedRiskMetrics() {
    const consolidated = await this.getConsolidatedBalance();
    const estimatedValue = await this.getEstimatedTotalValue();
    const totalPortfolioValue = parseFloat(estimatedValue.totalValueUSDT);
    const available = await this.getAvailableToTrade();

    const assetPrices = estimatedValue.valuations.map((v: any) => parseFloat(v.priceUSDT));
    const assetValues = estimatedValue.valuations.map((v: any) => parseFloat(v.valueUSDT));

    // Volatilidad: desviación estándar de los cambios porcentuales
    const volatility = this.calculateVolatility(assetPrices);

    // Max Drawdown: pérdida máxima desde el pico
    const maxDrawdown = this.calculateMaxDrawdown(assetValues);

    // Sharpe Ratio: (retorno - tasa libre de riesgo) / volatilidad
    const riskFreeRate = 0.05; // 5% anual
    const expectedReturn = 0.15; // Asumimos 15% retorno esperado anual
    const sharpeRatio = volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : 0;

    // Sortino Ratio: similar a Sharpe pero solo cuenta volatilidad negativa
    const downwardVolatility = this.calculateDownwardVolatility(assetPrices);
    const sortinoRatio = downwardVolatility > 0 ? (expectedReturn - riskFreeRate) / downwardVolatility : 0;

    // Concentration Risk: qué % está en el activo más grande
    const topAssetValue = Math.max(...assetValues);
    const concentrationRisk = (topAssetValue / totalPortfolioValue) * 100;

    // Value at Risk (VaR): pérdida máxima esperada con 95% de confianza
    const var95 = totalPortfolioValue * volatility * 1.645; // 1.645 es el z-score para 95%

    // Beta simplificado (vs BTC)
    const btcValuation = estimatedValue.valuations.find((v: any) => v.asset === 'BTC');
    const btcPrice = btcValuation ? parseFloat(btcValuation.priceUSDT) : 1;
    const portfolioBeta = this.calculatePortfolioBeta(assetValues, btcPrice);

    // Liquidez disponible
    const availableCapital = parseFloat(available.totalAvailable);
    const liquidityRatio = (availableCapital / totalPortfolioValue) * 100;

    return {
      timestamp: new Date().toISOString(),
      volatilityMetrics: {
        annualVolatility: (volatility * 100).toFixed(2) + '%',
        downwardVolatility: (downwardVolatility * 100).toFixed(2) + '%',
        interpretation: volatility > 0.3 ? 'ALTA' : volatility > 0.15 ? 'MEDIA' : 'BAJA',
      },
      profitabilityMetrics: {
        sharpeRatio: sharpeRatio.toFixed(4),
        sortinoRatio: sortinoRatio.toFixed(4),
        expectedReturnAnnual: (expectedReturn * 100).toFixed(2) + '%',
        interpretation: sharpeRatio > 1 ? 'MUY BUENA' : sharpeRatio > 0.5 ? 'BUENA' : 'REQUIERE MEJORA',
      },
      riskMetrics: {
        maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
        valueAtRisk95: var95.toFixed(2) + ' USDT',
        concentrationRisk: concentrationRisk.toFixed(2) + '%',
        portfolioBeta: portfolioBeta.toFixed(4),
        liquidityRatio: liquidityRatio.toFixed(2) + '%',
      },
      riskLevel: this.assessRiskLevel(volatility, concentrationRisk, liquidityRatio),
      recommendations: this.getRiskRecommendations(volatility, concentrationRisk, liquidityRatio, sharpeRatio),
    };
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    const mean = prices.reduce((a, b) => a + b) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    return Math.sqrt(variance) / mean;
  }

  private calculateDownwardVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    const mean = prices.reduce((a, b) => a + b) / prices.length;
    const downwardVariance = prices
      .filter(p => p < mean)
      .reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    return Math.sqrt(downwardVariance) / mean;
  }

  private calculateMaxDrawdown(values: number[]): number {
    if (values.length < 2) return 0;
    let maxDrawdown = 0;
    let peak = values[0];
    for (const value of values) {
      if (value > peak) peak = value;
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return maxDrawdown;
  }

  private calculatePortfolioBeta(assetValues: number[], btcPrice: number): number {
    if (assetValues.length === 0) return 1;
    const totalValue = assetValues.reduce((a, b) => a + b, 0);
    const weights = assetValues.map(v => v / totalValue);
    let beta = 0;
    for (let i = 0; i < weights.length; i++) {
      const isBTC = i === 0; // Asume que BTC es el primer activo
      beta += weights[i] * (isBTC ? 1 : 0.8); // BTC beta = 1, otros ~0.8
    }
    return beta;
  }

  private assessRiskLevel(volatility: number, concentration: number, liquidity: number): string {
    let riskScore = 0;
    if (volatility > 0.3) riskScore += 2;
    else if (volatility > 0.15) riskScore += 1;

    if (concentration > 50) riskScore += 2;
    else if (concentration > 30) riskScore += 1;

    if (liquidity < 10) riskScore += 2;
    else if (liquidity < 20) riskScore += 1;

    if (riskScore >= 5) return 'CRÍTICO';
    if (riskScore >= 3) return 'ALTO';
    if (riskScore >= 1) return 'MEDIO';
    return 'BAJO';
  }

  private getRiskRecommendations(volatility: number, concentration: number, liquidity: number, sharpeRatio: number): string[] {
    const recommendations: string[] = [];

    if (volatility > 0.3) {
      recommendations.push('Volatilidad muy alta. Considera añadir activos menos volátiles.');
    }

    if (concentration > 50) {
      recommendations.push('Concentración extrema. Diversifica hacia otros activos.');
    } else if (concentration > 30) {
      recommendations.push('Concentración alta. Considera rebalancear el portafolio.');
    }

    if (liquidity < 10) {
      recommendations.push('⚠️ Liquidez crítica. Reserva capital para emergencias.');
    } else if (liquidity < 20) {
      recommendations.push('Liquidez baja. Mantén más capital disponible.');
    }

    if (sharpeRatio < 0.5) {
      recommendations.push('Retorno/Riesgo desfavorable. Revisa tu estrategia de trading.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Métricas de riesgo saludables. Continúa monitoreando.');
    }

    return recommendations;
  }
}
