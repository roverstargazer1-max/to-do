import { type NextRequest } from "next/server";

export interface CsrfValidationResult {
  ok: boolean;
  status: number;
  error: string;
}

/**
 * Validates incoming state-changing requests to prevent Cross-Site Request
 * Forgery (CSRF) and cross-origin abuse against local unauthenticated endpoints.
 */
export function validateCsrfOrigin(
  request?: NextRequest,
  requiredAction?: string,
): CsrfValidationResult {
  if (!request) {
    return { ok: true, status: 200, error: "" };
  }

  // 1. Reject cross-site requests signaled by browser Sec-Fetch-Site metadata
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (
    secFetchSite &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "none"
  ) {
    return {
      ok: false,
      status: 403,
      error: "Cross-site requests are not allowed",
    };
  }

  // 2. If Origin header is present, verify it matches the host
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestHost = request.nextUrl.host || request.headers.get("host");
      if (requestHost && originUrl.host !== requestHost) {
        return {
          ok: false,
          status: 403,
          error: "Cross-origin requests are not allowed",
        };
      }
    } catch {
      return {
        ok: false,
        status: 403,
        error: "Invalid request origin",
      };
    }
  }

  // 3. If a specific action header is required, verify it
  if (requiredAction) {
    const action = request.headers.get("x-kagelin-action");
    if (action !== requiredAction) {
      return {
        ok: false,
        status: 400,
        error: `Missing or invalid X-Kagelin-Action header (expected: ${requiredAction})`,
      };
    }
  }

  return { ok: true, status: 200, error: "" };
}
