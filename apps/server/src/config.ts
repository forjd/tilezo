export type ServerConfig = {
  host: string;
  port: number;
  databaseUrl?: string;
  authSecret: string;
  nodeEnv: string;
};

export function getConfig(env = Bun.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const port = Number(env.PORT ?? 3000);
  const authSecret = env.AUTH_SECRET ?? "tilezo-development-secret";
  const databaseUrl = env.DATABASE_URL;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  if (nodeEnv === "production") {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required in production");
    }

    if (!env.AUTH_SECRET || authSecret === "tilezo-development-secret" || authSecret.length < 32) {
      throw new Error("AUTH_SECRET must be set to a strong production secret");
    }
  }

  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    databaseUrl,
    authSecret,
    nodeEnv,
  };
}
