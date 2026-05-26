import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Eylo, EYLO_EVENTS } from "@/lib/eylo";

const EYLO_ORG_ID = import.meta.env.VITE_EYLO_ORG_ID as string | undefined;
const EYLO_AGENT_ID = import.meta.env.VITE_EYLO_AGENT_ID as string | undefined;

/** Minimal user shape needed by the Eylo SDK. */
interface EyloUser {
  email: string;
  display_name: string;
}

interface EyloContextValue {
  eylo: Eylo | null;
  agentId: string | null;
  connected: boolean;
  initialized: boolean;
  configured: boolean;
  error: string | null;
}

const EyloContext = createContext<EyloContextValue>({
  eylo: null,
  agentId: null,
  connected: false,
  initialized: false,
  configured: false,
  error: null,
});

export function useEylo() {
  return useContext(EyloContext);
}

export function EyloProvider({ user, children }: { user: EyloUser | null; children: ReactNode }) {
  const [eylo, setEylo] = useState<Eylo | null>(null);
  const [connected, setConnected] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(EYLO_ORG_ID && EYLO_AGENT_ID);

  useEffect(() => {
    if (!EYLO_ORG_ID || !user) return;

    let instance: Eylo;
    try {
      instance = new Eylo(EYLO_ORG_ID, {
        externalId: user.email,
        name: user.display_name,
        primaryEmail: user.email,
      });
      setEylo(instance);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create Eylo instance");
      return;
    }

    const handleConnected = () => setConnected(true);
    const handleDisconnected = () => setConnected(false);

    instance.ee.on(EYLO_EVENTS.NET_CONNECTED, handleConnected);
    instance.ee.on(EYLO_EVENTS.NET_DISCONNECTED, handleDisconnected);

    const unsubscribeConnection = instance.store.cm.subscribe("isConnected", (detail) => {
      setConnected(detail.value ?? false);
    });

    instance
      .initialize()
      .then(() => setInitialized(true))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to initialize Eylo");
      });

    return () => {
      unsubscribeConnection();
      instance.ee.off(EYLO_EVENTS.NET_CONNECTED, handleConnected);
      instance.ee.off(EYLO_EVENTS.NET_DISCONNECTED, handleDisconnected);
      instance.terminate();
      setEylo(null);
      setConnected(false);
      setInitialized(false);
    };
  }, [user]);

  if (error) {
    return (
      <EyloContext.Provider value={{ eylo: null, agentId: null, connected: false, initialized: false, configured, error }}>
        {children}
      </EyloContext.Provider>
    );
  }

  return (
    <EyloContext.Provider
      value={{
        eylo,
        agentId: EYLO_AGENT_ID ?? null,
        connected,
        initialized,
        configured,
        error,
      }}
    >
      {children}
    </EyloContext.Provider>
  );
}
