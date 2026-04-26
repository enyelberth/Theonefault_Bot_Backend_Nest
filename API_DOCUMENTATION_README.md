# 📖 Documentación API - Cómo Usar

Este directorio contiene dos archivos de documentación completa para consumir la API de Binance Bot.

## 📁 Archivos Disponibles

### 1. **ENDPOINTS_BINANCE.md** 
- Documentación **legible** en Markdown
- **Ideal para:** Desarrolladores, Claude, documentación de proyecto
- **Contiene:** Explicaciones detalladas, ejemplos de uso, guías paso a paso
- **Cómo usar:** 
  - Abre en cualquier editor de texto
  - Importa a Notion, Confluence, GitHub Wiki
  - Pasa a Claude para contexto

### 2. **ENDPOINTS_BINANCE.json**
- Documentación **estructurada** en JSON
- **Ideal para:** Consumo por aplicaciones frontend, parseo automático
- **Contiene:** Estructura de datos lista para parsear programáticamente
- **Cómo usar:**
  - Importa en tu aplicación frontend
  - Usa para generar documentación automáticamente
  - Valida parámetros contra esta especificación

---

## 🚀 Cómo Pasar la Documentación a Claude

### Opción 1: Pasar el Markdown (Recomendado para prompts)

```
Aquí está la documentación de todos los endpoints disponibles:

[Copia y pega el contenido de ENDPOINTS_BINANCE.md]

Con esta documentación, por favor [tu solicitud]
```

### Opción 2: Pasar el JSON (Recomendado para procesamiento)

```
Tengo esta especificación de API en JSON:

[Copia y pega el contenido de ENDPOINTS_BINANCE.json]

Necesito que [tu solicitud]
```

### Opción 3: Pasar ambos (Máxima claridad)

```
Documentación en Markdown (para lectura humana):
[Copia ENDPOINTS_BINANCE.md]

Especificación en JSON (para estructura):
[Copia ENDPOINTS_BINANCE.json]

Por favor, usa ambas para [tu solicitud]
```

---

## 📚 Resumen Rápido de Endpoints

### Endpoints de Dashboard (4)
```
GET  /wallet/funds-summary              - Dashboard completo de fondos
GET  /balance/consolidated              - Balance consolidado
GET  /balance/available-to-trade        - Capital disponible
GET  /balance/estimated-total-value     - Valor total portafolio
```

### Endpoints de Análisis (3)
```
GET  /analysis/asset-performance        - Rentabilidad por activo
GET  /analysis/risk-metrics             - Métricas avanzadas de riesgo
GET  /margin-cross/utilization          - Utilización de margen
```

### Endpoints de Órdenes Spot (7)
```
POST /order/limit                       - Crear orden limit
POST /order/market                      - Crear orden market
POST /order/oco                         - Crear orden OCO
GET  /order/:symbol/:orderId            - Verificar estado
POST /orders/cancel-all/:symbol         - Cancelar órdenes
GET  /orders/:symbol                    - Historial de órdenes
GET  /candles                           - Obtener velas OHLCV
```

### Endpoints de Órdenes Margin (5)
```
POST /order/limit/cross                 - Orden limit margin
POST /order/market/cross                - Orden market margin
POST /margin-cross/order/cancel/:symbol/:orderId  - Cancelar
GET  /margin-cross/positions            - Obtener posiciones
POST /margin-cross/repay                - Repagar préstamo
```

**Total: 19 endpoints disponibles**

---

## 🔐 Autenticación

### Pasos para Autenticar

1. **Obtén un JWT Token:**
   ```bash
   POST /auth/login
   {
     "email": "tu@email.com",
     "password": "tu_contraseña"
   }
   ```

2. **Usa el token en todos los requests:**
   ```javascript
   headers: {
     'Authorization': 'Bearer YOUR_JWT_TOKEN',
     'Content-Type': 'application/json'
   }
   ```

3. **Cuando expire (generalmente después de 24h), obtén uno nuevo**

---

## 💡 Ejemplos Rápidos

### JavaScript/Node.js
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3000/binance',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  }
});

// Obtener dashboard
const dashboard = await api.get('/wallet/funds-summary');
console.log(dashboard.data);

// Crear orden
const order = await api.post('/order/limit', {
  symbol: 'BTCUSDT',
  side: 'BUY',
  quantity: '0.5',
  price: '45000'
});
```

### React Hook
```typescript
import { useState, useEffect } from 'react';
import axios from 'axios';

export function WalletDashboard() {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const { data } = await axios.get(
          'http://localhost:3000/binance/wallet/funds-summary',
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          }
        );
        setWallet(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchWallet();
  }, []);

  if (loading) return <div>Cargando...</div>;
  
  return (
    <div>
      <h1>Total: ${wallet?.totalFunds?.totalUSDT}</h1>
      <p>Disponible: ${wallet?.totalFunds?.totalAvailableUSDT}</p>
    </div>
  );
}
```

### Python
```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
}

