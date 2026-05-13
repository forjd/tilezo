import type { TilePosition } from "../packages/engine/src";
import {
  AVATAR_SHIRT_COLORS,
  DEFAULT_AVATAR_APPEARANCE,
  type RoomSnapshotMessage,
  type ServerMessage,
} from "../packages/protocol/src";

type Scenario = "auth" | "room" | "movement" | "chat" | "full";

export type StressOptions = {
  apiUrl: string;
  wsUrl: string;
  bots: number;
  concurrency: number;
  scenario: Scenario;
  usernamePrefix: string;
  password: string;
  roomId: string;
  moves: number;
  messages: number;
  durationSeconds: number;
  moveIntervalMs: number;
  chatIntervalMs: number;
};

type BotResult = {
  botId: number;
  username: string;
  ok: boolean;
  timings: Record<string, number>;
  counters: BotCounters;
  error?: string;
};

type BotSession = {
  token: string;
  userId: string;
  username: string;
};

type BotCounters = {
  moves: number;
  messages: number;
};

const DEFAULT_OPTIONS: StressOptions = {
  apiUrl: "http://localhost:3000",
  wsUrl: "ws://localhost:3000/ws",
  bots: 25,
  concurrency: 10,
  scenario: "full",
  usernamePrefix: `stress_${Date.now().toString(36)}`,
  password: "stress-password",
  roomId: "lobby",
  moves: 6,
  messages: 2,
  durationSeconds: 0,
  moveIntervalMs: 1000,
  chatIntervalMs: 5000,
};

if (import.meta.main) {
  if (Bun.argv.includes("--help") || Bun.argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const options = parseArgs(Bun.argv.slice(2));
  const results = await runStressTest(options);
  printSummary(options, results);
  process.exit(results.every((result) => result.ok) ? 0 : 1);
}

export function parseArgs(args: string[]): StressOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey ?? "";
    const value = inlineValue ?? args[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }

    if (value === undefined) {
      throw new Error(`Missing value for --${key}`);
    }

    applyOption(options, key, value);
  }

  return validateOptions(options);
}

export async function runStressTest(options: StressOptions): Promise<BotResult[]> {
  const botIds = Array.from({ length: options.bots }, (_, index) => index + 1);
  return runConcurrent(botIds, options.concurrency, (botId) => runBot(botId, options));
}

export function summarizeResults(results: BotResult[]): {
  total: number;
  succeeded: number;
  failed: number;
  averageMs: number;
  p95Ms: number;
  moves: number;
  messages: number;
} {
  const durations = results
    .map((result) => result.timings.total)
    .filter((duration): duration is number => typeof duration === "number")
    .sort((a, b) => a - b);
  const totalDuration = durations.reduce((total, duration) => total + duration, 0);
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);

  return {
    total: results.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    averageMs: durations.length === 0 ? 0 : totalDuration / durations.length,
    p95Ms: durations[p95Index] ?? 0,
    moves: results.reduce((total, result) => total + result.counters.moves, 0),
    messages: results.reduce((total, result) => total + result.counters.messages, 0),
  };
}

