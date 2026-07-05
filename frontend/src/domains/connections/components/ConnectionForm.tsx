import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Connection, DatabaseType } from "../types";
import { DATABASE_ENGINE_IDS, getDatabaseEngine } from "../engine-registry";
import * as connectionsApi from "../services/connections-api";
import { useSchemaStore } from "@/domains/schema/hooks/use-schema-store";
import { Badge } from "@/shared/components/ui/Badge";
import { Button } from "@/shared/components/ui/Button";
import { Checkbox } from "@/shared/components/ui/Checkbox";
import { FileInput } from "@/shared/components/ui/FileInput";
import { Field, FieldError, FieldHint, FieldLabel } from "@/shared/components/ui/Field";
import { Input } from "@/shared/components/ui/Input";
import { Panel } from "@/shared/components/ui/Panel";
import { Select } from "@/shared/components/ui/Select";
import { Textarea } from "@/shared/components/ui/Textarea";
import { parseDbml } from "@/lib/dbml-parser";

const SECURITY_MODES = ["insecure", "secure", "secure-with-certificates"] as const;
const CERTIFICATE_FIELDS = {
  ssl_ca: "CA certificate",
  ssl_cert: "Client certificate",
  ssl_key: "Client key",
} as const;
const MAX_CERTIFICATE_FILE_BYTES = 128 * 1024;

const baseSchema = z.object({
  name: z.string().min(1, "Required"),
  db_type: z.enum(DATABASE_ENGINE_IDS),
  host: z.string(),
  port: z.coerce.number().int().min(1).max(65535),
  database: z.string(),
  username: z.string(),
  password: z.string(),
  session_token: z.string().optional(),
  security_mode: z.enum(SECURITY_MODES),
  ssl_ca: z.string().optional(),
  ssl_cert: z.string().optional(),
  ssl_key: z.string().optional(),
  clear_stored_client_certificates: z.boolean(),
  ssh_enabled: z.boolean(),
  ssh_host: z.string().optional(),
  ssh_port: z.coerce.number().int().min(1).max(65535).optional(),
  ssh_username: z.string().optional(),
  ssh_private_key: z.string().optional(),
  query_timeout_seconds: z.coerce.number().int().min(1).max(3600),
  is_shared: z.boolean(),
});

type FormValues = z.infer<typeof baseSchema>;
type SecurityMode = FormValues["security_mode"];
type CertificateField = keyof typeof CERTIFICATE_FIELDS;

const DEFAULT_QUERY_TIMEOUT_SECONDS = 300;

function buildSchema(requirePassword: boolean, hasStoredSslCa: boolean) {
  return baseSchema
    .extend({
      password: z.string(),
    })
    .superRefine((data, ctx) => {
      const isSql = getDatabaseEngine(data.db_type).engineKind === "sql";
      if ((isSql || data.db_type === "redis") && !data.host.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["host"],
          message: "Required",
        });
      }
      if (isSql && !data.database.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["database"],
          message: "Required",
        });
      }
      if (isSql && !data.username.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["username"],
          message: "Required",
        });
      }
      if (isSql && requirePassword && !data.password.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "Required",
        });
      }
      if (data.db_type === "dynamodb" && !data.database.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["database"],
          message: "Required",
        });
      }
      if (data.db_type === "dynamodb" && !data.username.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["username"],
          message: "Required",
        });
      }
      if (data.db_type === "dynamodb" && requirePassword && !data.password.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "Required",
        });
      }

      if (data.db_type !== "postgresql" && data.security_mode === "secure-with-certificates") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["security_mode"],
          message: "Certificate-based SSL is only available for PostgreSQL",
        });
      }

      if (
        data.db_type === "postgresql" &&
        data.security_mode === "secure-with-certificates" &&
        !hasStoredSslCa &&
        !data.ssl_ca?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ssl_ca"],
          message: "CA certificate is required",
        });
      }

      if (
        data.security_mode === "secure-with-certificates" &&
        Boolean(data.ssl_cert?.trim()) !== Boolean(data.ssl_key?.trim())
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ssl_cert"],
          message: "Client certificate and key must be uploaded together",
        });
      }
    });
}

interface ConnectionFormProps {
  connection?: Connection;
  onSave: () => void;
  onCancel: () => void;
}

function getInitialSecurityMode(connection?: Connection): SecurityMode {
  if (!connection?.ssl_enabled) {
    return "insecure";
  }
  if (connection.db_type === "postgresql" && connection.has_ssl_ca) {
    return "secure-with-certificates";
  }
  return "secure";
}

