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

export function unwrapApiResponse(payload: unknown): unknown {
  if (isApiResponseEnvelope(payload)) {
    if ("_payload" in payload) {
      return payload._payload;
    }
    return payload.data;
  }
  // v2 envelope: { data: T } with no success/error siblings
  if (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "data" in payload &&
    Object.keys(payload).length === 1
  ) {
    return payload.data;
  }
  return payload;
}

export function extractApiError(payload: unknown, fallback: string): string {
  if (isApiResponseEnvelope(payload)) {
    if (payload.error && payload.error.trim().length > 0) {
      return payload.error;
    }
    if (payload.message && payload.message.trim().length > 0) {
      return payload.message;
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
      candidate.error &&
      typeof candidate.error === "object"
    ) {
      const nested = candidate.error as Record<string, unknown>;
      if (
        typeof nested.message === "string" &&
        nested.message.trim().length > 0
      ) {
        return typeof nested.code === "string" && nested.code.trim().length > 0
          ? `${nested.code}: ${nested.message}`
          : nested.message;
      }
    }
    if (
      typeof candidate.message === "string" &&
      candidate.message.trim().length > 0
    )
      return candidate.message;
  }

  return fallback;
}
