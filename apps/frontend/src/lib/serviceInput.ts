import type {
  ServiceInstance,
  ServiceInstanceInput,
} from "@/services/configApi";

/**
 * Update input that flips a stored service's `enabled` flag.
 *
 * `PUT /config/services/:id` replaces the whole config: only secrets and the
 * base fields (instanceId, pollPolicy, cacheTtlMs, timeoutMs) are carried
 * over when omitted. Sending just `{ enabled }` dropped every other field, so
 * the save failed validation (or wiped optional fields). Resend the stored
 * config; its redacted secrets ("***") are merged back by the backend.
 */
export function toggleEnabledInput(
  svc: Pick<ServiceInstance, "instanceId" | "enabled" | "config">
): Partial<ServiceInstanceInput> {
  const enabled = !svc.enabled;
  return {
    instanceId: svc.instanceId,
    enabled,
    // configApi spreads `config` over the top level, so `enabled` must be
    // set here too or the stored value would win.
    config: { ...svc.config, enabled },
  };
}
