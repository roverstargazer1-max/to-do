export interface UserIdentity {
  id: string;
  user_id: string;
  identity_data?: Record<string, unknown>;
  provider: string;
  last_sign_in_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
  email?: string;
  phone?: string;
  identities?: UserIdentity[];
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: User;
}

export interface AuthError {
  name: string;
  message: string;
  status?: number;
}
