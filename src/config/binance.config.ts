import { registerAs } from '@nestjs/config';

export default registerAs('binance', () => ({
  apiKey: process.env.BINANCE_API_KEY || '',
  apiSecret: process.env.BINANCE_API_SECRET || '',
  baseUrl: process.env.BASE_URL || 'https://testnet.binance.vision',
  production: process.env.PRODUCTION === 'true',
}));
