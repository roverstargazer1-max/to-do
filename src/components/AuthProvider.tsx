"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { EMAIL_CONFIRMED_PATH } from "@/lib/auth/auth-routes";
import type { OAuthProviderId } from "@/lib/auth/providers";
import type {
  User,
  Session,
  AuthError,
  UserIdentity,
} from "@supabase/supabase-js";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isGuestMode: boolean;
  signInWithOAuth: (provider: OAuthProviderId) => Promise<void>;
  signInWithMagicLink: (
    email: string,
    captchaToken: string,
  ) => Promise<{ error: AuthError | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    captchaToken?: string,
  ) => Promise<{ error: AuthError | null }>;
  signInWithPassword: (
    email: string,
    password: string,
    captchaToken?: string,
  ) => Promise<{ error: AuthError | null }>;
  resetPasswordForEmail: (
    email: string,
    captchaToken: string,
  ) => Promise<{ error: AuthError | null }>;
  updatePassword: (
    password: string,
    nonce?: string,
  ) => Promise<{ error: AuthError | null }>;
  // Sends a nonce (to the user's email, or phone if no confirmed email) for
  // the Secure Password Change reauthentication step below.
  reauthenticate: () => Promise<{ error: AuthError | null }>;
  linkIdentity: (
    provider: OAuthProviderId,
  ) => Promise<{ error: AuthError | null }>;
  unlinkIdentity: (
    identity: UserIdentity,
  ) => Promise<{ error: AuthError | null }>;
  signInAsGuest: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function setGuestFlag() {
  localStorage.setItem("kanso_guest_mode", "true");
  document.cookie =
    "kanso_guest_mode=true; path=/; max-age=31536000; SameSite=Lax";
}

function clearGuestFlag() {
  localStorage.removeItem("kanso_guest_mode");
  document.cookie = "kanso_guest_mode=; path=/; max-age=0";
}

function hasGuestFlag() {
  return localStorage.getItem("kanso_guest_mode") === "true";
}

