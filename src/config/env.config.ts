const boolFlag = (v: string | undefined, fallback = false): boolean => {
  if (v === undefined) return fallback;
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
};

const clean = (v: string | undefined): string | undefined => {
  if (v === undefined) return undefined;
  const t = v.trim().replace(/^["']|["']$/g, '');
  return t.length > 0 ? t : undefined;
};

const pick = (production: string | undefined, test: string | undefined, legacy: string | undefined, isProd: boolean): string => {
  const p = clean(production);
  const t = clean(test);
  const l = clean(legacy);
  if (isProd) return p ?? l ?? '';
  return t ?? l ?? '';
};

export interface AppEnv {
  production: boolean;
  marginEnabled: boolean;
  binance: {
    baseUrl: string;
    apiKey: string;
    apiSecret: string;
  };
}

let cache: AppEnv | null = null;

export function envConfig(): AppEnv {
  if (cache) return cache;
  const production = boolFlag(process.env.PRODUCTION, false);
  const marginEnabled = boolFlag(process.env.MARGIN, false);

  const baseUrl = pick(
    process.env.BINANCE_BASE_URL_PROD,
    process.env.BINANCE_BASE_URL_TEST,
    process.env.BASE_URL,
    production,
  ) || (production ? 'https://api.binance.com' : 'https://testnet.binance.vision');

  const apiKey = pick(
    process.env.BINANCE_API_KEY_PROD,
    process.env.BINANCE_API_KEY_TEST,
    process.env.BINANCE_API_KEY,
    production,
  );

  const apiSecret = pick(
    process.env.BINANCE_API_SECRET_PROD,
    process.env.BINANCE_API_SECRET_TEST,
    process.env.BINANCE_API_SECRET,
    production,
  );

  cache = { production, marginEnabled, binance: { baseUrl, apiKey, apiSecret } };
  return cache;
}

export function resetEnvConfigCache(): void {
  cache = null;
}