function trimCertificate(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildSslPayload(data: FormValues, connection?: Connection) {
  if (data.security_mode === "insecure") {
    return {
      ssl_enabled: false,
      ssl_ca: null,
      ssl_cert: null,
      ssl_key: null,
    };
  }

  if (data.security_mode === "secure") {
    return {
      ssl_enabled: true,
      ssl_ca: null,
      ssl_cert: null,
      ssl_key: null,
    };
  }

  const sslPayload: {
    ssl_enabled: true;
    ssl_ca?: string | null;
    ssl_cert?: string | null;
    ssl_key?: string | null;
  } = { ssl_enabled: true };

  const sslCa = trimCertificate(data.ssl_ca);
  const sslCert = trimCertificate(data.ssl_cert);
  const sslKey = trimCertificate(data.ssl_key);

  if (sslCa || !connection?.has_ssl_ca) {
    sslPayload.ssl_ca = sslCa;
  }
  if (sslCert) {
    sslPayload.ssl_cert = sslCert;
  }
  if (sslKey) {
    sslPayload.ssl_key = sslKey;
  }
  if (data.clear_stored_client_certificates && !sslCert && !sslKey) {
    sslPayload.ssl_cert = null;
    sslPayload.ssl_key = null;
  }
  if (!connection?.has_ssl_client_certificates && !sslCert && !sslKey) {
    sslPayload.ssl_cert = null;
    sslPayload.ssl_key = null;
  }

  return sslPayload;
}

function buildEnginePayload(data: FormValues) {
  if (data.db_type === "redis") {
    return {
      database: data.database.trim() || "0",
      username: data.username.trim(),
      password: data.password,
      config: { database: Number(data.database.trim() || "0") },
      credentials: data.password ? { password: data.password } : null,
    };
  }
  if (data.db_type === "dynamodb") {
    const credentials: Record<string, string> = {
      access_key_id: data.username.trim(),
      secret_access_key: data.password,
    };
    const sessionToken = data.session_token?.trim();
    if (sessionToken) {
      credentials.session_token = sessionToken;
    }
    const endpointUrl = data.host.trim();
    return {
      database: data.database.trim(),
      username: data.username.trim(),
      password: data.password,
      config: {
        region: data.database.trim(),
        ...(endpointUrl && { endpoint_url: endpointUrl }),
      },
      credentials,
    };
  }

  return {
    database: data.database,
    username: data.username,
    password: data.password,
    config: null,
    credentials: null,
  };
}

export function ConnectionForm({ connection, onSave, onCancel }: ConnectionFormProps) {
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dbmlText, setDbmlText] = useState("");
  const [dbmlError, setDbmlError] = useState<string | null>(null);
  const [dbmlExpanded, setDbmlExpanded] = useState(false);
  const [dbmlParsed, setDbmlParsed] = useState<Record<string, unknown> | null>(
    connection?.dbml_context ?? null,
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(!connection, connection?.has_ssl_ca ?? false)),
    defaultValues: {
      name: connection?.name ?? "",
      db_type: connection?.db_type ?? "postgresql",
      host: connection?.host ?? "",
      port: connection?.port ?? getDatabaseEngine(connection?.db_type).defaultPort,
      database: connection?.database ?? "",
      username: connection?.username ?? "",
      password: "",
      session_token: "",
      security_mode: getInitialSecurityMode(connection),
      ssl_ca: "",
      ssl_cert: "",
      ssl_key: "",
      clear_stored_client_certificates: false,
      ssh_enabled: connection?.ssh_enabled ?? false,
      ssh_host: connection?.ssh_host ?? "",
      ssh_port: connection?.ssh_port ?? 22,
      ssh_username: connection?.ssh_username ?? "",
      ssh_private_key: "",
      query_timeout_seconds: connection?.query_timeout_seconds ?? DEFAULT_QUERY_TIMEOUT_SECONDS,
      is_shared: connection?.is_shared ?? true,
    },
  });

  const sshEnabled = watch("ssh_enabled");
  const dbType = watch("db_type");
  const securityMode = watch("security_mode");
  const sslCaValue = watch("ssl_ca");
  const sslCertValue = watch("ssl_cert");
  const sslKeyValue = watch("ssl_key");
  const clearStoredClientCertificates = watch("clear_stored_client_certificates");

  const canTestStoredCertificateMode =
    !connection ||
    dbType !== "postgresql" ||
    securityMode !== "secure-with-certificates" ||
    (!connection.has_ssl_ca && !connection.has_ssl_client_certificates) ||
    (trimCertificate(sslCaValue) !== null &&
      (clearStoredClientCertificates ||
        !connection.has_ssl_client_certificates ||
        (trimCertificate(sslCertValue) !== null && trimCertificate(sslKeyValue) !== null)));

  async function onSubmit(data: FormValues) {
    // Resolve DBML context using a local variable to avoid stale React state
    let resolvedDbml = dbmlParsed;

    if (!dbmlText.trim()) {
      resolvedDbml = null;
      setDbmlParsed(null);
    } else if (!dbmlParsed) {
      // User entered DBML text but hasn't successfully parsed it, try now
      try {
        const parsed = parseDbml(dbmlText);
        resolvedDbml = parsed as unknown as Record<string, unknown>;
        setDbmlParsed(resolvedDbml);
        setDbmlError(null);
      } catch (err) {
        setDbmlError(err instanceof Error ? err.message : "Failed to parse DBML");
        setDbmlExpanded(true);
        return;
      }
    }

    setIsSaving(true);
    try {
      const enginePayload = buildEnginePayload(data);
      const credentials =
        connection && !enginePayload.password ? undefined : enginePayload.credentials;
      const base = {
        name: data.name,
        db_type: data.db_type,
        host: data.host,
        port: data.port,
        database: enginePayload.database,
        username: enginePayload.username,
        config: enginePayload.config,
        credentials,
        ...buildSslPayload(data, connection),
        ssh_enabled: data.ssh_enabled,
        ...(data.ssh_enabled && {
          ssh_host: data.ssh_host,
          ssh_port: data.ssh_port,
          ssh_username: data.ssh_username,
          ...(data.ssh_private_key && { ssh_private_key: data.ssh_private_key }),
        }),
        query_timeout_seconds: data.query_timeout_seconds,
        is_shared: data.is_shared,
        dbml_context: resolvedDbml,
      };

      if (connection) {
        await connectionsApi.updateConnection(connection.id, {
          ...base,
          ...(enginePayload.password && { password: enginePayload.password }),
        });
        useSchemaStore.getState().clearForConnection(connection.id);
        toast.success("Connection updated");
      } else {
        await connectionsApi.createConnection({ ...base, password: enginePayload.password });
        toast.success("Connection created");
      }
      onSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save connection");
    } finally {
      setIsSaving(false);
    }
  }

  function handleParseDbml() {
    setDbmlError(null);
    if (!dbmlText.trim()) {
      setDbmlParsed(null);
      return;
    }
    try {
      const parsed = parseDbml(dbmlText);
      setDbmlParsed(parsed as unknown as Record<string, unknown>);
      toast.success(`Parsed ${Object.keys(parsed.tables).length} table(s)`);
    } catch (err) {
      setDbmlError(err instanceof Error ? err.message : "Failed to parse DBML");
      setDbmlParsed(null);
    }
  }

  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const v = getValues();
      const result = await connectionsApi.testConnection({
        db_type: v.db_type,
        host: v.host,
        port: v.port,
        database: v.database,
        username: v.username,
        password: v.password,
        config: buildEnginePayload(v).config,
        credentials: buildEnginePayload(v).credentials,
        ...buildSslPayload(v, connection),
      });
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleCertificateFile(field: CertificateField, file: File | undefined) {
    if (!file) {
      return;
    }
    if (file.size > MAX_CERTIFICATE_FILE_BYTES) {
      toast.error("Certificate file must be 128 KB or smaller");
      return;
    }

    try {
      setValue(field, await file.text(), { shouldDirty: true, shouldValidate: true });
      toast.success(`${CERTIFICATE_FIELDS[field]} loaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read certificate file");
    }
  }

  const databaseLabel =
    dbType === "redis" ? "Database index" : dbType === "dynamodb" ? "Region" : "Database";
  const databasePlaceholder =
    dbType === "redis" ? "0" : dbType === "dynamodb" ? "us-east-1" : "mydb";
  const usernameLabel =
    dbType === "redis"
      ? "Username (optional)"
      : dbType === "dynamodb"
        ? "Access key ID"
        : "Username";
  const passwordLabel =
    dbType === "redis"
      ? "Password (optional)"
      : dbType === "dynamodb"
        ? "Secret access key"
        : "Password";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
      {/* Name */}
      <Field>
        <FieldLabel htmlFor="connection-name">Name</FieldLabel>
        <Input
          id="connection-name"
          {...register("name")}
          placeholder="My Database"
          size="sm"
        />
        <FieldError>{errors.name?.message}</FieldError>
      </Field>

      {/* Type */}
      <Field>
        <FieldLabel htmlFor="connection-type">Type</FieldLabel>
        <Controller
          control={control}
          name="db_type"
          render={({ field }) => (
            <Select
              id="connection-type"
              {...field}
              onChange={(e) => {
                const dbType = e.target.value as DatabaseType;
                field.onChange(dbType);
                setValue("port", getDatabaseEngine(dbType).defaultPort);
                setValue("security_mode", "insecure");
                if (dbType === "redis") {
                  setValue("database", "0");
                  setValue("username", "");
                  setValue("password", "");
                }
                if (dbType === "dynamodb") {
                  setValue("host", "");
                  setValue("database", "");
                  setValue("username", "");
                  setValue("password", "");
                  setValue("session_token", "");
                }
              }}
              size="sm"
            >
              {DATABASE_ENGINE_IDS.map((dbType) => (
                <option key={dbType} value={dbType}>
                  {getDatabaseEngine(dbType).label}
                </option>
              ))}
            </Select>
          )}
        />
        <FieldError>{errors.db_type?.message}</FieldError>
      </Field>

      {/* Host + Port */}
      <div className="flex gap-2">
        <Field className="flex-1">
          <FieldLabel htmlFor="connection-host">
            {dbType === "dynamodb" ? "Endpoint URL (optional)" : "Host"}
          </FieldLabel>
          <Input
            id="connection-host"
            {...register("host")}
            placeholder={dbType === "dynamodb" ? "http://localhost:8000" : "localhost"}
            size="sm"
          />
          <FieldError>{errors.host?.message}</FieldError>
        </Field>
        {dbType !== "dynamodb" && (
          <Field className="w-20">
            <FieldLabel htmlFor="connection-port">Port</FieldLabel>
            <Input id="connection-port" {...register("port")} type="number" size="sm" />
            <FieldError>{errors.port?.message}</FieldError>
          </Field>
        )}
      </div>

      {/* Database */}
      <Field>
        <FieldLabel htmlFor="connection-database">{databaseLabel}</FieldLabel>
        <Input
          id="connection-database"
          {...register("database")}
          placeholder={databasePlaceholder}
          size="sm"
        />
        <FieldError>{errors.database?.message}</FieldError>
      </Field>

      {/* Username + Password */}
      <div className="flex gap-2">
        <Field className="flex-1">
          <FieldLabel htmlFor="connection-username">{usernameLabel}</FieldLabel>
          <Input
            id="connection-username"
            {...register("username")}
            placeholder={dbType === "redis" ? "" : dbType === "dynamodb" ? "AKIA..." : "postgres"}
            size="sm"
          />
          <FieldError>{errors.username?.message}</FieldError>
        </Field>
        <Field className="flex-1">
          <FieldLabel htmlFor="connection-password">
            {passwordLabel}
            {connection && (
              <span className="ml-1 font-normal text-muted-foreground">(leave blank to keep)</span>
            )}
          </FieldLabel>
          <Input
            id="connection-password"
            {...register("password")}
            type="password"
            placeholder={connection ? "••••••••" : ""}
            size="sm"
          />
          <FieldError>{errors.password?.message}</FieldError>
        </Field>
      </div>

      {dbType === "dynamodb" && (
        <Field>
          <FieldLabel htmlFor="connection-session-token">Session token (optional)</FieldLabel>
          <Input
            id="connection-session-token"
            {...register("session_token")}
            type="password"
            size="sm"
          />
        </Field>
      )}

      {dbType !== "dynamodb" && (
        <Panel padding="sm" className="flex flex-col gap-1">
          <Field>
            <FieldLabel htmlFor="connection-security-mode">Security</FieldLabel>
            <Select id="connection-security-mode" {...register("security_mode")} size="sm">
              <option value="insecure">
                {dbType === "clickhouse" ? "Insecure (HTTP)" : "Insecure"}
              </option>
              <option value="secure">
                {dbType === "clickhouse" ? "Secure (HTTPS)" : "Secure (TLS only)"}
              </option>
              {dbType === "postgresql" && (
                <option value="secure-with-certificates">Secure with certificates</option>
              )}
            </Select>
            <FieldHint>
              {dbType === "clickhouse"
                ? "ClickHouse stays insecure by default; choose secure to pass TLS to the client."
                : "PostgreSQL stays insecure by default. TLS only encrypts traffic; certificates add CA validation and optional client authentication."}
            </FieldHint>
            <FieldError>{errors.security_mode?.message}</FieldError>
          </Field>

          {dbType === "postgresql" && securityMode === "secure-with-certificates" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(Object.keys(CERTIFICATE_FIELDS) as CertificateField[]).map((field) => (
                <Field key={field}>
                  <FieldLabel>{CERTIFICATE_FIELDS[field]}</FieldLabel>
                  <FileInput
                    accept=".crt,.cert,.pem,.key"
                    onChange={(event) => {
                      void handleCertificateFile(field, event.target.files?.[0]);
                    }}
                  />
                </Field>
              ))}
              {connection?.has_ssl_ca && (
                <FieldHint className="sm:col-span-3">
                  Stored CA certificate will be kept unless you upload a replacement.
                </FieldHint>
              )}
              {connection?.has_ssl_client_certificates && (
                <label className="sm:col-span-3 flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                  <Checkbox {...register("clear_stored_client_certificates")} />
                  Remove stored client certificate and key
                </label>
              )}
              <FieldError className="sm:col-span-3">{errors.ssl_ca?.message}</FieldError>
              <FieldError className="sm:col-span-3">{errors.ssl_cert?.message}</FieldError>
            </div>
          )}
          {!canTestStoredCertificateMode && (
            <FieldHint>
              Re-upload the CA certificate and any client certificate/key you want to test. Saved
              certificates are only reused when you save the connection.
            </FieldHint>
          )}
        </Panel>
      )}

      {/* SSH Tunnel */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox {...register("ssh_enabled")} />
        SSH Tunnel
      </label>

      {sshEnabled && (
        <Panel padding="sm" className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Field className="flex-1">
              <FieldLabel htmlFor="connection-ssh-host">SSH Host</FieldLabel>
              <Input id="connection-ssh-host" {...register("ssh_host")} size="sm" />
            </Field>
            <Field className="w-20">
              <FieldLabel htmlFor="connection-ssh-port">SSH Port</FieldLabel>
              <Input id="connection-ssh-port" {...register("ssh_port")} type="number" size="sm" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="connection-ssh-username">SSH Username</FieldLabel>
            <Input id="connection-ssh-username" {...register("ssh_username")} size="sm" />
          </Field>
          <Field>
            <FieldLabel htmlFor="connection-ssh-private-key">
              SSH Private Key
              {connection && (
                <span className="ml-1 font-normal text-muted-foreground">
                  (leave blank to keep)
                </span>
              )}
            </FieldLabel>
            <Textarea
              id="connection-ssh-private-key"
              {...register("ssh_private_key")}
              rows={3}
              mono
            />
          </Field>
        </Panel>
      )}

      <Field>
        <FieldLabel htmlFor="connection-query-timeout">Query Timeout (seconds)</FieldLabel>
        <Input
          id="connection-query-timeout"
          {...register("query_timeout_seconds")}
          type="number"
          min={1}
          max={3600}
          size="sm"
        />
        <FieldError>{errors.query_timeout_seconds?.message}</FieldError>
      </Field>

      {/* DBML Schema Context */}
      <Button
        type="button"
        onClick={() => setDbmlExpanded(!dbmlExpanded)}
        variant="ghost"
        size="xs"
        className="w-fit"
      >
        {dbmlExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Schema Context (DBML)
        {dbmlParsed && (
          <Badge>
            {Object.keys((dbmlParsed as { tables?: Record<string, unknown> }).tables ?? {}).length}{" "}
            table(s)
          </Badge>
        )}
      </Button>

      {dbmlExpanded && (
        <Panel padding="sm" className="flex flex-col gap-1.5">
          <FieldHint>
            Paste DBML to provide schema context for the AI assistant.
          </FieldHint>
          <Textarea
            value={dbmlText}
            onChange={(e) => setDbmlText(e.target.value)}
            placeholder={`Table users {\n  id integer [pk]\n  name varchar\n}`}
            rows={5}
            mono
            className="resize-y"
          />
          <FieldError>{dbmlError}</FieldError>
          <Button
            type="button"
            onClick={handleParseDbml}
            size="xs"
            className="w-fit"
          >
            Parse DBML
          </Button>
        </Panel>
      )}

      {/* Shared with team */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox {...register("is_shared")} />
        Shared with team
      </label>

      {/* Test result */}
      {testResult && (
        <Panel padding="sm" className={testResult.success ? "text-foreground" : "text-destructive"}>
          {testResult.message}
        </Panel>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          onClick={handleTest}
          loading={isTesting}
          disabled={!canTestStoredCertificateMode}
          size="sm"
        >
          Test Connection
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          onClick={onCancel}
          size="sm"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          loading={isSaving}
          variant="primary"
          size="sm"
        >
          {connection ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}
