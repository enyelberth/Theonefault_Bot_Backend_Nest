function isTrue(value?: string): boolean {
  if (!value) {
    return false;
  }

  return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
}

function getMissing(requiredKeys: string[]): string[] {
  return requiredKeys.filter((key) => {
    const value = process.env[key];
    return !value || value.trim() === '';
  });
}

export function validateRuntimeEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableMarginInDev = isTrue(process.env.ENABLE_MARGIN_IN_DEV);

  const required = [
    'DATABASE_URL',
    'BINANCE_API_KEY',
    'BINANCE_API_SECRET',
    'BASE_URL',
  ];

  if (isProduction) {
    required.push('BOOT', 'SOFIA_BOT');
  }

  const missing = getMissing(required);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(', ')}. ` +
        'Revisa tu archivo .env y la selección PROD/DEV.',
    );
  }

  if (
    !isProduction &&
    !enableMarginInDev &&
    process.env.BASE_URL?.includes('api.binance.com')
  ) {
    console.warn(
      '[ENV] Estás en desarrollo con BASE_URL de producción. ' +
        'Si quieres testnet usa BASE_URL_DEV=https://testnet.binance.vision.',
    );
  }
}
