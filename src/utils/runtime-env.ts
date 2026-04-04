type EnvMode = 'PROD' | 'DEV';

function isTrue(value?: string): boolean {
  if (!value) {
    return false;
  }

  return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
}

function resolveMode(): EnvMode {
  const productionFlag = process.env.PRODUCTION ?? process.env.production;
  return isTrue(productionFlag) ? 'PROD' : 'DEV';
}

export function applyRuntimeEnvMode(): void {
  const mode = resolveMode();
  const keys = [
    'DATABASE_URL',
    'DIRECT_URL',
    'BINANCE_API_KEY',
    'BINANCE_API_SECRET',
    'BASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'GEMINI_API_KEY',
  ];

  const legacyFallbacks: Record<EnvMode, Record<string, string[]>> = {
    PROD: {
      DATABASE_URL: ['DATABASE_URL3', 'DATABASE_URL4'],
      DIRECT_URL: ['DIRECT_URL'],
      BASE_URL: ['BASE_URL'],
      BINANCE_API_KEY: ['BINANCE_API_KEY_PROD', 'BINANCE_API_KEY'],
      BINANCE_API_SECRET: ['BINANCE_API_SECRET_PROD', 'BINANCE_API_SECRET'],
    },
    DEV: {
      DATABASE_URL: ['DATABASE_URL', 'DATABASE_URL4'],
      DIRECT_URL: ['DIRECT_URL'],
      BASE_URL: ['BASE_URL2', 'BASE_URL'],
      BINANCE_API_KEY: ['BINANCE_API_KEY_DEV', 'BINANCE_API_KEY2', 'BINANCE_API_KEY'],
      BINANCE_API_SECRET: ['BINANCE_API_SECRET_DEV', 'BINANCE_API_SECRET2', 'BINANCE_API_SECRET'],
    },
  };

  for (const key of keys) {
    const modeKey = `${key}_${mode}`;
    const modeValue = process.env[modeKey];

    if (modeValue && modeValue.trim() !== '') {
      process.env[key] = modeValue;
      continue;
    }

    const fallbacks = legacyFallbacks[mode][key] ?? [];
    for (const fallbackKey of fallbacks) {
      const fallbackValue = process.env[fallbackKey];
      if (fallbackValue && fallbackValue.trim() !== '') {
        process.env[key] = fallbackValue;
        break;
      }
    }
  }

  // Defaults explicitos para Binance por entorno cuando no se definan variables.
  if (!process.env.BASE_URL || process.env.BASE_URL.trim() === '') {
    process.env.BASE_URL = mode === 'PROD'
      ? 'https://api.binance.com'
      : 'https://testnet.binance.vision';
  }

  process.env.NODE_ENV = mode === 'PROD' ? 'production' : 'development';
}
