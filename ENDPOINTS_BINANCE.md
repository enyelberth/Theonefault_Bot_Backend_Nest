# 📚 Documentación de Endpoints - API Binance Bot

**Versión:** 1.0  
**Última actualización:** 2026-04-26  
**Base URL:** `http://localhost:3000/binance`  
**Autenticación:** Bearer Token (JWT)

---

## 📋 Tabla de Contenidos

1. [Headers Requeridos](#headers-requeridos)
2. [Autenticación](#autenticación)
3. [Códigos de Respuesta](#códigos-de-respuesta)
4. [Endpoints de Balance/Fondos](#endpoints-de-balancefondos)
5. [Endpoints de Análisis](#endpoints-de-análisis)
6. [Endpoints de Órdenes Spot](#endpoints-de-órdenes-spot)
7. [Endpoints de Órdenes Margin](#endpoints-de-órdenes-margin)
8. [Cómo Pasar Estrategias](#cómo-pasar-estrategias)
9. [Ejemplos de Consumo](#ejemplos-de-consumo)

---

## Headers Requeridos

```javascript
{
  "Authorization": "Bearer YOUR_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

---

## Autenticación

Todos los endpoints requieren un token JWT válido en el header `Authorization`.

**Obtener token:** (Este endpoint debe estar en otra documentación de auth)

---

## Códigos de Respuesta

| Código | Significado | Acción |
|--------|------------|--------|
| 200 | OK - Solicitud exitosa | Procesa la respuesta normalmente |
| 201 | Created - Recurso creado | La orden/recurso se creó correctamente |
| 400 | Bad Request - Parámetros inválidos | Verifica los parámetros enviados |
| 401 | Unauthorized - Token inválido | Vuelve a autenticar |
| 404 | Not Found - Recurso no existe | Verifica los parámetros (symbol, orderId, etc) |
| 500 | Internal Server Error | Intenta de nuevo, contacta a soporte |

---

# ENDPOINTS DISPONIBLES

## 1. ENDPOINTS DE BALANCE/FONDOS

### 1.1 Dashboard Completo de Fondos
**Endpoint:** `GET /wallet/funds-summary`  
**Método:** GET  
**Autenticación:** Requerida  

**Respuesta (200):**
```json
{
  "timestamp": "2026-04-26T02:30:00.000Z",
  "walletStatus": "EXCELENTE",
  "totalFunds": {
    "totalUSDT": "50000.00",
    "totalAvailableUSDT": "35000.00",
    "totalLockedUSDT": "15000.00"
  },
  "byAccount": {
    "spot": {
      "totalUSDT": "30000.00",
      "availableUSDT": "25000.00",
      "lockedUSDT": "5000.00",
      "percentage": "60.00%"
    },
    "margin": {
      "totalUSDT": "15000.00",
      "availableUSDT": "10000.00",
      "borrowedUSDT": "5000.00",
      "percentage": "30.00%",
      "marginLevel": "2.5000"
    },
    "futures": {
      "totalUSDT": "5000.00",
      "percentage": "10.00%"
    }
  },
  "topAssets": [
    {
      "asset": "USDT",
      "quantity": "25000.00",
      "valueUSDT": "25000.00",
      "percentage": "50.00%"
    }
  ],
  "buyingPower": {
    "spotBuyingPower": "25000.00",
    "marginBuyingPower": "30000.00",
    "totalBuyingPower": "55000.00"
  },
  "alerts": {
    "hasLockedFunds": true,
    "hasMarginDebt": true,
    "isLowOnCapital": false,
    "requiresAttention": false
  },
  "recommendations": ["Tu billetera está en buen estado. Continúa monitoreando."]
}
```

---

### 1.2 Balance Consolidado
**Endpoint:** `GET /balance/consolidated`  
**Método:** GET  
**Autenticación:** Requerida  

**Respuesta (200):**
```json
{
  "timestamp": "2026-04-26T02:30:00.000Z",
  "byAsset": [
    {
      "asset": "USDT",
      "spot": 25000,
      "margin": 5000,
      "futures": 0,
      "total": 30000
    },
    {
      "asset": "BTC",
      "spot": 0.5,
      "margin": 0.1,
      "futures": 0,
      "total": 0.6
    }
  ],
  "summary": {
    "totalSpot": 25000,
    "totalMargin": 5000,
    "totalFutures": 0
  }
}
```

---

### 1.3 Capital Disponible para Operar
**Endpoint:** `GET /balance/available-to-trade`  
**Método:** GET  
**Autenticación:** Requerida  

**Respuesta (200):**
```json
{
  "spot": {
    "available": "25000.00",
    "locked": "5000.00",
    "description": "Capital disponible inmediatamente sin margen"
  },
  "margin": {
    "free": "10000.00",
    "borrowed": "5000.00",
    "available": "8000.00",
    "borrowingPower": "500.00",
    "usedBorrowingPower": "5000.00",
    "marginLevel": "2.5000",
    "description": "Capital disponible con margen cruzado"
  },
  "totalAvailable": "35000.00",
  "recommendation": "Sin deudas de margen."
}
```

---

### 1.4 Valor Total del Portafolio
**Endpoint:** `GET /balance/estimated-total-value`  
**Método:** GET  
**Autenticación:** Requerida  

**Respuesta (200):**
```json
{
  "timestamp": "2026-04-26T02:30:00.000Z",
  "totalValueUSDT": "50000.00",
  "valuations": [
    {
      "asset": "USDT",
      "quantity": "25000.00",
      "priceUSDT": "1.00",
      "valueUSDT": "25000.00",
      "breakdown": {
        "spotValue": "20000.00",
        "marginValue": "5000.00",
        "futuresValue": "0.00"
      }
    },
    {
      "asset": "BTC",
      "quantity": "0.6",
      "priceUSDT": "45000.00",
      "valueUSDT": "27000.00",
      "breakdown": {
        "spotValue": "22500.00",
        "marginValue": "4500.00",
        "futuresValue": "0.00"
      }
    }
  ],
  "summary": {
    "spotValue": "42500.00",
    "marginValue": "9500.00",
    "futuresValue": "0.00"
  }
}
```

---

## 2. ENDPOINTS DE ANÁLISIS

### 2.1 Análisis de Performance por Activo
**Endpoint:** `GET /analysis/asset-performance`  
**Método:** GET  
**Autenticación:** Requerida  

**Respuesta (200):**
```json
{
  "timestamp": "2026-04-26T02:30:00.000Z",
  "totalAssets": 5,
  "totalPortfolioValueUSDT": "50000.00",
  "topAssets": [
    {
      "asset": "BTC",
      "quantity": "0.6",
      "currentPriceUSDT": "45000.00",
      "currentValueUSDT": "27000.00",
      "portfolioPercentage": "54.00%",
      "allocation": {
        "spot": "0.5",
        "margin": "0.1",
        "futures": "0.0"
      }
    }
  ],
  "allAssets": [
    {
      "asset": "USDT",
      "quantity": "25000.00",
      "currentPriceUSDT": "1.00",
      "currentValueUSDT": "25000.00",
      "portfolioPercentage": "50.00%",
      "allocation": {
        "spot": "20000.00",
        "margin": "5000.00",
        "futures": "0.00"
      }
    }
  ],
  "diversification": {
    "numberOfAssets": 5,
    "topAssetPercentage": "54.00%",
    "top5TotalPercentage": "98.00%",
    "concentrationLevel": "MEDIA"
  },
  "recommendation": "Diversificación equilibrada."
}
```

---

### 2.2 Métricas Avanzadas de Riesgo
**Endpoint:** `GET /analysis/risk-metrics`  
**Método:** GET  
**Autenticación:** Requerida  

**Respuesta (200):**
```json
{
  "timestamp": "2026-04-26T02:30:00.000Z",
  "volatilityMetrics": {
    "annualVolatility": "18.50%",
    "downwardVolatility": "12.30%",
    "interpretation": "MEDIA"
  },
  "profitabilityMetrics": {
    "sharpeRatio": "1.2345",
    "sortinoRatio": "1.5678",
    "expectedReturnAnnual": "15.00%",
    "interpretation": "MUY BUENA"
  },
  "riskMetrics": {
    "maxDrawdown": "8.50%",
    "valueAtRisk95": "1250.00 USDT",
    "concentrationRisk": "50.00%",
    "portfolioBeta": "0.8500",
    "liquidityRatio": "25.00%"
  },
  "riskLevel": "BAJO",
  "recommendations": [
    "Volatilidad controlada",
    "Retorno/Riesgo excelente",
    "Liquidez adecuada"
  ]
}
```

---

### 2.3 Utilización de Margen
**Endpoint:** `GET /margin-cross/utilization`  
**Método:** GET  
**Autenticación:** Requerida  

**Respuesta (200):**
```json
{
  "marginEnabled": true,
  "marginLevel": "2.5000",
  "utilizationRatio": "40.00%",
  "totalAssetOfBtc": "5.00",
  "totalLiabilityOfBtc": "2.00",
  "totalNetAssetOfBtc": "3.00",
  "riskLevel": "BAJO",
  "recommendation": "Puedes tomar más margen si lo necesitas",
  "alerts": {
    "isWarningLevel": false,
    "isLiquidationRisk": false,
    "isHealthy": true
  },
  "timestamp": "2026-04-26T02:30:00.000Z"
}
```

---

## 3. ENDPOINTS DE ÓRDENES SPOT

### 3.1 Crear Orden Limit (Spot)
**Endpoint:** `POST /order/limit`  
**Método:** POST  
**Autenticación:** Requerida  

**Body de Solicitud:**
```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": "0.5",
  "price": "45000",
  "timeInForce": "GTC"
}
```

**Parámetros:**
- `symbol` (string, requerido): Par a tradear (ej: BTCUSDT, ETHUSDT)
- `side` (string, requerido): "BUY" o "SELL"
- `quantity` (string, requerido): Cantidad a comprar/vender
- `price` (string, requerido): Precio límite
- `timeInForce` (string, opcional): "GTC" (Good Till Cancel), "IOC" (Immediate Or Cancel), "FOK" (Fill Or Kill). Default: "GTC"

**Respuesta (201):**
```json
{
  "symbol": "BTCUSDT",
  "orderId": 123456789,
  "clientOrderId": "strategy-1-BUY-spot-12345",
  "transactTime": 1619345678901,
  "price": "45000",
  "origQty": "0.5",
  "executedQty": "0",
  "cummulativeQuoteQty": "0",
  "status": "NEW",
  "timeInForce": "GTC",
  "type": "LIMIT",
  "side": "BUY"
}
```

---

### 3.2 Crear Orden Market (Spot)
**Endpoint:** `POST /order/market`  
**Método:** POST  
**Autenticación:** Requerida  

**Body de Solicitud:**
```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": "0.5"
}
```

**Parámetros:**
- `symbol` (string, requerido): Par a tradear
- `side` (string, requerido): "BUY" o "SELL"
- `quantity` (string, requerido): Cantidad a comprar/vender

**Respuesta (201):** Similar a orden limit

---

### 3.3 Crear Orden OCO (One-Cancels-Other)
**Endpoint:** `POST /order/oco`  
**Método:** POST  
**Autenticación:** Requerida  

**Body de Solicitud:**
```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": "0.5",
  "price": "45000",
  "stopPrice": "44000",
  "stopLimitPrice": "43500",
  "stopLimitTimeInForce": "GTC"
}
```

---

### 3.4 Crear Stop Loss
**Endpoint:** `POST /order/limit`  
(Se usa el mismo endpoint con tipo STOP_LOSS_LIMIT)

**Body de Solicitud:**
```json
{
  "symbol": "BTCUSDT",
  "side": "SELL",
  "quantity": "0.5",
  "stopPrice": "44000"
}
```

---

### 3.5 Verificar Estado de Orden
**Endpoint:** `GET /order/:symbol/:orderId`  
**Método:** GET  
**Autenticación:** Requerida  

**Parámetros:**
- `symbol` (path): Par (ej: BTCUSDT)
- `orderId` (path): ID de la orden (número)

**Respuesta (200):**
```json
{
  "symbol": "BTCUSDT",
  "orderId": 123456789,
  "clientOrderId": "strategy-1-BUY-spot-12345",
  "price": "45000",
  "origQty": "0.5",
  "executedQty": "0.5",
  "cummulativeQuoteQty": "22500",
  "status": "FILLED",
  "timeInForce": "GTC",
  "type": "LIMIT",
  "side": "BUY",
  "stopPrice": "0",
  "icebergQty": "0",
  "time": 1619345678901,
  "updateTime": 1619345879901
}
```

---

### 3.6 Cancelar Orden
**Endpoint:** `POST /orders/cancel-all/:symbol`  
**Método:** POST  
**Autenticación:** Requerida  

**Parámetros:**
- `symbol` (path): Par (ej: BTCUSDT)

**Respuesta (200):**
```json
{
  "message": "Se cancelaron 2 órdenes para el símbolo BTCUSDT",
  "canceledOrdersCount": 2
}
```

---

### 3.7 Obtener Todas las Órdenes
**Endpoint:** `GET /orders/:symbol`  
**Método:** GET  
**Autenticación:** Requerida  

**Parámetros Query:**
- `limit` (opcional): Máximo de órdenes (default: 500)
- `fromId` (opcional): ID para paginación

**Respuesta (200):**
```json
[
  {
    "symbol": "BTCUSDT",
    "orderId": 123456789,
    "price": "45000",
    "origQty": "0.5",
    "executedQty": "0.5",
    "status": "FILLED",
    "type": "LIMIT",
    "side": "BUY"
  }
]
```

---

### 3.8 Obtener Velas/Candlestick
**Endpoint:** `GET /candles/:symbol`  
**Método:** GET  
**Autenticación:** Requerida  

**Parámetros Query:**
- `symbol` (requerido): Par (ej: BTCUSDT)
- `interval` (requerido): 1m, 5m, 15m, 1h, 4h, 1d, etc
- `limit` (requerido): Número de velas

**Ejemplo:** `GET /candles?symbol=BTCUSDT&interval=1h&limit=100`

**Respuesta (200):**
```json
[
  {
    "openTime": 1619345678901,
    "open": "45000",
    "high": "45500",
    "low": "44500",
    "close": "45200",
    "volume": "100.5",
    "closeTime": 1619349278901
  }
]
```

---

## 4. ENDPOINTS DE ÓRDENES MARGIN

### 4.1 Crear Orden Limit Margin Cruzado
**Endpoint:** `POST /order/limit/cross`  
**Método:** POST  
**Autenticación:** Requerida  

**Body de Solicitud:** Igual a orden limit spot
```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": "0.5",
  "price": "45000",
  "timeInForce": "GTC"
}
```

---

### 4.2 Crear Orden Market Margin Cruzado
**Endpoint:** `POST /order/market/cross`  
**Método:** POST  
**Autenticación:** Requerida  

**Body de Solicitud:**
```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": "0.5"
}
```

---

### 4.3 Crear Orden OCO Margin Cruzado
**Endpoint:** `POST /order/oco/cross-margin`  
**Método:** POST  
**Autenticación:** Requerida  

---

### 4.4 Crear Stop Loss Margin Cruzado
**Endpoint:** `POST /order/limit/cross`  
(Mismo endpoint, añadiendo stopPrice)

---

### 4.5 Cancelar Orden Margin
**Endpoint:** `POST /margin-cross/order/cancel/:symbol/:orderId`  
**Método:** POST  
**Autenticación:** Requerida  

**Parámetros:**
- `symbol` (path): Par
- `orderId` (path): ID de la orden

---

### 4.6 Cancelar Todas las Órdenes Margin
**Endpoint:** `POST /margin-cross/orders/cancel-all/:symbol`  
**Método:** POST  
**Autenticación:** Requerida  

---

### 4.7 Cancelar Órdenes Margin por Lado
**Endpoint:** `POST /margin-cross/orders/cancel/:symbol`  
**Método:** POST  
**Autenticación:** Requerida  

**Parámetros Query:**
- `side` (requerido): "BUY" o "SELL"

---

### 4.8 Obtener Posiciones Margin
**Endpoint:** `GET /margin-cross/positions`  
**Método:** GET  
**Autenticación:** Requerida  

**Respuesta (200):**
```json
[
  {
    "symbol": "BTCUSDT",
    "positionAmt": "0.5",
    "entryPrice": "45000",
    "markPrice": "46000",
    "unRealizedProfit": "500"
  }
]
```

---

### 4.9 Obtener Posición Específica
**Endpoint:** `GET /margin-cross/position/:symbol`  
**Método:** GET  
**Autenticación:** Requerida  

---

### 4.10 Obtener P&L No Realizado
**Endpoint:** `GET /margin-cross/unrealized-profit/:symbol`  
**Método:** GET  
**Autenticación:** Requerida  

---

### 4.11 Repagar Préstamo Margin
**Endpoint:** `POST /margin-cross/repay`  
**Método:** POST  
**Autenticación:** Requerida  

**Body de Solicitud:**
```json
{
  "asset": "USDT",
  "amount": "1000"
}
```

---

## 5. CÓMO PASAR ESTRATEGIAS

Las estrategias se pasan a través de la solicitud y se incluyen en el contexto de ejecución.

### Formato de Estrategia en Órdenes:

Cuando creas una orden, el sistema automáticamente:
1. Captura el contexto de la estrategia (si está en contexto)
2. Genera un `clientOrderId` único basado en la estrategia
3. Registra la orden en la base de datos
4. Calcula P&L basado en lotes FIFO

### Contexto de Estrategia (Interno):

```typescript
{
  strategyId: "strategy-1",
  strategyType: "GRID_TRADING",
  symbol: "BTCUSDT",
  config: {
    gridLevels: 10,
    profitMargin: 0.01,
    leverage: 2
  }
}
```

### Parámetros para pasar con órdenes:

```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": "0.5",
  "price": "45000",
  "metadata": {
    "strategyId": "grid-strategy-1",
    "strategyType": "GRID_TRADING"
  }
}
```

---

## 6. EJEMPLOS DE CONSUMO

### Ejemplo 1: JavaScript/Node.js

```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:3000/binance';
const TOKEN = 'your_jwt_token_here';

// Headers
const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

// 1. Obtener dashboard de fondos
async function getWalletSummary() {
  try {
    const response = await axios.get(`${API_BASE}/wallet/funds-summary`, { headers });
    console.log('Wallet Summary:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// 2. Crear orden LIMIT
async function createLimitOrder(symbol, side, quantity, price) {
  try {
    const response = await axios.post(`${API_BASE}/order/limit`, 
      {
        symbol,
        side,
        quantity,
        price,
        timeInForce: 'GTC'
      },
      { headers }
    );
    console.log('Order Created:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// 3. Obtener análisis de riesgo
async function getRiskMetrics() {
  try {
    const response = await axios.get(`${API_BASE}/analysis/risk-metrics`, { headers });
    console.log('Risk Metrics:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Ejecutar
(async () => {
  await getWalletSummary();
  await getRiskMetrics();
  await createLimitOrder('BTCUSDT', 'BUY', '0.5', '45000');
})();
```

---

### Ejemplo 2: React/TypeScript

```typescript
import axios, { AxiosInstance } from 'axios';

interface BinanceAPIClient {
  getWalletFunds(): Promise<any>;
  getAssetPerformance(): Promise<any>;
  createLimitOrder(symbol: string, side: string, quantity: string, price: string): Promise<any>;
}

class BinanceClient implements BinanceAPIClient {
  private client: AxiosInstance;
  
  constructor(token: string) {
    this.client = axios.create({
      baseURL: 'http://localhost:3000/binance',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getWalletFunds() {
    const response = await this.client.get('/wallet/funds-summary');
    return response.data;
  }

  async getAssetPerformance() {
    const response = await this.client.get('/analysis/asset-performance');
    return response.data;
  }

  async getRiskMetrics() {
    const response = await this.client.get('/analysis/risk-metrics');
    return response.data;
  }

  async createLimitOrder(symbol: string, side: string, quantity: string, price: string) {
    const response = await this.client.post('/order/limit', {
      symbol,
      side,
      quantity,
      price,
      timeInForce: 'GTC'
    });
    return response.data;
  }

  async createMarketOrder(symbol: string, side: string, quantity: string) {
    const response = await this.client.post('/order/market', {
      symbol,
      side,
      quantity
    });
    return response.data;
  }
}

// Uso en React
export function TradingDashboard() {
  const [walletData, setWalletData] = useState(null);
  const client = new BinanceClient('your_token');

  useEffect(() => {
    async function loadData() {
      const data = await client.getWalletFunds();
      setWalletData(data);
    }
    loadData();
  }, []);

  return (
    <div>
      <h1>Total Funds: ${walletData?.totalFunds?.totalUSDT}</h1>
      <p>Available: ${walletData?.totalFunds?.totalAvailableUSDT}</p>
    </div>
  );
}
```

---

### Ejemplo 3: cURL

```bash
# 1. Obtener dashboard de fondos
curl -X GET http://localhost:3000/binance/wallet/funds-summary \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# 2. Crear orden LIMIT
curl -X POST http://localhost:3000/binance/order/limit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "side": "BUY",
    "quantity": "0.5",
    "price": "45000",
    "timeInForce": "GTC"
  }'

# 3. Crear orden MARKET
curl -X POST http://localhost:3000/binance/order/market \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "side": "BUY",
    "quantity": "0.5"
  }'

# 4. Obtener análisis de riesgo
curl -X GET http://localhost:3000/binance/analysis/risk-metrics \
  -H "Authorization: Bearer YOUR_TOKEN"

# 5. Obtener performance por activo
curl -X GET http://localhost:3000/binance/analysis/asset-performance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## NOTAS IMPORTANTES

### Validaciones

1. **Symbol**: Debe existir en Binance (ej: BTCUSDT, ETHUSDT)
2. **Cantidad**: Debe cumplir los límites mínimos y máximos de Binance
3. **Precio**: Debe cumplir con los decimales permitidos del símbolo
4. **Side**: Solo acepta "BUY" o "SELL"
5. **Token JWT**: Debe ser válido y no expirado

### Límites

- Las órdenes tienen un `recvWindow` de 10,000 ms (10 segundos)
- Las solicitudes de margen requieren `ENABLE_MARGIN_IN_DEV=true` en desarrollo
- Máximo 500 órdenes por solicitud en endpoints de listado

### Manejo de Errores

Todos los errores siguen este formato:

```json
{
  "statusCode": 400,
  "message": "Descripción del error",
  "error": "Bad Request"
}
```

### Timestamps

- Todos los timestamps están en UTC
- Formato: ISO 8601 (ej: 2026-04-26T02:30:00.000Z)

---

## Versión API: 1.0
**Última actualización:** 26 de Abril, 2026
