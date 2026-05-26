import { create } from "zustand";
import type { UserResponse } from "../types";
import * as authApi from "../services/auth-api";

/** Decode JWT payload without verification (client-side claim check only). */
function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    const payload = parts[1];
    if (!payload) return null;
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface AuthState {
  user: UserResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsVerification: boolean;

  login: (email: string, password: string) => Promise<void>;
  verifySecretKey: (secretKey: string) => Promise<void>;
  setTokenAndLoadUser: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  needsVerification: false,

  login: async (email, password) => {
    const tokens = await authApi.login({ email, password });
    const tempToken = tokens.access_token;

    localStorage.setItem("access_token", tempToken);
    try {
      const user = await authApi.fetchCurrentUser();
      if (tokens.requires_secret_key) {
        // Authenticated but needs secret key verification
        set({ user, isAuthenticated: true, needsVerification: true, isLoading: false });
      } else {
        set({ user, isAuthenticated: true, needsVerification: false, isLoading: false });
      }
    } catch (err) {
      localStorage.removeItem("access_token");
      throw err;
    }
  },

  verifySecretKey: async (secretKey: string) => {
    const tokens = await authApi.verifySecretKey(secretKey);
    localStorage.setItem("access_token", tokens.access_token);
    set({ needsVerification: false });
  },

  setTokenAndLoadUser: async (accessToken: string) => {
    localStorage.setItem("access_token", accessToken);
    try {
      const user = await authApi.fetchCurrentUser();
      set({ user, isAuthenticated: true, needsVerification: false, isLoading: false });
    } catch (err) {
      localStorage.removeItem("access_token");
      throw err;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Logout may fail if token is unverified — that's fine, still clear locally
    } finally {
      localStorage.removeItem("access_token");
      set({ user: null, isAuthenticated: false, needsVerification: false, isLoading: false });
    }
  },

  loadUser: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      set({ user: null, isAuthenticated: false, needsVerification: false, isLoading: false });
      return;
    }

    try {
      // Check if the stored token is unverified (secret key not yet confirmed)
      const claims = decodeTokenPayload(token);
      const isUnverified = claims?.verified !== true;

      const user = await authApi.fetchCurrentUser();
      set({
        user,
        isAuthenticated: true,
        needsVerification: isUnverified,
        isLoading: false,
      });
    } catch {
      localStorage.removeItem("access_token");
      set({ user: null, isAuthenticated: false, needsVerification: false, isLoading: false });
    }
  },
}));
