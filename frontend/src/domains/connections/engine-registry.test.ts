import { describe, expect, it } from "vitest";
import {
  DATABASE_ENGINE_IDS,
  getDatabaseEngine,
} from "./engine-registry";

describe("engine registry", () => {
  it("keeps the supported engine ids stable", () => {
    expect(DATABASE_ENGINE_IDS).toEqual(["postgresql", "clickhouse"]);
  });

  it("returns the PostgreSQL defaults", () => {
    const engine = getDatabaseEngine("postgresql");

    expect(engine.label).toBe("PostgreSQL");
    expect(engine.defaultPort).toBe(5432);
    expect(engine.capabilities).toEqual({
      explain: true,
      cancel: true,
      streaming: true,
    });
    expect(engine.explain).toEqual({
      outputKind: "json",
      defaultTab: "tree",
    });
  });

  it("returns the ClickHouse defaults", () => {
    const engine = getDatabaseEngine("clickhouse");

    expect(engine.label).toBe("ClickHouse");
    expect(engine.defaultPort).toBe(8123);
    expect(engine.capabilities).toEqual({
      explain: true,
      cancel: false,
      streaming: false,
    });
    expect(engine.explain).toEqual({
      outputKind: "text",
      defaultTab: "raw",
    });
  });

  it("falls back to PostgreSQL for null and undefined", () => {
    expect(getDatabaseEngine(null).id).toBe("postgresql");
    expect(getDatabaseEngine(undefined).id).toBe("postgresql");
  });
});
