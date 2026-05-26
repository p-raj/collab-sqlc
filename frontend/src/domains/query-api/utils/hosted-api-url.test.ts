import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHostedApiPath, buildHostedApiUrl } from "./hosted-api-url";

describe("buildHostedApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the current origin when no API base is configured", () => {
    vi.stubEnv("VITE_API_URL", "");

    expect(buildHostedApiUrl("conn-1", "query-1")).toBe(
      `${window.location.origin}${buildHostedApiPath("conn-1", "query-1")}`,
    );
  });

  it("preserves a relative backend path prefix", () => {
    vi.stubEnv("VITE_API_URL", "/backend");

    expect(buildHostedApiUrl("conn-1", "query-1")).toBe(
      `${window.location.origin}/backend${buildHostedApiPath("conn-1", "query-1")}`,
    );
  });

  it("preserves an absolute backend path prefix", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com/backend");

    expect(buildHostedApiUrl("conn-1", "query-1")).toBe(
      `https://api.example.com/backend${buildHostedApiPath("conn-1", "query-1")}`,
    );
  });
});
