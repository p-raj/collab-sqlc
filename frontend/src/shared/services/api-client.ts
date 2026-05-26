import ky from "ky";
import type { TokenResponse } from "@/shared/types";
import { createLogger } from "@/shared/services/logger";

const log = createLogger("ApiClient");
const API_BASE = import.meta.env.VITE_API_URL ?? "";

let refreshPromise: Promise<void> | null = null;

async function attemptRefresh(): Promise<boolean> {
  try {
    // Send current token so backend can preserve verified status
    const headers: Record<string, string> = {};
    const currentToken = localStorage.getItem("access_token");
    if (currentToken) {
      headers["Authorization"] = `Bearer ${currentToken}`;
    }
    const res = await ky
      .post(`${API_BASE}/api/auth/refresh`, { credentials: "include", headers })
      .json<TokenResponse>();
    localStorage.setItem("access_token", res.access_token);
    log.debug("Token refreshed");
    return true;
  } catch {
    log.warn("Token refresh failed");
    return false;
  }
}

export const api = ky.create({
  prefixUrl: `${API_BASE}/api`,
  timeout: 1000 * 300,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem("access_token");
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`);
        }
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401 && !request.url.includes("/auth/refresh")) {
          // Prevent infinite refresh loops — only retry once
          if ((request.headers.get("X-Retry-Count") ?? "0") !== "0") {
            localStorage.removeItem("access_token");
            window.location.href = "/login";
            return;
          }
          // Deduplicate concurrent refresh attempts
          if (!refreshPromise) {
            refreshPromise = attemptRefresh().then((ok) => {
              refreshPromise = null;
              if (!ok) {
                localStorage.removeItem("access_token");
                window.location.href = "/login";
              }
            });
          }
          await refreshPromise;
          // Retry the original request if we have a new token
          const newToken = localStorage.getItem("access_token");
          if (newToken) {
            request.headers.set("Authorization", `Bearer ${newToken}`);
            request.headers.set("X-Retry-Count", "1");
            return ky(request, options);
          }
        }
      },
    ],
  },
});
