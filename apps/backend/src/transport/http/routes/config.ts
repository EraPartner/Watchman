import type { FastifyPluginAsync } from "fastify";
import type { ConfigStore } from "../../../config/store/ConfigStore.js";
import type { ServiceLifecycle } from "../../../application/ServiceLifecycle.js";
import type { ServiceRegistry } from "../../../domain/ServiceRegistry.js";
import { KIND_META, SERVICE_KINDS } from "../../../config/schemas/index.js";

export interface ConfigRouteDeps {
  store: ConfigStore;
  lifecycle: ServiceLifecycle;
  registry: ServiceRegistry;
}

export function configRoutes(deps: ConfigRouteDeps): FastifyPluginAsync {
  const { store, lifecycle, registry } = deps;

  return async (app) => {
    app.get("/config/kinds", async () => {
      const kinds = SERVICE_KINDS.map((k) => {
        const m = KIND_META[k];
        return {
          kind: m.kind,
          label: m.label,
          description: m.description,
          fields: m.fields,
          secretFields: m.secretFields,
        };
      });
      return { data: kinds };
    });

    app.get("/config/services", async () => {
      const all = await store.loadAll();
      return { data: all.map((s) => store.redact(s)) };
    });

    // Rows that failed to load (undecryptable secrets, schema drift, unknown kind).
    // loadAll() skips these so the rest of the services still come up; this surfaces
    // them so the UI can show and offer to delete the broken instance.
    app.get("/config/load-errors", async () => {
      const errors = await store.loadErrors();
      return { data: errors };
    });

    app.get<{ Params: { id: string } }>(
      "/config/services/:id",
      async (req, reply) => {
        const s = await store.get(req.params.id);
        if (!s)
          return reply
            .status(404)
            .send({ error: { code: "NOT_FOUND", message: "not found" } });
        return { data: store.redact(s) };
      }
    );

    app.post<{ Body: unknown }>("/config/services", async (req, reply) => {
      try {
        const actor = (req.headers["x-actor"] as string) ?? null;
        // Optional profileId travels alongside the config; the store strips it
        // from schema validation and defaults to the active profile when absent.
        const body = (req.body ?? {}) as Record<string, unknown>;
        const profileId =
          typeof body["profileId"] === "string"
            ? (body["profileId"] as string)
            : undefined;
        const created = await store.create(
          req.body,
          actor ?? undefined,
          profileId
        );
        return reply.status(201).send({ data: store.redact(created) });
      } catch (e) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION",
            message: e instanceof Error ? e.message : "invalid input",
          },
        });
      }
    });

    app.put<{ Params: { id: string }; Body: unknown }>(
      "/config/services/:id",
      async (req, reply) => {
        try {
          const actor = (req.headers["x-actor"] as string) ?? null;
          const updated = await store.update(
            req.params.id,
            req.body,
            actor ?? undefined
          );
          return { data: store.redact(updated) };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "invalid input";
          const status = msg.startsWith("Not found") ? 404 : 400;
          return reply.status(status).send({
            error: {
              code: status === 404 ? "NOT_FOUND" : "VALIDATION",
              message: msg,
            },
          });
        }
      }
    );

    app.delete<{ Params: { id: string } }>(
      "/config/services/:id",
      async (req, reply) => {
        const actor = (req.headers["x-actor"] as string) ?? null;
        await store.delete(req.params.id, actor ?? undefined);
        return reply.status(204).send();
      }
    );

    // Move a service to a different profile (ADR-027). Emits config:service.updated
    // so the lifecycle reconciles whether it runs under the active profile.
    app.put<{ Params: { id: string }; Body: { profileId?: unknown } }>(
      "/config/services/:id/profile",
      async (req, reply) => {
        const profileId =
          typeof req.body?.profileId === "string" ? req.body.profileId : "";
        if (!profileId) {
          return reply.status(400).send({
            error: { code: "VALIDATION", message: "profileId is required" },
          });
        }
        const existing = await store.get(req.params.id);
        if (!existing) {
          return reply
            .status(404)
            .send({ error: { code: "NOT_FOUND", message: "not found" } });
        }
        const actor = (req.headers["x-actor"] as string) ?? null;
        await store.setProfile(req.params.id, profileId, actor ?? undefined);
        const updated = await store.get(req.params.id);
        return { data: updated ? store.redact(updated) : null };
      }
    );

    app.post<{ Params: { id: string } }>(
      "/config/services/:id/test",
      async (req, reply) => {
        const stored = await store.get(req.params.id);
        if (!stored) {
          return reply
            .status(404)
            .send({ error: { code: "NOT_FOUND", message: "not found" } });
        }
        const svcId = lifecycle.idByStoredId(stored.id);
        if (!svcId || !registry.has(svcId)) {
          return reply.status(409).send({
            error: {
              code: "NOT_LIVE",
              message: "service not live (disabled or not tracked)",
            },
          });
        }
        const svc = registry.get(svcId);
        const started = Date.now();
        const res = await svc.checkHealth(req.abortController.signal);
        const latencyMs = Date.now() - started;
        if (res.ok)
          return { data: { ok: true, latencyMs, snapshot: res.value } };
        return {
          data: {
            ok: false,
            latencyMs,
            error: { code: res.error.code, message: res.error.message },
          },
        };
      }
    );

    app.get("/config/export", async (req, reply) => {
      const actor = (req.headers["x-actor"] as string) ?? null;
      const bundle = await store.exportAll(actor ?? undefined);
      const filename = `watchman-config-${bundle.exportedAt.slice(0, 10)}.json`;
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      return bundle;
    });

    app.post<{ Body: unknown }>("/config/import", async (req, reply) => {
      try {
        const actor = (req.headers["x-actor"] as string) ?? null;
        const result = await store.importBundle(req.body, actor ?? undefined);
        return { data: result };
      } catch (e) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION",
            message: e instanceof Error ? e.message : "invalid bundle",
          },
        });
      }
    });

    app.get<{ Querystring: { limit?: string } }>(
      "/config/audit",
      async (req) => {
        const limit = req.query.limit
          ? Math.max(1, Math.min(1000, Number(req.query.limit)))
          : 100;
        const entries = await store.listAudit(limit);
        return {
          data: entries.map((e) => ({
            id: e.id,
            ts: e.ts.toISOString(),
            action: e.action,
            targetKind: e.targetKind,
            targetId: e.targetId,
            diff: e.diff,
            actor: e.actor,
          })),
        };
      }
    );
  };
}
