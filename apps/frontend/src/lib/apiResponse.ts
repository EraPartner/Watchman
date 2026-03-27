export interface ApiResponseEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  message?: string | null;
  requestId?: string | null;
  timestamp?: string;
  _payload?: T;
}

export function isApiResponseEnvelope<T = unknown>(
  payload: unknown
): payload is ApiResponseEnvelope<T> {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    "success" in candidate &&
    typeof candidate.success === "boolean" &&
    "data" in candidate &&
    "error" in candidate
  );
}

export function unwrapApiResponse<T = unknown>(payload: unknown): T {
  if (isApiResponseEnvelope<T>(payload)) {
    const candidate = payload as ApiResponseEnvelope<T>;
    if ("_payload" in candidate) {
      return candidate._payload as T;
    }
    return payload.data as T;
  }
  return payload as T;
}

export function extractApiError(payload: unknown, fallback: string): string {
  if (isApiResponseEnvelope(payload)) {
    if (payload.error && String(payload.error).trim().length > 0) {
      return String(payload.error);
    }
    if (payload.message && String(payload.message).trim().length > 0) {
      return String(payload.message);
    }
  }

  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    if (
      typeof candidate.error === "string" &&
      candidate.error.trim().length > 0
    )
      return candidate.error;
    if (
      typeof candidate.message === "string" &&
      candidate.message.trim().length > 0
    )
      return candidate.message;
  }

  return fallback;
}
