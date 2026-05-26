import { api } from "@/shared/services/api-client";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  SSOConfig,
  TokenResponse,
  UserResponse,
} from "../types";

export async function login(data: LoginRequest): Promise<TokenResponse> {
  return api.post("auth/login", { json: data }).json<TokenResponse>();
}

export async function register(
  data: RegisterRequest,
  inviteToken?: string,
): Promise<TokenResponse> {
  const searchParams: Record<string, string> = {};
  if (inviteToken) searchParams["invite_token"] = inviteToken;
  return api.post("auth/register", { json: data, searchParams }).json<TokenResponse>();
}

export async function fetchCurrentUser(): Promise<UserResponse> {
  return api.get("auth/me").json<UserResponse>();
}

export async function logout(): Promise<void> {
  await api.post("auth/logout");
}

export async function getSSOConfig(): Promise<SSOConfig> {
  return api.get("auth/sso/config").json<SSOConfig>();
}

export async function getGitHubAuthorizeUrl(): Promise<{ authorize_url: string }> {
  return api.get("auth/sso/github").json<{ authorize_url: string }>();
}

export async function exchangeGitHubCode(code: string, state: string): Promise<AuthResponse> {
  return api.post("auth/sso/github/callback", { json: { code, state } }).json<AuthResponse>();
}

export async function verifySecretKey(secretKey: string): Promise<TokenResponse> {
  return api.post("auth/verify-key", { json: { secret_key: secretKey } }).json<TokenResponse>();
}
