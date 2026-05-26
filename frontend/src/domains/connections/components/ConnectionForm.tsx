import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Connection, DatabaseType } from "../types";
import { DATABASE_ENGINE_IDS, getDatabaseEngine } from "../engine-registry";
import * as connectionsApi from "../services/connections-api";
import { useSchemaStore } from "@/domains/schema/hooks/use-schema-store";
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
  host: z.string().min(1, "Required"),
  port: z.coerce.number().int().min(1).max(65535),
  database: z.string().min(1, "Required"),
  username: z.string().min(1, "Required"),
  password: z.string(),
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
      password: requirePassword ? z.string().min(1, "Required") : z.string(),
    })
    .superRefine((data, ctx) => {
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
      const base = {
        name: data.name,
        db_type: data.db_type,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
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
          ...(data.password && { password: data.password }),
        });
        useSchemaStore.getState().clearForConnection(connection.id);
        toast.success("Connection updated");
      } else {
        await connectionsApi.createConnection({ ...base, password: data.password });
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

  const inputClass =
    "h-7 w-full rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "text-xs text-muted-foreground";
  const errorClass = "text-[0.75rem] text-red-400";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
      {/* Name */}
      <div className="flex flex-col gap-0.5">
        <label className={labelClass}>Name</label>
        <input {...register("name")} placeholder="My Database" className={inputClass} />
        {errors.name && <span className={errorClass}>{errors.name.message}</span>}
      </div>

      {/* Type */}
      <div className="flex flex-col gap-0.5">
        <label className={labelClass}>Type</label>
        <Controller
          control={control}
          name="db_type"
          render={({ field }) => (
            <select
              {...field}
              onChange={(e) => {
                const dbType = e.target.value as DatabaseType;
                field.onChange(dbType);
                setValue("port", getDatabaseEngine(dbType).defaultPort);
                setValue("security_mode", "insecure");
              }}
              className={inputClass}
            >
              {DATABASE_ENGINE_IDS.map((dbType) => (
                <option key={dbType} value={dbType}>
                  {getDatabaseEngine(dbType).label}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      {/* Host + Port */}
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-0.5">
          <label className={labelClass}>Host</label>
          <input {...register("host")} placeholder="localhost" className={inputClass} />
          {errors.host && <span className={errorClass}>{errors.host.message}</span>}
        </div>
        <div className="flex w-20 flex-col gap-0.5">
          <label className={labelClass}>Port</label>
          <input {...register("port")} type="number" className={inputClass} />
          {errors.port && <span className={errorClass}>{errors.port.message}</span>}
        </div>
      </div>

      {/* Database */}
      <div className="flex flex-col gap-0.5">
        <label className={labelClass}>Database</label>
        <input {...register("database")} placeholder="mydb" className={inputClass} />
        {errors.database && <span className={errorClass}>{errors.database.message}</span>}
      </div>

      {/* Username + Password */}
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-0.5">
          <label className={labelClass}>Username</label>
          <input {...register("username")} placeholder="postgres" className={inputClass} />
          {errors.username && <span className={errorClass}>{errors.username.message}</span>}
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <label className={labelClass}>
            Password
            {connection && (
              <span className="ml-1 font-normal text-muted-foreground">(leave blank to keep)</span>
            )}
          </label>
          <input
            {...register("password")}
            type="password"
            placeholder={connection ? "••••••••" : ""}
            className={inputClass}
          />
          {errors.password && <span className={errorClass}>{errors.password.message}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded border border-input p-2">
        <div className="flex flex-col gap-0.5">
          <label className={labelClass}>Security</label>
          <select {...register("security_mode")} className={inputClass}>
            <option value="insecure">
              {dbType === "clickhouse" ? "Insecure (HTTP)" : "Insecure"}
            </option>
            <option value="secure">
              {dbType === "clickhouse" ? "Secure (HTTPS)" : "Secure (TLS only)"}
            </option>
            {dbType === "postgresql" && (
              <option value="secure-with-certificates">Secure with certificates</option>
            )}
          </select>
          <p className="text-[0.75rem] text-muted-foreground">
            {dbType === "clickhouse"
              ? "ClickHouse stays insecure by default; choose secure to pass TLS to the client."
              : "PostgreSQL stays insecure by default. TLS only encrypts traffic; certificates add CA validation and optional client authentication."}
          </p>
          {errors.security_mode && (
            <span className={errorClass}>{errors.security_mode.message}</span>
          )}
        </div>

        {dbType === "postgresql" && securityMode === "secure-with-certificates" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(CERTIFICATE_FIELDS) as CertificateField[]).map((field) => (
              <div key={field} className="flex flex-col gap-0.5">
                <label className={labelClass}>{CERTIFICATE_FIELDS[field]}</label>
                <input
                  type="file"
                  accept=".crt,.cert,.pem,.key"
                  onChange={(event) => {
                    void handleCertificateFile(field, event.target.files?.[0]);
                  }}
                  className="w-full text-[0.75rem] text-muted-foreground file:mr-2 file:h-6 file:rounded file:border-0 file:bg-accent file:px-2 file:text-[0.75rem] file:text-foreground"
                />
              </div>
            ))}
            {connection?.has_ssl_ca && (
              <p className="sm:col-span-3 text-[0.75rem] text-muted-foreground">
                Stored CA certificate will be kept unless you upload a replacement.
              </p>
            )}
            {connection?.has_ssl_client_certificates && (
              <label className="sm:col-span-3 flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                <input
                  {...register("clear_stored_client_certificates")}
                  type="checkbox"
                  className="h-3 w-3"
                />
                Remove stored client certificate and key
              </label>
            )}
            {errors.ssl_ca && (
              <span className={`sm:col-span-3 ${errorClass}`}>{errors.ssl_ca.message}</span>
            )}
            {errors.ssl_cert && (
              <span className={`sm:col-span-3 ${errorClass}`}>{errors.ssl_cert.message}</span>
            )}
          </div>
        )}
        {!canTestStoredCertificateMode && (
          <p className="text-[0.75rem] text-muted-foreground">
            Re-upload the CA certificate and any client certificate/key you want to test. Saved
            certificates are only reused when you save the connection.
          </p>
        )}
      </div>

      {/* SSH Tunnel */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input {...register("ssh_enabled")} type="checkbox" className="h-3 w-3" />
        SSH Tunnel
      </label>

      {sshEnabled && (
        <div className="flex flex-col gap-2 rounded border border-input p-2">
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-0.5">
              <label className={labelClass}>SSH Host</label>
              <input {...register("ssh_host")} className={inputClass} />
            </div>
            <div className="flex w-20 flex-col gap-0.5">
              <label className={labelClass}>SSH Port</label>
              <input {...register("ssh_port")} type="number" className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className={labelClass}>SSH Username</label>
            <input {...register("ssh_username")} className={inputClass} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className={labelClass}>
              SSH Private Key
              {connection && (
                <span className="ml-1 font-normal text-muted-foreground">
                  (leave blank to keep)
                </span>
              )}
            </label>
            <textarea
              {...register("ssh_private_key")}
              rows={3}
              className="w-full rounded border border-input bg-transparent px-2 py-1 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <label className={labelClass}>Query Timeout (seconds)</label>
        <input
          {...register("query_timeout_seconds")}
          type="number"
          min={1}
          max={3600}
          className={inputClass}
        />
        {errors.query_timeout_seconds && (
          <span className={errorClass}>{errors.query_timeout_seconds.message}</span>
        )}
      </div>

      {/* DBML Schema Context */}
      <button
        type="button"
        onClick={() => setDbmlExpanded(!dbmlExpanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {dbmlExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Schema Context (DBML)
        {dbmlParsed && (
          <span className="rounded bg-accent px-1 text-[0.75rem]">
            {Object.keys((dbmlParsed as { tables?: Record<string, unknown> }).tables ?? {}).length}{" "}
            table(s)
          </span>
        )}
      </button>

      {dbmlExpanded && (
        <div className="flex flex-col gap-1.5 rounded border border-input p-2">
          <p className="text-[0.75rem] text-muted-foreground">
            Paste DBML to provide schema context for the AI assistant.
          </p>
          <textarea
            value={dbmlText}
            onChange={(e) => setDbmlText(e.target.value)}
            placeholder={`Table users {\n  id integer [pk]\n  name varchar\n}`}
            rows={5}
            className="w-full resize-y rounded border border-input bg-transparent px-2 py-1 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {dbmlError && <span className="text-[0.75rem] text-red-400">{dbmlError}</span>}
          <button
            type="button"
            onClick={handleParseDbml}
            className="flex h-6 w-fit items-center gap-1 rounded border border-input px-2 text-[0.75rem] text-muted-foreground hover:bg-accent"
          >
            Parse DBML
          </button>
        </div>
      )}

      {/* Shared with team */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input {...register("is_shared")} type="checkbox" className="h-3 w-3" />
        Shared with team
      </label>

      {/* Test result */}
      {testResult && (
        <div
          className={`rounded border px-2 py-1 text-xs ${
            testResult.success
              ? "border-foreground/20 text-foreground"
              : "border-red-400/30 text-red-400"
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting || !canTestStoredCertificateMode}
          className="flex h-7 items-center gap-1 rounded border border-input px-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          {isTesting && <Loader2 size={12} className="animate-spin" />}
          Test Connection
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded border border-input px-3 text-xs text-muted-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex h-7 items-center gap-1 rounded bg-foreground px-3 text-xs text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {isSaving && <Loader2 size={12} className="animate-spin" />}
          {connection ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}
