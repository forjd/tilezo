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
  preseedUsers: boolean;
  seed: number;
  setupConcurrency: number;
  requestTimeoutMs: number;
};

type BotResult = {
  botId: number;
  username: string;
  ok: boolean;
  timings: Record<string, number>;
  samples: SampleBag;
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

type SampleBag = Record<string, number[]>;

type LatencySummary = {
  count: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
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
  preseedUsers: false,
  seed: Date.now(),
  setupConcurrency: 5,
  requestTimeoutMs: 30_000,
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

    if (isBooleanFlag(key)) {
      applyOption(options, key, inlineValue ?? "true");
      continue;
    }

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

  if (options.preseedUsers) {
    const setupResults = await runConcurrent(botIds, options.setupConcurrency, (botId) =>
      preseedBot(botId, options),
    );

    if (setupResults.some((result) => !result.ok)) {
      return setupResults;
    }
  }

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
  operations: Record<string, LatencySummary>;
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
    operations: summarizeSamples(results),
  };
}

async function runBot(botId: number, options: StressOptions): Promise<BotResult> {
  const username = `${options.usernamePrefix}_${botId}`;
  const timings: Record<string, number> = {};
  const samples: SampleBag = {};
  const counters: BotCounters = { moves: 0, messages: 0 };
  const random = mulberry32(options.seed + botId * 0x9e3779b9);
  const totalStart = performance.now();
  let socket: WebSocket | undefined;

  try {
    let session: BotSession;

    if (options.preseedUsers) {
      session = await timed(timings, samples, "login", () =>
        authenticate(options.apiUrl, "login", username, options.password, options.requestTimeoutMs),
      );
    } else {
      const registered = await timed(timings, samples, "register", () =>
        authenticate(
          options.apiUrl,
          "register",
          username,
          options.password,
          options.requestTimeoutMs,
        ),
      );
      session = includesAuthLogin(options.scenario)
        ? await timed(timings, samples, "login", () =>
            authenticate(
              options.apiUrl,
              "login",
              username,
              options.password,
              options.requestTimeoutMs,
            ),
          )
        : registered;
    }

    if (options.scenario === "auth") {
      timings.total = performance.now() - totalStart;
      return { botId, username, ok: true, timings, samples, counters };
    }

    if (!options.preseedUsers) {
      await timed(timings, samples, "appearance", () =>
        updateAppearance(
          options.apiUrl,
          session.token,
          botAppearance(botId),
          options.requestTimeoutMs,
        ),
      );
    }

    socket = await timed(timings, samples, "connect", () =>
      connectWebSocket(options.wsUrl, session.token),
    );
    const snapshot = await timed(timings, samples, "join", () =>
      joinRoom(socket as WebSocket, session.userId, options.roomId),
    );

    if (options.durationSeconds > 0) {
      await timed(timings, samples, "steady.phase", () =>
        runSteady(
          socket as WebSocket,
          session.userId,
          username,
          snapshot,
          options,
          counters,
          random,
          samples,
        ),
      );
      timings.total = performance.now() - totalStart;
      return { botId, username, ok: true, timings, samples, counters };
    }

    if (options.scenario === "room") {
      timings.total = performance.now() - totalStart;
      return { botId, username, ok: true, timings, samples, counters };
    }

    if (includesMovement(options.scenario)) {
      counters.moves += await timed(timings, samples, "movement.phase", () =>
        runMovement(socket as WebSocket, session.userId, snapshot, options.moves, random, samples),
      );
    }

    if (includesChat(options.scenario)) {
      counters.messages += await timed(timings, samples, "chat.phase", () =>
        runChat(socket as WebSocket, session.userId, username, options.messages, 0, samples),
      );
    }

    timings.total = performance.now() - totalStart;
    return { botId, username, ok: true, timings, samples, counters };
  } catch (error) {
    timings.total = performance.now() - totalStart;
    return {
      botId,
      username,
      ok: false,
      timings,
      samples,
      counters,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    socket?.close();
  }
}

async function preseedBot(botId: number, options: StressOptions): Promise<BotResult> {
  const username = `${options.usernamePrefix}_${botId}`;
  const timings: Record<string, number> = {};
  const samples: SampleBag = {};
  const counters: BotCounters = { moves: 0, messages: 0 };
  const totalStart = performance.now();

  try {
    let session: BotSession;

    try {
      session = await timed(timings, samples, "preseed.register", () =>
        authenticate(
          options.apiUrl,
          "register",
          username,
          options.password,
          options.requestTimeoutMs,
        ),
      );
    } catch (error) {
      if (!(error instanceof HttpRequestError) || error.code !== "USERNAME_TAKEN") {
        throw error;
      }

      session = await timed(timings, samples, "preseed.login", () =>
        authenticate(options.apiUrl, "login", username, options.password, options.requestTimeoutMs),
      );
    }

    await timed(timings, samples, "preseed.appearance", () =>
      updateAppearance(
        options.apiUrl,
        session.token,
        botAppearance(botId),
        options.requestTimeoutMs,
      ),
    );

    timings.total = performance.now() - totalStart;
    return { botId, username, ok: true, timings, samples, counters };
  } catch (error) {
    timings.total = performance.now() - totalStart;
    return {
      botId,
      username,
      ok: false,
      timings,
      samples,
      counters,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function authenticate(
  apiUrl: string,
  mode: "register" | "login",
  username: string,
  password: string,
  timeoutMs: number,
): Promise<BotSession> {
  const response = await fetchWithTimeout(
    `${apiUrl}/auth/${mode}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    },
    timeoutMs,
    mode,
  );
  const body = (await response.json()) as {
    token?: string;
    user?: { id?: string; username?: string };
    error?: { code?: string; message?: string };
  };

  if (!response.ok || !body.token || !body.user?.id || !body.user.username) {
    throw new HttpRequestError(body.error?.message ?? `${mode} failed`, {
      code: body.error?.code,
      status: response.status,
    });
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
  timeoutMs: number,
): Promise<void> {
  const response = await fetchWithTimeout(
    `${apiUrl}/me/appearance`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ appearance }),
    },
    timeoutMs,
    "appearance update",
  );

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
  random: () => number,
  samples: SampleBag,
): Promise<number> {
  const targets = snapshot.tiles.filter((tile) => tile.walkable);

  if (targets.length === 0) {
    throw new Error("joined room has no walkable tiles");
  }

  for (let index = 0; index < moves; index += 1) {
    await sendMove(socket, userId, targets, random, samples);
  }

  return moves;
}

async function runChat(
  socket: WebSocket,
  userId: string,
  username: string,
  messages: number,
  startIndex: number,
  samples: SampleBag,
): Promise<number> {
  for (let index = 0; index < messages; index += 1) {
    await sendChat(socket, userId, username, startIndex + index + 1, samples);
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
  random: () => number,
  samples: SampleBag,
): Promise<void> {
  const targets = snapshot.tiles.filter((tile) => tile.walkable);
  const runMovementLoop = includesMovement(options.scenario);
  const runChatLoop = includesChat(options.scenario);
  const deadline = performance.now() + options.durationSeconds * 1000;
  let nextMoveAt = performance.now();
  let nextChatAt = performance.now();
  let messageIndex = 0;

  if (runMovementLoop && targets.length === 0) {
    throw new Error("joined room has no walkable tiles");
  }

  while (performance.now() < deadline) {
    const now = performance.now();
    let acted = false;

    if (runMovementLoop && now >= nextMoveAt) {
      await sendMove(socket, userId, targets, random, samples);
      counters.moves += 1;
      nextMoveAt = performance.now() + options.moveIntervalMs;
      acted = true;
    }

    if (runChatLoop && performance.now() >= nextChatAt) {
      messageIndex += 1;
      await sendChat(socket, userId, username, messageIndex, samples);
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
  random: () => number,
  samples: SampleBag,
): Promise<void> {
  await timedSample(samples, "move.request", async () => {
    const tile = targets[Math.floor(random() * targets.length)] as TilePosition;
    const target = { x: tile.x, y: tile.y };
    socket.send(JSON.stringify({ type: "avatar.move.request", target }));
    await waitForMessage(
      socket,
      (message) =>
        (message.type === "avatar.moved" && message.userId === userId) || message.type === "error",
      userId,
    );
  });
}

async function sendChat(
  socket: WebSocket,
  userId: string,
  username: string,
  messageNumber: number,
  samples: SampleBag,
): Promise<void> {
  await timedSample(samples, "chat.request", async () => {
    const text = `stress message ${messageNumber} from ${username}`;
    socket.send(JSON.stringify({ type: "chat.say", text }));
    await waitForMessage(
      socket,
      (message) =>
        (message.type === "chat.message" && message.userId === userId) || message.type === "error",
      userId,
    );
  });
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
  samples: SampleBag,
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    return await action();
  } finally {
    const durationMs = performance.now() - startedAt;
    timings[name] = (timings[name] ?? 0) + durationMs;
    recordSample(samples, name, durationMs);
  }
}

async function timedSample<T>(
  samples: SampleBag,
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    return await action();
  } finally {
    recordSample(samples, name, performance.now() - startedAt);
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
    case "preseed-users":
      options.preseedUsers = parseBoolean(key, value);
      break;
    case "seed":
      options.seed = parseNonNegativeInteger(key, value);
      break;
    case "setup-concurrency":
      options.setupConcurrency = parsePositiveInteger(key, value);
      break;
    case "request-timeout-ms":
      options.requestTimeoutMs = parsePositiveInteger(key, value);
      break;
    default:
      throw new Error(`Unknown option --${key}`);
  }
}

function validateOptions(options: StressOptions): StressOptions {
  if (options.concurrency > options.bots) {
    options.concurrency = options.bots;
  }

  if (options.setupConcurrency > options.bots) {
    options.setupConcurrency = options.bots;
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

function parseBoolean(key: string, value: string): boolean {
  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error(`--${key} must be true or false`);
}

function isBooleanFlag(key: string): boolean {
  return key === "preseed-users";
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

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs.toString()}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

class HttpRequestError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, options: { code?: string; status: number }) {
    super(message);
    this.code = options.code;
    this.status = options.status;
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
  console.log(`Seed: ${options.seed.toString()}`);
  if (options.preseedUsers) {
    console.log(`Preseed: enabled (setup concurrency: ${options.setupConcurrency.toString()})`);
  }
  if (options.durationSeconds > 0) {
    console.log(`Duration: ${options.durationSeconds.toString()}s`);
  }
  console.log(`Bots: ${summary.total} (${summary.succeeded} ok, ${summary.failed} failed)`);
  console.log(`Actions: ${summary.moves} moves, ${summary.messages} messages`);
  console.log(`Average: ${summary.averageMs.toFixed(1)}ms`);
  console.log(`P95: ${summary.p95Ms.toFixed(1)}ms`);
  printLatencyTable(summary.operations);

  if (failures.length > 0) {
    console.log("Failures:");

    for (const failure of failures) {
      console.log(`- ${failure.username}: ${failure.error}`);
    }
  }
}

function summarizeSamples(results: BotResult[]): Record<string, LatencySummary> {
  const samplesByOperation = new Map<string, number[]>();

  for (const result of results) {
    for (const [operation, samples] of Object.entries(result.samples)) {
      const current = samplesByOperation.get(operation) ?? [];
      current.push(...samples);
      samplesByOperation.set(operation, current);
    }
  }

  return Object.fromEntries(
    [...samplesByOperation.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([operation, samples]) => [operation, summarizeLatency(samples)]),
  );
}

function summarizeLatency(samples: number[]): LatencySummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, sample) => sum + sample, 0);

  return {
    count: sorted.length,
    averageMs: sorted.length === 0 ? 0 : total / sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

function percentile(sorted: number[], value: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.max(0, Math.ceil(sorted.length * value) - 1);
  return sorted[index] ?? 0;
}

function recordSample(samples: SampleBag, name: string, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }

  samples[name] ??= [];
  samples[name].push(durationMs);
}

function printLatencyTable(operations: Record<string, LatencySummary>): void {
  const rows = Object.entries(operations);

  if (rows.length === 0) {
    return;
  }

  console.log("Latency (ms):");
  console.log("operation          count      avg      p50      p95      p99      max");

  for (const [operation, summary] of rows) {
    console.log(
      `${operation.padEnd(18)} ${String(summary.count).padStart(5)} ${formatMs(
        summary.averageMs,
      )} ${formatMs(summary.p50Ms)} ${formatMs(summary.p95Ms)} ${formatMs(
        summary.p99Ms,
      )} ${formatMs(summary.maxMs)}`,
    );
  }
}

function formatMs(value: number): string {
  return value.toFixed(1).padStart(8);
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
  --preseed-users          Register/update bot users before the measured run
  --setup-concurrency <n>  Preseed concurrency (default: 5)
  --seed <number>          Reproduce randomized bot movement
  --request-timeout-ms <ms> HTTP setup request timeout (default: 30000)
`);
}
