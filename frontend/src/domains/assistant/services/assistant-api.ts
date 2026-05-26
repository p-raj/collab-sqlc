import { api } from "@/shared/services/api-client";
import type { AssistantConfig } from "../types";

export async function fetchConfig(): Promise<AssistantConfig> {
  return api.get("assistant/config").json<AssistantConfig>();
}