async function runBot(botId: number, options: StressOptions): Promise<BotResult> {
  const username = `${options.usernamePrefix}_${botId}`;
  const timings: Record<string, number> = {};
  const counters: BotCounters = { moves: 0, messages: 0 };
  const totalStart = performance.now();
  let socket: WebSocket | undefined;

  try {
    const registered = await timed(timings, "register", () =>
      authenticate(options.apiUrl, "register", username, options.password),
    );
    const session = includesAuthLogin(options.scenario)
      ? await timed(timings, "login", () =>
          authenticate(options.apiUrl, "login", username, options.password),
        )
      : registered;

    if (options.scenario === "auth") {
      timings.total = performance.now() - totalStart;
      return { botId, username, ok: true, timings, counters };
    }

    await timed(timings, "appearance", () =>
      updateAppearance(options.apiUrl, session.token, botAppearance(botId)),
    );

    socket = await timed(timings, "connect", () => connectWebSocket(options.wsUrl, session.token));
    const snapshot = await timed(timings, "join", () =>
      joinRoom(socket as WebSocket, session.userId, options.roomId),
    );

    if (options.durationSeconds > 0) {
      await timed(timings, "steady", () =>
        runSteady(socket as WebSocket, session.userId, username, snapshot, options, counters),
      );
      timings.total = performance.now() - totalStart;
      return { botId, username, ok: true, timings, counters };
    }

    if (options.scenario === "room") {
      timings.total = performance.now() - totalStart;
      return { botId, username, ok: true, timings, counters };
    }

    if (includesMovement(options.scenario)) {
      counters.moves += await timed(timings, "movement", () =>
        runMovement(socket as WebSocket, session.userId, snapshot, options.moves, 0),
      );
    }

    if (includesChat(options.scenario)) {
      counters.messages += await timed(timings, "chat", () =>
        runChat(socket as WebSocket, session.userId, username, options.messages, 0),
      );
    }

    timings.total = performance.now() - totalStart;
    return { botId, username, ok: true, timings, counters };
  } catch (error) {
    timings.total = performance.now() - totalStart;
    return {
      botId,
      username,
      ok: false,
      timings,
      counters,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    socket?.close();
  }
}

async function authenticate(
  apiUrl: string,
  mode: "register" | "login",
  username: string,
  password: string,
): Promise<BotSession> {
  const response = await fetch(`${apiUrl}/auth/${mode}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  const body = (await response.json()) as {
    token?: string;
    user?: { id?: string; username?: string };
    error?: { message?: string };
  };

  if (!response.ok || !body.token || !body.user?.id || !body.user.username) {
    throw new Error(body.error?.message ?? `${mode} failed`);
  }

  return {
    token: body.token,
    userId: body.user.id,
    username: body.user.username,
  };
}

async function updateAppearance(
  apiUrl: string,
  token: string,
  appearance: typeof DEFAULT_AVATAR_APPEARANCE,
): Promise<void> {
  const response = await fetch(`${apiUrl}/me/appearance`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ appearance }),
  });

  if (!response.ok) {
    const body = (await safeJson(response)) as { error?: { message?: string } } | undefined;
    throw new Error(body?.error?.message ?? "appearance update failed");
  }
}

function connectWebSocket(wsUrl: string, token: string): Promise<WebSocket> {
  const url = new URL(wsUrl);
  url.searchParams.set("token", token);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("websocket connect timed out"));
    }, 5000);

    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("websocket connection failed"));
    });
  });
}

async function joinRoom(
  socket: WebSocket,
  userId: string,
  roomId: string,
): Promise<RoomSnapshotMessage> {
  socket.send(JSON.stringify({ type: "room.join", roomId }));
  return waitForMessage(
    socket,
    (message): message is RoomSnapshotMessage => message.type === "room.snapshot",
    userId,
  );
}

async function runMovement(
  socket: WebSocket,
  userId: string,
  snapshot: RoomSnapshotMessage,
  moves: number,
  startIndex: number,
): Promise<number> {
  const targets = snapshot.tiles.filter((tile) => tile.walkable);

  if (targets.length === 0) {
    throw new Error("joined room has no walkable tiles");
  }

  for (let index = 0; index < moves; index += 1) {
    await sendMove(socket, userId, targets, startIndex + index);
  }

  return moves;
}

async function runChat(
  socket: WebSocket,
  userId: string,
  username: string,
  messages: number,
  startIndex: number,
): Promise<number> {
  for (let index = 0; index < messages; index += 1) {
    await sendChat(socket, userId, username, startIndex + index + 1);
  }

  return messages;
}

async function runSteady(
  socket: WebSocket,
  userId: string,
  username: string,
  snapshot: RoomSnapshotMessage,
  options: StressOptions,
  counters: BotCounters,
): Promise<void> {
  const targets = snapshot.tiles.filter((tile) => tile.walkable);
  const runMovementLoop = includesMovement(options.scenario);
  const runChatLoop = includesChat(options.scenario);
  const deadline = performance.now() + options.durationSeconds * 1000;
  let nextMoveAt = performance.now();
  let nextChatAt = performance.now();
  let moveIndex = 0;
  let messageIndex = 0;

  if (runMovementLoop && targets.length === 0) {
    throw new Error("joined room has no walkable tiles");
  }

  while (performance.now() < deadline) {
    const now = performance.now();
    let acted = false;

    if (runMovementLoop && now >= nextMoveAt) {
      await sendMove(socket, userId, targets, moveIndex);
      moveIndex += 1;
      counters.moves += 1;
      nextMoveAt = performance.now() + options.moveIntervalMs;
      acted = true;
    }

    if (runChatLoop && performance.now() >= nextChatAt) {
      messageIndex += 1;
      await sendChat(socket, userId, username, messageIndex);
      counters.messages += 1;
      nextChatAt = performance.now() + options.chatIntervalMs;
      acted = true;
    }

    if (!acted) {
      const nextActionAt = Math.min(
        runMovementLoop ? nextMoveAt : Number.POSITIVE_INFINITY,
        runChatLoop ? nextChatAt : Number.POSITIVE_INFINITY,
        deadline,
      );
      await sleep(Math.max(0, Math.min(100, nextActionAt - performance.now())));
    }
  }
}

async function sendMove(
  socket: WebSocket,
  userId: string,
  targets: TilePosition[],
  index: number,
): Promise<void> {
  const tile = targets[index % targets.length] as TilePosition;
  const target = { x: tile.x, y: tile.y };
  socket.send(JSON.stringify({ type: "avatar.move.request", target }));
  await waitForMessage(
    socket,
    (message) =>
      (message.type === "avatar.moved" && message.userId === userId) || message.type === "error",
    userId,
  );
}

async function sendChat(
  socket: WebSocket,
  userId: string,
  username: string,
  messageNumber: number,
): Promise<void> {
  const text = `stress message ${messageNumber} from ${username}`;
  socket.send(JSON.stringify({ type: "chat.say", text }));
  await waitForMessage(
    socket,
    (message) =>
      (message.type === "chat.message" && message.userId === userId) || message.type === "error",
    userId,
  );
}

function waitForMessage<T extends ServerMessage>(
  socket: WebSocket,
  predicate: (message: ServerMessage) => message is T,
  userId: string,
): Promise<T>;
function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  userId: string,
): Promise<ServerMessage>;
function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  userId: string,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for server message for ${userId}`));
    }, 5000);
    const onMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;

        if (message.type === "error") {
          cleanup();
          reject(new Error(`${message.code}: ${message.message}`));
          return;
        }

        if (predicate(message)) {
          cleanup();
          resolve(message);
        }
      } catch {
        cleanup();
        reject(new Error("invalid websocket message"));
      }
    };

    const onClose = () => {
      cleanup();
      reject(new Error("websocket closed"));
    };

    function cleanup() {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
    }

    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);
  });
}

