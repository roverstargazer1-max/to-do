"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { OAuthProviderId } from "@/lib/auth/providers";
import type { User, Session, AuthError, UserIdentity } from "@/lib/types/auth";

const LOCAL_USER: User = {
  id: "local-user",
  email: "local@kagelin.app",
  app_metadata: {},
  user_metadata: { display_name: "Local User" },
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
  identities: [],
};

const LOCAL_SESSION: Session = {
  access_token: "local-token",
  refresh_token: "local-refresh-token",
  expires_in: 3600 * 24 * 365,
  token_type: "bearer",
  user: LOCAL_USER,
};

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

export function AuthProvider({
  children,
}: {
  children: ReactNode;
  initialIsGuest?: boolean;
}) {
  const [user] = useState<User | null>(LOCAL_USER);
  const [session] = useState<Session | null>(LOCAL_SESSION);
  const [loading] = useState(false);
  const isGuestMode = false;

  const signInWithOAuth = useCallback(async () => {}, []);
  const signInWithMagicLink = useCallback(async () => ({ error: null }), []);
  const signUpWithPassword = useCallback(async () => ({ error: null }), []);
  const signInWithPassword = useCallback(async () => ({ error: null }), []);
  const resetPasswordForEmail = useCallback(async () => ({ error: null }), []);
  const updatePassword = useCallback(async () => ({ error: null }), []);
  const reauthenticate = useCallback(async () => ({ error: null }), []);
  const linkIdentity = useCallback(async () => ({ error: null }), []);
  const unlinkIdentity = useCallback(async () => ({ error: null }), []);
  const signInAsGuest = useCallback(() => {}, []);
  const signOut = useCallback(async () => {}, []);

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
