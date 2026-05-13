import { describe, expect, test } from "bun:test";
import { Metrics } from "./metrics";

describe("Metrics", () => {
  test("tracks sockets, counters, and latency histograms", () => {
    let now = 1000;
    const metrics = new Metrics({ now: () => now, maxSamplesPerHistogram: 5 });

    metrics.socketOpened();
    metrics.socketOpened();
    metrics.socketClosed();
    metrics.increment("messages.avatar.move.request");
    metrics.increment("messages.avatar.move.request");
    metrics.increment("movement.accepted");
    metrics.observe("message.avatar.move.request.duration", 10);
    metrics.observe("message.avatar.move.request.duration", 30);
    metrics.observe("message.avatar.move.request.duration", 20);
    now = 4000;

    expect(
      metrics.snapshot({
        activeRooms: 1,
        rooms: [{ id: "lobby", userCount: 1 }],
        layouts: { public: 3, private: 1 },
      }),
    ).toEqual({
      uptimeSeconds: 3,
      sockets: {
        active: 1,
        opened: 2,
        closed: 1,
      },
      counters: {
        "messages.avatar.move.request": 2,
        "movement.accepted": 1,
      },
      histograms: {
        "message.avatar.move.request.duration": {
          count: 3,
          averageMs: 20,
          p50Ms: 20,
          p95Ms: 30,
          p99Ms: 30,
          maxMs: 30,
        },
      },
      eventLoop: {
        lastDelayMs: 0,
        maxDelayMs: 0,
      },
      rooms: {
        activeRooms: 1,
        rooms: [{ id: "lobby", userCount: 1 }],
        layouts: { public: 3, private: 1 },
      },
    });
  });

  test("ignores invalid latency samples", () => {
    const metrics = new Metrics();

    metrics.observe("invalid", Number.NaN);
    metrics.observe("invalid", -1);

    expect(
      metrics.snapshot({ activeRooms: 0, rooms: [], layouts: { public: 0, private: 0 } })
        .histograms,
    ).toEqual({});
  });
});