async function timed<T>(
  timings: Record<string, number>,
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    return await action();
  } finally {
    timings[name] = (timings[name] ?? 0) + performance.now() - startedAt;
  }
}

async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await task(items[currentIndex] as T);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function applyOption(options: StressOptions, key: string, value: string): void {
  switch (key) {
    case "api":
      options.apiUrl = value;
      break;
    case "ws":
      options.wsUrl = value;
      break;
    case "bots":
      options.bots = parsePositiveInteger(key, value);
      break;
    case "concurrency":
      options.concurrency = parsePositiveInteger(key, value);
      break;
    case "scenario":
      options.scenario = parseScenario(value);
      break;
    case "username-prefix":
      options.usernamePrefix = value;
      break;
    case "password":
      options.password = value;
      break;
    case "room":
      options.roomId = value;
      break;
    case "moves":
      options.moves = parseNonNegativeInteger(key, value);
      break;
    case "messages":
      options.messages = parseNonNegativeInteger(key, value);
      break;
    case "duration":
      options.durationSeconds = parseNonNegativeNumber(key, value);
      break;
    case "move-interval-ms":
      options.moveIntervalMs = parsePositiveInteger(key, value);
      break;
    case "chat-interval-ms":
      options.chatIntervalMs = parsePositiveInteger(key, value);
      break;
    default:
      throw new Error(`Unknown option --${key}`);
  }
}

