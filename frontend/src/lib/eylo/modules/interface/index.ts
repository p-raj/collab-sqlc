/**
 * Stub interface module — minimal type definitions for widget payloads.
 * The full dynamic widget system is not vendored (YAGNI for chat assistant).
 */

export type TWidgetPayloadEnvelope = {
  type: string;
  component: string;
  data: Record<string, unknown>;
};

export type TCompoundWidgetPayload = {
  type: "compound";
  children: TCompoundWidgetNode[];
};

export type TCompoundWidgetNode = {
  type: string;
  component: string;
  data: Record<string, unknown>;
};

export type TWidgetValidationResult<T = unknown> = {
  valid?: boolean;
  ok?: boolean;
  data?: T;
  value?: T;
  issues: TWidgetValidationIssue[];
};

export type TWidgetValidationIssue = {
  path: string;
  message: string;
};

export type TRegisteredWidgetComponent = {
  type: string;
  component: string;
};

export type TWidgetComponentStatus = "active" | "inactive";
export type TWidgetComponentType = string;

export type TWidgetInteraction = {
  action: string;
  data: Record<string, unknown>;
};

export type TWidgetSchema = Record<string, unknown>;

export function isCompoundWidgetPayload(payload: unknown): payload is TCompoundWidgetPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    (payload as Record<string, unknown>).type === "compound"
  );
}

export function validateWidgetPayload<T = unknown>(payload: unknown): TWidgetValidationResult<T> {
  return { valid: true, ok: true, value: payload as T, issues: [] };
}

export function validateCompoundWidgetPayload<T = unknown>(payload: unknown): TWidgetValidationResult<T> {
  return { valid: true, ok: true, value: payload as T, issues: [] };
}

export function registerWidgetComponent(_component: TRegisteredWidgetComponent): void {}
export function registerWidgetComponents(_components: TRegisteredWidgetComponent[]): void {}
export function registerDefaultWidgetComponents(): void {}
export function getRegisteredWidgetComponent(_type: string): TRegisteredWidgetComponent | undefined {
  return undefined;
}
export function getRegisteredWidgetComponents(): TRegisteredWidgetComponent[] {
  return [];
}
export function getActiveWidgetComponents(): TRegisteredWidgetComponent[] {
  return [];
}
export function clearWidgetComponentRegistry(): void {}
export function getWidgetComponentSchema(_type: string): TWidgetSchema | undefined {
  return undefined;
}
export function validateWidgetComponentDefinition(_def: unknown): TWidgetValidationResult {
  return { valid: true, issues: [] };
}