function makeGuestUser(): User {
  return {
    id: "guest",
    email: "guest@demo.kanso",
    app_metadata: {},
    user_metadata: { display_name: "Guest User" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
}

const LOCAL_AUTH_TIMEOUT_MS = 5_000;

class AuthInitializationTimeoutError extends Error {
  constructor() {
    super("Supabase authentication initialization timed out");
    this.name = "AuthInitializationTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new AuthInitializationTimeoutError());
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function AuthProvider({
  children,
  initialIsGuest = false,
}: {
  children: React.ReactNode;
  // Mirrors the server-side `kanso_guest_mode` cookie so first render matches SSR output (avoids a hydration error).
  initialIsGuest?: boolean;
}) {
  const [isGuestMode, setIsGuestMode] = useState<boolean>(initialIsGuest);
  const [user, setUser] = useState<User | null>(() =>
    initialIsGuest ? makeGuestUser() : null,
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!isGuestMode);
  const supabase = createClient();

  useEffect(() => {
    // A real session always wins — a stale guest flag must not shadow it.
    const applyRealSession = (s: Session) => {
      clearGuestFlag();
      setSession(s);
      setUser(s.user);
      setIsGuestMode(false);
    };

    const applyNoRealSession = () => {
      if (hasGuestFlag()) {
        setUser(makeGuestUser());
        setIsGuestMode(true);
      } else {
        clearGuestFlag();
        setSession(null);
        setUser(null);
        setIsGuestMode(false);
      }
    };

    const isLocalSingleUser =
      process.env.NEXT_PUBLIC_LOCAL_SINGLE_USER === "true";
    const localEmail =
      process.env.NEXT_PUBLIC_LOCAL_USER_EMAIL || "mcp-tester@kagelin.local";
    const localPassword =
      process.env.NEXT_PUBLIC_LOCAL_USER_PASSWORD || "tester123456";

    let localAuthFallbackApplied = false;

    const applyLocalAuthFallback = () => {
      localAuthFallbackApplied = true;
      setGuestFlag();
      setSession(null);
      setUser(makeGuestUser());
      setIsGuestMode(true);
    };

    const autoSignInLocal = async () => {
      if (localAuthFallbackApplied) return;

      try {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({
            email: localEmail,
            password: localPassword,
          }),
          LOCAL_AUTH_TIMEOUT_MS,
        );
        if (localAuthFallbackApplied) return;

        if (data?.session) {
          applyRealSession(data.session);
          setLoading(false);
          return;
        }
        if (error) {
          const isNetworkError =
            error.message?.toLowerCase().includes("fetch") ||
            error.status === 0 ||
            !error.status;
          if (isNetworkError) {
            applyLocalAuthFallback();
            setLoading(false);
            return;
          }
          const { data: signUpData } = await withTimeout(
            supabase.auth.signUp({
              email: localEmail,
              password: localPassword,
            }),
            LOCAL_AUTH_TIMEOUT_MS,
          );
          if (localAuthFallbackApplied) return;

          if (signUpData?.session) {
            applyRealSession(signUpData.session);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        if (!(err instanceof AuthInitializationTimeoutError)) {
          console.error("Auto local sign-in error:", err);
        }
      }

      if (localAuthFallbackApplied) return;
      applyLocalAuthFallback();
      setLoading(false);
    };

    withTimeout(supabase.auth.getSession(), LOCAL_AUTH_TIMEOUT_MS)
      .then(({ data: { session } }) => {
        if (session) {
          applyRealSession(session);
          setLoading(false);
        } else if (isLocalSingleUser) {
          autoSignInLocal();
        } else {
          applyNoRealSession();
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!(err instanceof AuthInitializationTimeoutError)) {
          console.warn("Supabase getSession failed, falling back:", err);
        }
        if (isLocalSingleUser) {
          if (err instanceof AuthInitializationTimeoutError) {
            applyLocalAuthFallback();
            setLoading(false);
          } else {
            autoSignInLocal();
          }
        } else {
          applyNoRealSession();
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // getSession() above already resolved this snapshot.
      if (event === "INITIAL_SESSION") return;

      if (session) {
        applyRealSession(session);
        setLoading(false);
      } else if (isLocalSingleUser) {
        autoSignInLocal();
      } else {
        applyNoRealSession();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const signInWithOAuth = useCallback(
    async (provider: OAuthProviderId) => {
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    },
    [supabase.auth],
  );

  const signInWithMagicLink = useCallback(
    async (email: string, captchaToken: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          captchaToken,
        },
      });
      return { error };
    },
    [supabase.auth],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(EMAIL_CONFIRMED_PATH)}`,
          captchaToken,
        },
      });
      return { error };
    },
    [supabase.auth],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      return { error };
    },
    [supabase.auth],
  );

  const resetPasswordForEmail = useCallback(
    async (email: string, captchaToken: string) => {
      // Routes through the callback's existing `next` handling — no separate recovery-detection logic needed there.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`,
        captchaToken,
      });
      return { error };
    },
    [supabase.auth],
  );

  const updatePassword = useCallback(
    async (password: string, nonce?: string) => {
      const { error } = await supabase.auth.updateUser({ password, nonce });
      return { error };
    },
    [supabase.auth],
  );

  // Only relevant when Secure Password Change is on and the session is
  // >24h old — supabase.auth.updateUser() then fails with error code
  // "reauthentication_needed" until this has been called and its nonce
  // passed back into updatePassword().
  const reauthenticate = useCallback(async () => {
    const { error } = await supabase.auth.reauthenticate();
    return { error };
  }, [supabase.auth]);

  const linkIdentity = useCallback(
    async (provider: OAuthProviderId) => {
      // `connecting` lets AccountSection name the provider on a linking failure — see docs/adr/0012-identity-linking.md.
      const next = `/settings?tab=account&connecting=${provider}`;
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          // Forces the account picker; otherwise linking silently reuses whichever account is already signed in.
          ...((provider === "google" || provider === "github") && {
            queryParams: { prompt: "select_account" },
          }),
        },
      });
      return { error };
    },
    [supabase.auth],
  );

  const unlinkIdentity = useCallback(
    async (identity: UserIdentity) => {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (!error) {
        // getSession() would return the stale cached `identities`, still showing the disconnected provider as connected.
        const {
          data: { session },
        } = await supabase.auth.refreshSession();
        if (session) {
          setSession(session);
          setUser(session.user);
        }
      }
      return { error };
    },
    [supabase.auth],
  );

  const signInAsGuest = useCallback(() => {
    setGuestFlag();
    setUser(makeGuestUser());
    setIsGuestMode(true);
  }, []);

  const signOut = useCallback(async () => {
    if (process.env.NEXT_PUBLIC_LOCAL_SINGLE_USER === "true") {
      return;
    }
    if (isGuestMode) {
      clearGuestFlag();
      setUser(null);
      setIsGuestMode(false);
    } else {
      await supabase.auth.signOut();
    }
  }, [supabase.auth, isGuestMode]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isGuestMode,
        signInWithOAuth,
        signInWithMagicLink,
        signUpWithPassword,
        signInWithPassword,
        resetPasswordForEmail,
        updatePassword,
        reauthenticate,
        linkIdentity,
        unlinkIdentity,
        signInAsGuest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