function validateOptions(options: StressOptions): StressOptions {
  if (options.concurrency > options.bots) {
    options.concurrency = options.bots;
  }

  if (!options.usernamePrefix.trim()) {
    throw new Error("--username-prefix cannot be empty");
  }

  if (!options.roomId.trim()) {
    throw new Error("--room cannot be empty");
  }

  return options;
}

function parseScenario(value: string): Scenario {
  if (
    value === "auth" ||
    value === "room" ||
    value === "movement" ||
    value === "chat" ||
    value === "full"
  ) {
    return value;
  }

  throw new Error("--scenario must be one of auth, room, movement, chat, full");
}

function parsePositiveInteger(key: string, value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${key} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(key: string, value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${key} must be a non-negative integer`);
  }

  return parsed;
}

function parseNonNegativeNumber(key: string, value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--${key} must be a non-negative number`);
  }

  return parsed;
}

function includesAuthLogin(scenario: Scenario): boolean {
  return scenario === "auth" || scenario === "full";
}

function includesMovement(scenario: Scenario): boolean {
  return scenario === "movement" || scenario === "full";
}

function includesChat(scenario: Scenario): boolean {
  return scenario === "chat" || scenario === "full";
}

function botAppearance(botId: number): typeof DEFAULT_AVATAR_APPEARANCE {
  return {
    ...DEFAULT_AVATAR_APPEARANCE,
    shirtColor: AVATAR_SHIRT_COLORS[botId % AVATAR_SHIRT_COLORS.length],
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function printSummary(options: StressOptions, results: BotResult[]): void {
  const summary = summarizeResults(results);
  const failures = results.filter((result) => !result.ok).slice(0, 10);

  console.log("Tilezo stress test");
  console.log(`Scenario: ${options.scenario}`);
  if (options.durationSeconds > 0) {
    console.log(`Duration: ${options.durationSeconds.toString()}s`);
  }
  console.log(`Bots: ${summary.total} (${summary.succeeded} ok, ${summary.failed} failed)`);
  console.log(`Actions: ${summary.moves} moves, ${summary.messages} messages`);
  console.log(`Average: ${summary.averageMs.toFixed(1)}ms`);
  console.log(`P95: ${summary.p95Ms.toFixed(1)}ms`);

  if (failures.length > 0) {
    console.log("Failures:");

    for (const failure of failures) {
      console.log(`- ${failure.username}: ${failure.error}`);
    }
  }
}

function printUsage(): void {
  console.log(`Usage: bun run stress -- [options]

Options:
  --api <url>              HTTP API URL (default: http://localhost:3000)
  --ws <url>               WebSocket URL (default: ws://localhost:3000/ws)
  --bots <count>           Number of simulated users (default: 25)
  --concurrency <count>    Concurrent simulated users (default: 10)
  --scenario <name>        auth, room, movement, chat, or full (default: full)
  --username-prefix <text> Username prefix for generated accounts
  --password <text>        Password for generated accounts
  --room <room-id>         Room to join (default: lobby)
  --moves <count>          Movement requests per bot (default: 6)
  --messages <count>       Chat messages per bot (default: 2)
  --duration <seconds>     Keep bots connected and active for this long
  --move-interval-ms <ms>  Timed-mode movement interval (default: 1000)
  --chat-interval-ms <ms>  Timed-mode chat interval (default: 5000)
`);
}
