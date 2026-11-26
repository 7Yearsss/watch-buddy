/** Anonymous accounts: a random bearer token, stored only as its SHA-256. Sign in with Apple binds to it later. */

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function newToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return b64url(new Uint8Array(digest));
}
