export type ServerConfig = {
  host: string;
  port: number;
  databaseUrl?: string;
  nodeEnv: string;
};

export function getConfig(env = Bun.env): ServerConfig {
  return {
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
