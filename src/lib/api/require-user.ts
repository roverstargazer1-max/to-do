import { NextResponse } from "next/server";
import type { User } from "@/lib/types/auth";

const LOCAL_USER: User = {
  id: "local-user",
  email: "local@kagelin.app",
  app_metadata: {},
  user_metadata: { display_name: "Local User" },
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
  identities: [],
};

type RequireUserResult =
  | { user: User; supabase: null; error: null }
  | { user: null; supabase: null; error: NextResponse };

export async function requireUser(): Promise<RequireUserResult> {
  return { user: LOCAL_USER, supabase: null, error: null };
}
