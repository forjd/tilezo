import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadServerEnv, projectRoot } from "./server-env";

const tunnelUrlPattern = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g;
const children = new Set<ChildProcess>();

const env = loadServerEnv();
const serverPort = env.PORT ?? env.SERVER_PORT ?? "3000";
const clientPort = env.CLIENT_PORT ?? "3001";

if (!commandExists("cloudflared")) {
  console.error("cloudflared is required. Install it with: brew install cloudflared");
  process.exit(1);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
process.on("exit", () => {
  for (const child of children) {
    child.kill();
  }
});

console.log(`Starting Tilezo server on http://localhost:${serverPort}`);
const server = spawnManaged("server", "bun", ["--watch", "src/index.ts"], {
  cwd: resolve(projectRoot, "apps/server"),
  env: {
    ...env,
    PORT: serverPort,
    HOST: env.HOST ?? "0.0.0.0",
  },
});

console.log(`Opening server tunnel for http://localhost:${serverPort}`);
const serverTunnel = await startTunnel("server-tunnel", `http://localhost:${serverPort}`);
const apiUrl = serverTunnel.url;
const wsUrl = toWebSocketUrl(apiUrl, "/ws");

console.log(`Starting Tilezo client on http://localhost:${clientPort}`);
const client = spawnManaged(
  "client",
  "bun",
  ["--hot", "index.html", "--host=0.0.0.0", `--port=${clientPort}`],
  {
    cwd: resolve(projectRoot, "apps/client"),
    env: {
      ...process.env,
      CLIENT_PORT: clientPort,
      PUBLIC_API_URL: apiUrl,
      PUBLIC_WS_URL: wsUrl,
    },
  },
);

console.log(`Opening client tunnel for http://localhost:${clientPort}`);
const clientTunnel = await startTunnel("client-tunnel", `http://localhost:${clientPort}`);
const clientUrl = withRuntimeConfig(clientTunnel.url, apiUrl, wsUrl);

console.log("");
console.log("Tilezo is available outside your network:");
console.log(`  Client: ${clientUrl}`);
console.log(`  API:    ${apiUrl}`);
console.log(`  WS:     ${wsUrl}`);
console.log("");
console.log("Press Ctrl+C to stop the dev servers and tunnels.");

await Promise.all([
  waitForExit(server, "server"),
  waitForExit(serverTunnel.child, "server-tunnel"),
  waitForExit(client, "client"),
  waitForExit(clientTunnel.child, "client-tunnel"),
]);

function commandExists(command: string): boolean {
  return (
    spawnSync("which", [command], {
      stdio: "ignore",
    }).status === 0
  );
}

function spawnManaged(
  label: string,
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
  },
): ChildProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.add(child);
  prefixOutput(label, child);

  child.once("exit", () => {
    children.delete(child);
  });

  child.once("error", (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
    shutdown(1);
  });

  return child;
}

async function startTunnel(
  label: string,
  targetUrl: string,
): Promise<{ child: ChildProcess; url: string }> {
  const child = spawnManaged(label, "cloudflared", ["tunnel", "--url", targetUrl], {
    cwd: projectRoot,
    env: process.env,
  });

  const url = await waitForTunnelUrl(label, child);
  return { child, url };
}

function waitForTunnelUrl(label: string, child: ChildProcess): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    const { stdout, stderr } = child;

    if (!stdout || !stderr) {
      reject(new Error(`[${label}] started without readable tunnel output`));
      shutdown(1);
    }

    const timeout = setTimeout(() => {
      reject(new Error(`[${label}] timed out waiting for a trycloudflare.com URL`));
      shutdown(1);
    }, 45_000);

    const handleData = (chunk: Buffer) => {
      const match = chunk.toString().match(tunnelUrlPattern)?.[0];

      if (match) {
        clearTimeout(timeout);
        stdout.off("data", handleData);
        stderr.off("data", handleData);
        resolveUrl(match);
      }
    };

    stdout.on("data", handleData);
    stderr.on("data", handleData);

    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(`[${label}] exited before opening a tunnel (${signal ?? code ?? "unknown"})`),
      );
    });
  });
}

function prefixOutput(label: string, child: ChildProcess): void {
  child.stdout?.on("data", (chunk: Buffer) => writePrefixedOutput(label, chunk));
  child.stderr?.on("data", (chunk: Buffer) => writePrefixedOutput(label, chunk));
}

function writePrefixedOutput(label: string, chunk: Buffer): void {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.trim()) {
      console.log(`[${label}] ${line}`);
    }
  }
}

function toWebSocketUrl(url: string, pathname: string): string {
  const parsed = new URL(url);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = pathname;
  return parsed.toString();
}

function waitForExit(child: ChildProcess, label: string): Promise<void> {
  return new Promise((resolveExit) => {
    child.once("exit", (code, signal) => {
      if (code && code !== 0) {
        console.error(`[${label}] exited with code ${code}`);
      } else if (signal) {
        console.error(`[${label}] exited from signal ${signal}`);
      }

      resolveExit();
    });
  });
}

function shutdown(code: number): never {
  for (const child of children) {
    child.kill();
  }

  process.exit(code);
}

function withRuntimeConfig(clientUrl: string, apiUrl: string, wsUrl: string): string {
  void apiUrl;
  void wsUrl;
  return clientUrl;
}
