"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, sessionStore, type ApiSession } from "@/lib/api";
import { viewPaths, type View } from "@/lib/routes";
import { PushPermissionPrompt } from "@/features/notifications/push-permission-prompt";

type AppSessionContext = {
  session: ApiSession | null;
  setSession: (session: ApiSession | null) => void;
  signOut: () => Promise<void>;
};

const AppSession = createContext<AppSessionContext | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<ApiSession | null>(null);

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let version = 0;
    const start = () => {
      const current = ++version;
      unsubscribe?.(); unsubscribe = undefined;
      import('@/features/notifications/push-client').then(({ listenForForegroundPush }) => listenForForegroundPush(session.user.id)).then((stop) => {
        if (disposed || current !== version) stop(); else unsubscribe = stop;
      }).catch(() => undefined);
    };
    void import('@/features/notifications/push-client')
      .then(({ reconnectPush }) => reconnectPush(session.accessToken, session.user.id))
      .catch(() => false)
      .finally(start);
    window.addEventListener('singlerent-push-change', start);
    return () => { disposed = true; window.removeEventListener('singlerent-push-change', start); unsubscribe?.(); };
  }, [session?.accessToken, session?.user.id]);

  useEffect(() => {
    const unsubscribe = sessionStore.subscribe(setSession);
    const stored = sessionStore.get();
    setSession(stored);
    if (!stored) return unsubscribe;

    api.auth.me(stored.accessToken)
      .then((user) => {
        // A 401 may have rotated the session. Preserve the newest token pair.
        const activeSession = sessionStore.get();
        if (activeSession) sessionStore.set({ ...activeSession, user });
      })
      .catch((cause: unknown) => {
        if (typeof cause === "object" && cause !== null && "status" in cause && (cause as { status?: number }).status === 401) {
          sessionStore.clear();
        }
      });
    return unsubscribe;
  }, []);

  const updateSession = (nextSession: ApiSession | null) => {
    if (nextSession) sessionStore.set(nextSession);
    else sessionStore.clear();
  };

  const signOut = async () => {
    const activeSession = session;
    if (activeSession) {
      try {
        const { disablePush } = await import('@/features/notifications/push-client');
        await disablePush(activeSession.accessToken, activeSession.user.id);
      } catch {
        // Browser payloads never contain private content, even when revocation is offline.
      }
    }
    sessionStore.clear();
    router.push(viewPaths.home);
    if (!activeSession) return;
    try {
      await api.auth.logout(activeSession.accessToken, activeSession.refreshToken);
    } catch {
      // The device session is cleared even if the API is temporarily unavailable.
    }
  };

  return <AppSession.Provider value={{ session, setSession: updateSession, signOut }}><PushPermissionPrompt session={session} />{children}</AppSession.Provider>;
}

export function useAppSession() {
  const context = useContext(AppSession);
  if (!context) throw new Error("useAppSession must be used inside AppProvider.");
  return context;
}

export function useAppNavigation() {
  const router = useRouter();
  const go = (view: View, query?: Record<string, string>) => {
    const parameters = query ? new URLSearchParams(query).toString() : "";
    router.push(parameters ? `${viewPaths[view]}?${parameters}` : viewPaths[view]);
  };
  return { go, router };
}
