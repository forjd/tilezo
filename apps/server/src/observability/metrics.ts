type HistogramSnapshot = {
  count: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

export type RoomMetrics = {
  activeRooms: number;
  rooms: { id: string; userCount: number }[];
  layouts: {
    public: number;
    private: number;
  };
};

export type MetricsSnapshot = {
  uptimeSeconds: number;
  sockets: {
    active: number;
    opened: number;
    closed: number;
  };
  counters: Record<string, number>;
  histograms: Record<string, HistogramSnapshot>;
  eventLoop: {
    lastDelayMs: number;
    maxDelayMs: number;
  };
  rooms: RoomMetrics;
};

type MetricsOptions = {
  now?: () => number;
  maxSamplesPerHistogram?: number;
};

export class Metrics {
  private readonly now: () => number;
  private readonly maxSamplesPerHistogram: number;
  private readonly startedAt: number;
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, LatencyHistogram>();
  private eventLoopLastDelayMs = 0;
  private eventLoopMaxDelayMs = 0;
  private eventLoopTimer?: ReturnType<typeof setInterval>;
  private activeSockets = 0;
  private openedSockets = 0;
  private closedSockets = 0;

  constructor(options: MetricsOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.maxSamplesPerHistogram = options.maxSamplesPerHistogram ?? 10_000;
    this.startedAt = this.now();
  }

  startEventLoopMonitor(intervalMs = 1000): void {
    if (this.eventLoopTimer) {
      return;
    }

    let expectedAt = this.now() + intervalMs;
    this.eventLoopTimer = setInterval(() => {
      const actualAt = this.now();
      const delay = Math.max(0, actualAt - expectedAt);
      this.eventLoopLastDelayMs = delay;
      this.eventLoopMaxDelayMs = Math.max(this.eventLoopMaxDelayMs, delay);
      expectedAt = actualAt + intervalMs;
    }, intervalMs);

    const timer = this.eventLoopTimer as { unref?: () => void };
    timer.unref?.();
  }

  stopEventLoopMonitor(): void {
    if (!this.eventLoopTimer) {
      return;
    }

    clearInterval(this.eventLoopTimer);
    this.eventLoopTimer = undefined;
  }

  socketOpened(): void {
    this.activeSockets += 1;
    this.openedSockets += 1;
  }

  socketClosed(): void {
    this.activeSockets = Math.max(0, this.activeSockets - 1);
    this.closedSockets += 1;
  }

  increment(counter: string, amount = 1): void {
    this.counters.set(counter, (this.counters.get(counter) ?? 0) + amount);
  }

  observe(histogram: string, valueMs: number): void {
    if (!Number.isFinite(valueMs) || valueMs < 0) {
      return;
    }

    const current =
      this.histograms.get(histogram) ?? new LatencyHistogram(this.maxSamplesPerHistogram);
    current.observe(valueMs);
    this.histograms.set(histogram, current);
  }

  snapshot(rooms: RoomMetrics): MetricsSnapshot {
    return {
      uptimeSeconds: (this.now() - this.startedAt) / 1000,
      sockets: {
        active: this.activeSockets,
        opened: this.openedSockets,
        closed: this.closedSockets,
      },
      counters: Object.fromEntries([...this.counters.entries()].sort()),
      histograms: Object.fromEntries(
        [...this.histograms.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, histogram]) => [name, histogram.snapshot()]),
      ),
      eventLoop: {
        lastDelayMs: this.eventLoopLastDelayMs,
        maxDelayMs: this.eventLoopMaxDelayMs,
      },
      rooms,
    };
  }
}

class LatencyHistogram {
  private count = 0;
  private totalMs = 0;
  private maxMs = 0;
  private readonly samples: number[] = [];

  constructor(private readonly maxSamples: number) {}

  observe(valueMs: number): void {
    this.count += 1;
    this.totalMs += valueMs;
    this.maxMs = Math.max(this.maxMs, valueMs);

    if (this.samples.length < this.maxSamples) {
      this.samples.push(valueMs);
      return;
    }

    this.samples[this.count % this.maxSamples] = valueMs;
  }

  snapshot(): HistogramSnapshot {
    const sorted = [...this.samples].sort((left, right) => left - right);

    return {
      count: this.count,
      averageMs: this.count === 0 ? 0 : this.totalMs / this.count,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      maxMs: this.maxMs,
    };
  }
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[index] ?? 0;
}
