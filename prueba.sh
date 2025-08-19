#!/bin/bash

# JSON con los balances (puedes cargarlo desde un archivo o variable)
balances='[
 {
    "asset": "KMD",
    "free": "16758.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "WIN",
    "free": "18446.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "TRY",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "LTO",
    "free": "18446.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "ZAR",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "UAH",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "DAI",
    "free": "10000.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "ALPHA",
    "free": "18446.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "BRL",
    "free": "97.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "SHIB",
    "free": "18446.00",
    "locked": "0.00"
  },
  {
    "asset": "XEC",
    "free": "18446.00",
    "locked": "0.00"
  },
  {
    "asset": "LOKA",
    "free": "10618.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "BTTC",
    "free": "18446.0",
    "locked": "0.0"
  },
  {
    "asset": "BSW",
    "free": "18446.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "LEVER",
    "free": "18446.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "LUNC",
    "free": "18446.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "PLN",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "RON",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "ARS",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "PEPE",
    "free": "18446.00",
    "locked": "0.00"
  },
  {
    "asset": "FDUSD",
    "free": "11674.06903800",
    "locked": "0.00000000"
  },
  {
    "asset": "AEUR",
    "free": "440.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "1000SATS",
    "free": "18446.00",
    "locked": "0.00"
  },
  {
    "asset": "BONK",
    "free": "18446.00",
    "locked": "0.00"
  },
  {
    "asset": "JPY",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "MXN",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "COP",
    "free": "18466.00000000",
    "locked": "0.00000000"
  },
  {
    "asset": "CZK",
    "free": "18466.00000000",
    "locked": "0.00000000"
  }
]'

# Endpoint base para las órdenes market sell
url_base="http://localhost:3000/binance/order/market"

# Iteramos sobre cada asset con jq y lanzamos una orden de venta
echo "$balances" | jq -c '.[] | select(.free | tonumber > 0) | {symbol: (.asset + "USDT"), side:"SELL", quantity: .free}' | while read -r order_json; do
  symbol=$(echo "$order_json" | jq -r '.symbol')
  quantity=$(echo "$order_json" | jq -r '.quantity')

  echo "Creando orden de venta market: $symbol $quantity"

  curl -X POST "$url_base" \
    -H "accept: */*" \
    -H "Content-Type: application/json" \
    -d "$order_json"

  echo ""
done
