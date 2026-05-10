export type ServerConfig = {
  port: number;
  databaseUrl?: string;
  nodeEnv: string;
};

export function getConfig(env = Bun.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
