export interface ProviderAccessToken {
  accessToken: string;
  expiresAt: number;
}

export async function getProviderAccessToken(
  _userId: string,
  _provider: string,
): Promise<ProviderAccessToken | null> {
  return null;
}
