import { useCallback, useEffect, useMemo, useState } from "react";
import { Key, Copy, RefreshCw, Shield, Clock, Hash, Globe, Code2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/Button";
import { Callout } from "@/shared/components/ui/Callout";
import { Checkbox } from "@/shared/components/ui/Checkbox";
import { CodeBlock, InlineCode } from "@/shared/components/ui/CodeBlock";
import { EmptyState } from "@/shared/components/ui/DataState";
import { Field, FieldLabel } from "@/shared/components/ui/Field";
import { Input } from "@/shared/components/ui/Input";
import { ObjectListItem } from "@/shared/components/ui/ObjectListItem";
import { Select } from "@/shared/components/ui/Select";
import { TabButton, TabsRoot } from "@/shared/components/ui/Tabs";
import { Textarea } from "@/shared/components/ui/Textarea";
import * as queryApiService from "../services/query-api";
import type { ParameterDef, EnableAPIResponse } from "../types";
import { buildHostedApiPath, buildHostedApiUrl } from "../utils/hosted-api-url";

const PARAMETER_TYPES: ParameterDef["type"][] = [
  "string",
  "number",
  "integer",
  "float",
  "boolean",
  "uuid",
  "any",
];

type QuickstartLanguage = "curl" | "javascript" | "python";

const QUICKSTART_LANGUAGES: Array<{ id: QuickstartLanguage; label: string }> = [
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
];

function getExampleValue(parameter: ParameterDef): string | number | boolean | null {
  if (parameter.default != null) {
    return parameter.default;
  }

  switch (parameter.type) {
    case "integer":
      return 123;
    case "float":
      return 123.45;
    case "number":
      return 123;
    case "boolean":
      return false;
    case "uuid":
      return "00000000-0000-0000-0000-000000000000";
    default:
      return "value";
  }
}

function toPythonLiteral(value: unknown, indent = 0): string {
  const prefix = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return `[\n${value
      .map((item) => `${" ".repeat(indent + 4)}${toPythonLiteral(item, indent + 4)},`)
      .join("\n")}\n${prefix}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "{}";
    }

    return `{\n${entries
      .map(
        ([key, entryValue]) =>
          `${" ".repeat(indent + 4)}${JSON.stringify(key)}: ${toPythonLiteral(entryValue, indent + 4)},`,
      )
      .join("\n")}\n${prefix}}`;
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  return "None";
}

interface Props {
  queryId: string;
  connectionId: string | null;
  isHosted: boolean;
  apiKeyPrefix: string | null;
  revealedApiKey?: string | null;
  parameters: ParameterDef[] | null;
  rowLimit: number | null;
  rateLimit: number | null;
  timeoutSeconds: number | null;
  allowedIps: string[] | null;
  notes: string | null;
  hasSqlDrift: boolean;
  onEnabled: (response: EnableAPIResponse) => void;
  onDisabled: () => void;
  onConfigUpdated: () => void;
}

export function APIConfigPanel({
  queryId,
  connectionId,
  isHosted,
  apiKeyPrefix,
  revealedApiKey = null,
  parameters,
  rowLimit,
  rateLimit,
  timeoutSeconds,
  allowedIps,
  notes,
  hasSqlDrift,
  onEnabled,
  onDisabled,
  onConfigUpdated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [quickstartLanguage, setQuickstartLanguage] = useState<QuickstartLanguage>("curl");
  const [editNotes, setEditNotes] = useState(notes ?? "");
  const [editRowLimit, setEditRowLimit] = useState(rowLimit?.toString() ?? "");
  const [editRateLimit, setEditRateLimit] = useState(rateLimit?.toString() ?? "");
  const [editTimeout, setEditTimeout] = useState(timeoutSeconds?.toString() ?? "");
  const [editIps, setEditIps] = useState(allowedIps?.join(", ") ?? "");
  const [editParameters, setEditParameters] = useState<ParameterDef[]>(parameters ?? []);

  useEffect(() => {
    setEditNotes(notes ?? "");
    setEditRowLimit(rowLimit?.toString() ?? "");
    setEditRateLimit(rateLimit?.toString() ?? "");
    setEditTimeout(timeoutSeconds?.toString() ?? "");
    setEditIps(allowedIps?.join(", ") ?? "");
    setEditParameters(parameters ?? []);
  }, [allowedIps, notes, parameters, queryId, rateLimit, rowLimit, timeoutSeconds]);

  useEffect(() => {
    setNewKey(revealedApiKey);
  }, [queryId, revealedApiKey]);

  const hostedApiPath = useMemo(() => {
    if (!connectionId) {
      return null;
    }

    return buildHostedApiPath(connectionId, queryId);
  }, [connectionId, queryId]);
  const hostedApiUrl = useMemo(() => {
    if (!connectionId) {
      return null;
    }

    return buildHostedApiUrl(connectionId, queryId);
  }, [connectionId, queryId]);

  const examplePayload = useMemo(
    () => ({
      params: Object.fromEntries(
        editParameters.map((parameter) => [parameter.name, getExampleValue(parameter)]),
      ),
    }),
    [editParameters],
  );
  const examplePayloadJson = useMemo(
    () => JSON.stringify(examplePayload, null, 2),
    [examplePayload],
  );
  const examplePayloadPython = useMemo(() => toPythonLiteral(examplePayload), [examplePayload]);
  const snippetApiKey = newKey ?? "YOUR_API_KEY";
  const quickstartSnippets = useMemo(() => {
    if (!hostedApiUrl) {
      return null;
    }

    return {
      curl: `curl -X POST ${JSON.stringify(hostedApiUrl)} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${snippetApiKey}" \\
  --data @- <<'JSON'
${examplePayloadJson}
JSON`,
      javascript: `const payload = ${examplePayloadJson};

const response = await fetch(${JSON.stringify(hostedApiUrl)}, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": ${JSON.stringify(snippetApiKey)},
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  throw new Error(\`Request failed: \${response.status}\`);
}

const data = await response.json();
console.log(data);`,
      python: `import requests

payload = ${examplePayloadPython}

response = requests.post(
    ${JSON.stringify(hostedApiUrl)},
    headers={
        "Content-Type": "application/json",
        "X-API-Key": ${JSON.stringify(snippetApiKey)},
    },
    json=payload,
    timeout=30,
)
response.raise_for_status()
print(response.json())`,
    };
  }, [examplePayloadJson, examplePayloadPython, hostedApiUrl, snippetApiKey]);
  const activeQuickstartSnippet = quickstartSnippets?.[quickstartLanguage] ?? null;

  const handleEnable = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await queryApiService.enableAPI(queryId, {
        parameters: editParameters,
        row_limit: editRowLimit ? parseInt(editRowLimit, 10) : null,
        rate_limit: editRateLimit ? parseInt(editRateLimit, 10) : null,
        timeout_seconds: editTimeout ? parseInt(editTimeout, 10) : null,
        allowed_ips: editIps.trim() ? editIps.split(",").map((s) => s.trim()) : null,
        notes: editNotes || null,
      });
      setNewKey(resp.api_key);
      onEnabled(resp);
      toast.success("Query hosted as API");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enable API");
    } finally {
      setLoading(false);
    }
  }, [
    editIps,
    editNotes,
    editParameters,
    editRateLimit,
    editRowLimit,
    editTimeout,
    onEnabled,
    queryId,
  ]);

  const handleDisable = useCallback(async () => {
    setLoading(true);
    try {
      await queryApiService.disableAPI(queryId);
      onDisabled();
      toast.success("API hosting disabled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disable API");
    } finally {
      setLoading(false);
    }
  }, [queryId, onDisabled]);

  const handleRotateKey = useCallback(async () => {
    if (!confirm("Rotate API key? The current key will stop working immediately.")) return;
    setLoading(true);
    try {
      const resp = await queryApiService.rotateAPIKey(queryId);
      setNewKey(resp.api_key);
      toast.success("API key rotated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rotate key");
    } finally {
      setLoading(false);
    }
  }, [queryId]);

  const handleRepublish = useCallback(async () => {
    setLoading(true);
    try {
      await queryApiService.republishAPI(queryId);
      onConfigUpdated();
      toast.success("SQL republished to API");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to republish");
    } finally {
      setLoading(false);
    }
  }, [queryId, onConfigUpdated]);

  const handleSaveConfig = useCallback(async () => {
    setLoading(true);
    try {
      await queryApiService.updateAPIConfig(queryId, {
        parameters: editParameters,
        row_limit: editRowLimit ? parseInt(editRowLimit, 10) : null,
        rate_limit: editRateLimit ? parseInt(editRateLimit, 10) : null,
        timeout_seconds: editTimeout ? parseInt(editTimeout, 10) : null,
        allowed_ips: editIps.trim() ? editIps.split(",").map((s) => s.trim()) : null,
        notes: editNotes || null,
      });
      onConfigUpdated();
      toast.success("Configuration saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setLoading(false);
    }
  }, [
    editIps,
    editNotes,
    editParameters,
    editRateLimit,
    editRowLimit,
    editTimeout,
    onConfigUpdated,
    queryId,
  ]);

  const updateParameter = useCallback((index: number, updates: Partial<ParameterDef>) => {
    setEditParameters((current) =>
      current.map((parameter, parameterIndex) =>
        parameterIndex === index ? { ...parameter, ...updates } : parameter,
      ),
    );
  }, []);

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      toast.success("API key copied");
    }
  };
  const copyEndpoint = useCallback(() => {
    if (!hostedApiUrl) {
      return;
    }

    navigator.clipboard.writeText(hostedApiUrl);
    toast.success("Endpoint URL copied");
  }, [hostedApiUrl]);
  const copyQuickstartSnippet = useCallback(() => {
    if (!activeQuickstartSnippet) {
      return;
    }

    const label =
      QUICKSTART_LANGUAGES.find((language) => language.id === quickstartLanguage)?.label ?? "Code";
    navigator.clipboard.writeText(activeQuickstartSnippet);
    toast.success(`${label} snippet copied`);
  }, [activeQuickstartSnippet, quickstartLanguage]);

  if (!isHosted) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-center text-sm text-muted-foreground">
          <Globe className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p>This query is not hosted as an API.</p>
          <p className="mt-1 text-xs">Host it to generate an API key and endpoint URL.</p>
        </div>
        <Button onClick={handleEnable} variant="primary" loading={loading} className="w-full">
          Host as API
        </Button>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4 text-sm">
      {/* SQL Drift Warning */}
      {hasSqlDrift && (
        <Callout tone="warning" title="SQL has changed">
          <p>The editor SQL differs from the published API SQL.</p>
          <Button
            onClick={handleRepublish}
            variant="ghost"
            size="xs"
            loading={loading}
            className="mt-1 px-0 text-primary underline hover:bg-transparent"
          >
            Republish now
          </Button>
        </Callout>
      )}

      {/* API Key */}
      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Key className="h-3 w-3" /> API Key
        </h4>
        {newKey ? (
          <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="rounded border bg-background px-2 py-1.5 font-mono text-xs break-all">
              {newKey}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={copyKey}
                variant="primary"
                leftIcon={<Copy className="h-3 w-3" />}
              >
                Copy API key
              </Button>
              <Button type="button" onClick={() => setNewKey(null)}>
                Hide
              </Button>
            </div>
            <p className="text-[10px] text-destructive">
              Store this key securely. It will not be shown again.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-mono text-muted-foreground">{apiKeyPrefix}…</p>
            <p className="text-[10px] text-muted-foreground">
              The full key cannot be retrieved later. Rotate the key to generate a new one you can
              copy.
            </p>
          </div>
        )}
        <Button
          onClick={handleRotateKey}
          variant="ghost"
          loading={loading}
          leftIcon={<RefreshCw className="h-3 w-3" />}
        >
          Rotate key
        </Button>
      </section>

      {/* Quick start */}
      {hostedApiUrl && hostedApiPath && activeQuickstartSnippet && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Code2 className="h-3 w-3" /> Quick start
            </h4>
            <Button
              type="button"
              onClick={copyQuickstartSnippet}
              size="xs"
              leftIcon={<Copy className="h-3 w-3" />}
            >
              Copy snippet
            </Button>
          </div>

          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Endpoint
              </p>
              <ObjectListItem
                type="button"
                onClick={copyEndpoint}
                title={`Copy endpoint URL: ${hostedApiUrl}`}
                indicator={<Globe className="h-3 w-3 shrink-0 text-success" />}
                meta={<Copy className="h-3 w-3 shrink-0 text-muted-foreground" />}
                className="rounded border border-input bg-background px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate font-mono">{hostedApiPath}</span>
              </ObjectListItem>
            </div>

            <TabsRoot className="flex-wrap gap-1">
              {QUICKSTART_LANGUAGES.map((language) => (
                <TabButton
                  key={language.id}
                  type="button"
                  onClick={() => setQuickstartLanguage(language.id)}
                  aria-pressed={quickstartLanguage === language.id}
                  active={quickstartLanguage === language.id}
                  className="h-7 rounded-md border-b-0 px-2.5 py-1"
                >
                  {language.label}
                </TabButton>
              ))}
            </TabsRoot>

            {!newKey && (
              <p className="text-[10px] text-muted-foreground">
                Snippets use <InlineCode>YOUR_API_KEY</InlineCode>. Rotate the key if you want
                copy-ready examples with the live secret.
              </p>
            )}

            <CodeBlock className="max-h-80 bg-background text-[11px] leading-relaxed">
              <code>{activeQuickstartSnippet}</code>
            </CodeBlock>
          </div>
        </section>
      )}

      {/* Parameters */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Parameters
        </h4>
        {editParameters.length === 0 ? (
          <EmptyState
            title="No SQL parameters detected yet"
            description={
              <>
                Add placeholders like <InlineCode>$id</InlineCode> or{" "}
                <InlineCode>{"{id:number}"}</InlineCode> in your SQL, then reopen or republish.
              </>
            }
            className="items-start rounded border border-dashed px-3 py-2 text-left"
          />
        ) : (
          <div className="space-y-2">
            {editParameters.map((parameter, index) => (
              <div key={parameter.name} className="rounded-md border bg-muted/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{parameter.name}</p>
                    <p className="text-[10px] text-muted-foreground">Detected from SQL</p>
                  </div>
                  <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Checkbox
                      checked={!parameter.required}
                      onChange={(e) => updateParameter(index, { required: !e.target.checked })}
                    />
                    Optional
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field>
                    <FieldLabel>Type</FieldLabel>
                    <Select
                      value={parameter.type}
                      onChange={(e) =>
                        updateParameter(index, {
                          type: e.target.value as ParameterDef["type"],
                        })
                      }
                      size="sm"
                    >
                      {PARAMETER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Default</FieldLabel>
                    <Input
                      type="text"
                      value={parameter.default == null ? "" : String(parameter.default)}
                      onChange={(e) =>
                        updateParameter(index, {
                          default: e.target.value === "" ? null : e.target.value,
                        })
                      }
                      placeholder={parameter.required ? "None" : "Optional default"}
                      size="sm"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Limits */}
      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Shield className="h-3 w-3" /> Limits
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel className="flex items-center gap-1">
              <Hash className="h-2.5 w-2.5" /> Row limit
            </FieldLabel>
            <Input
              type="number"
              value={editRowLimit}
              onChange={(e) => setEditRowLimit(e.target.value)}
              placeholder="No limit"
              size="sm"
            />
          </Field>
          <Field>
            <FieldLabel className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Rate limit
            </FieldLabel>
            <Input
              type="number"
              value={editRateLimit}
              onChange={(e) => setEditRateLimit(e.target.value)}
              placeholder="req/min"
              size="sm"
            />
          </Field>
          <Field className="col-span-2">
            <FieldLabel>Timeout (seconds)</FieldLabel>
            <Input
              type="number"
              value={editTimeout}
              onChange={(e) => setEditTimeout(e.target.value)}
              placeholder="Connection default"
              size="sm"
            />
          </Field>
        </div>
      </section>

      {/* IP Allowlist */}
      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          IP Allowlist
        </h4>
        <Input
          value={editIps}
          onChange={(e) => setEditIps(e.target.value)}
          placeholder="Any IP (comma-separated to restrict)"
          size="sm"
        />
      </section>

      {/* Notes */}
      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notes
        </h4>
        <Textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          placeholder="Internal notes about this API endpoint..."
          rows={2}
          size="sm"
        />
      </section>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Button onClick={handleSaveConfig} variant="primary" loading={loading} className="flex-1">
          Save Config
        </Button>
        <Button onClick={handleDisable} disabled={loading} variant="danger">
          Unhost
        </Button>
      </div>
    </div>
  );
}
