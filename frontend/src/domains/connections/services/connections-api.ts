import { api } from "@/shared/services/api-client";
import type {
  Connection,
  ConnectionCreateRequest,
  ConnectionUpdateRequest,
  TestConnectionRequest,
} from "../types";

export async function fetchConnections(): Promise<Connection[]> {
  const res = await api.get("connections").json<{ items: Connection[] }>();
  return res.items;
}

export async function createConnection(data: ConnectionCreateRequest): Promise<Connection> {
  return api.post("connections", { json: data }).json<Connection>();
}

export async function updateConnection(
  id: string,
  data: ConnectionUpdateRequest,
): Promise<Connection> {
  return api.patch(`connections/${id}`, { json: data }).json<Connection>();
}

export async function deleteConnection(id: string): Promise<void> {
  await api.delete(`connections/${id}`);
}

export async function testConnection(
  data: TestConnectionRequest,
): Promise<{ success: boolean; message: string }> {
  return api.post("connections/test", { json: data }).json();
}