# Obtener dashboard
response = requests.get(
    'http://localhost:3000/binance/wallet/funds-summary',
    headers=headers
)
dashboard = response.json()
print(f"Total: ${dashboard['totalFunds']['totalUSDT']}")

# Crear orden
order_data = {
    'symbol': 'BTCUSDT',
    'side': 'BUY',
    'quantity': '0.5',
    'price': '45000'
}
response = requests.post(
    'http://localhost:3000/binance/order/limit',
    json=order_data,
    headers=headers
)
order = response.json()
print(f"Orden creada: {order['orderId']}")
```

---

## ⚠️ Errores Comunes

### Error 401: Unauthorized
**Causa:** Token expirado o inválido  
**Solución:** Obtén un nuevo token y vuelve a intentar

### Error 400: Bad Request
**Causa:** Parámetros inválidos o faltantes  
**Solución:** Verifica que todos los parámetros requeridos estén presentes y sean del tipo correcto

### Error 404: Not Found
**Causa:** El símbolo no existe o la orden no se encuentra  
**Solución:** Verifica que el símbolo sea válido (ej: BTCUSDT, no BTC)

### Error 500: Internal Server Error
**Causa:** Error en el servidor  
**Solución:** Intenta de nuevo en unos minutos, contacta a soporte si persiste

---

## 📊 Estructura de Respuestas

Todas las respuestas exitosas (200/201) siguen este formato:

```json
{
  "timestamp": "2026-04-26T02:30:00.000Z",
  "data": { /* contenido específico del endpoint */ }
}
```

Las respuestas de error (400/401/404/500) siguen:

```json
{
  "statusCode": 400,
  "message": "Descripción del error",
  "error": "Bad Request"
}
```

---

## 🎯 Cómo Pasar Estrategias

Cuando crees órdenes, puedes incluir información de estrategia (opcional):

```javascript
// Crear orden con contexto de estrategia
const order = await api.post('/order/limit', {
  symbol: 'BTCUSDT',
  side: 'BUY',
  quantity: '0.5',
  price: '45000',
  timeInForce: 'GTC',
  // Información de estrategia (el sistema la captura automáticamente)
  metadata: {
    strategyId: 'grid-strategy-1',
    strategyType: 'GRID_TRADING'
  }
});
```

El sistema automáticamente:
1. Genera un `clientOrderId` único basado en la estrategia
2. Registra la orden en la base de datos
3. Calcula P&L cuando se complete

---

## 🔄 Flujo Típico de Una Sesión de Trading

```
1. AUTENTICACIÓN
   POST /auth/login → obtiene JWT token

2. VERIFICAR FONDOS
   GET /wallet/funds-summary → ve tu capital disponible
   GET /balance/available-to-trade → ve poder de compra

3. ANALIZAR PORTAFOLIO
   GET /analysis/asset-performance → rentabilidad por activo
   GET /analysis/risk-metrics → métricas de riesgo

4. CREAR ORDEN
   POST /order/limit → crea orden limit (spot)
   O
   POST /order/market → crea orden market (spot)
   O
   POST /order/limit/cross → crea con margen

5. MONITOREAR
   GET /order/:symbol/:orderId → verifica estado
   GET /margin-cross/utilization → monitorea riesgo

6. CERRAR POSICIÓN
   POST /order/market → vende a precio mercado
   O
   POST /margin-cross/repay → repaga deuda si usaste margen
```

---

## 📞 Soporte

Si encuentras problemas:

1. **Verifica la autenticación:** ¿El token es válido?
2. **Verifica los parámetros:** ¿Están correctos y completos?
3. **Revisa los ejemplos:** ¿Están en el formato correcto?
4. **Lee el error:** El mensaje de error es muy descriptivo
5. **Contacta a soporte:** Si nada funciona

---

## 📅 Historial de Versiones

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-04-26 | Versión inicial con 19 endpoints |

---

## ✅ Checklist para Pasar a Frontend/Claude

- [ ] He leído los archivos `ENDPOINTS_BINANCE.md` y `ENDPOINTS_BINANCE.json`
- [ ] Entiendo la estructura de autenticación (Bearer Token)
- [ ] Sé cómo crear órdenes (limit, market, margin)
- [ ] Sé cómo consultar balance y fondos
- [ ] Sé cómo analizar performance y riesgo
- [ ] He visto ejemplos en mi lenguaje de programación
- [ ] Entiendo cómo manejar errores

---

**¡Listo para consumir la API! 🚀**
