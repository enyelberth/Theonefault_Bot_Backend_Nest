const requireEnvSecret = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} no está configurado. Defínelo como variable de entorno (ver .env.example); nunca uses un valor por defecto en el código fuente.`,
    );
  }
  return value;
};

export const jwtConstants = {
  get secret(): string {
    return requireEnvSecret('JWT_SECRET');
  },
};

export const jwtRefreshConstants = {
  get secret(): string {
    return requireEnvSecret('JWT_REFRESH_SECRET');
  },
};
