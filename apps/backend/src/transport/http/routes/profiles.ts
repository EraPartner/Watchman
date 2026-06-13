import type { FastifyPluginAsync } from "fastify";
import type { ConfigStore } from "../../../config/store/ConfigStore.js";
import type {
  Profile,
  ProfileStore,
} from "../../../config/store/ProfileStore.js";
import type { ServiceLifecycle } from "../../../application/ServiceLifecycle.js";
import type { NetworkDetector } from "../../../infra/net/gatewayDetect.js";
import { ValidationError } from "../../../core/errors.js";

export interface ProfileRouteDeps {
  profiles: ProfileStore;
  store: ConfigStore;
  lifecycle: ServiceLifecycle;
  detector: NetworkDetector;
}

function toDto(
  p: Profile,
  counts: Record<string, number>,
  activeId: string | undefined
): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    color: p.color ?? null,
    networkSigs: p.networkSigs,
    serviceCount: counts[p.id] ?? 0,
    isActive: p.id === activeId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function profileRoutes(deps: ProfileRouteDeps): FastifyPluginAsync {
  const { profiles, store, lifecycle, detector } = deps;

  return async (app) => {
    app.get("/profiles", async () => {
      const [list, counts, activeId] = await Promise.all([
        profiles.listProfiles(),
        profiles.serviceCounts(),
        profiles.getActiveProfileId(),
      ]);
      return { data: list.map((p) => toDto(p, counts, activeId)) };
    });

    app.get("/profiles/active", async () => {
      const [activeId, autoSwitch] = await Promise.all([
        profiles.getActiveProfileId(),
        profiles.getAutoSwitch(),
      ]);
      return { data: { activeProfileId: activeId ?? null, autoSwitch } };
    });

    app.put<{ Body: { profileId?: unknown } }>(
      "/profiles/active",
      async (req, reply) => {
        const profileId =
          typeof req.body?.profileId === "string" ? req.body.profileId : "";
        const target = profileId
          ? await profiles.getProfile(profileId)
          : undefined;
        if (!target) {
          return reply
            .status(404)
            .send({
              error: { code: "NOT_FOUND", message: "profile not found" },
            });
        }
        await lifecycle.switchActiveProfile(profileId, "manual");
        return { data: { activeProfileId: profileId } };
      }
    );

    app.put<{ Body: { autoSwitch?: unknown } }>(
      "/profiles/settings",
      async (req, reply) => {
        if (typeof req.body?.autoSwitch !== "boolean") {
          return reply.status(400).send({
            error: {
              code: "VALIDATION",
              message: "autoSwitch must be boolean",
            },
          });
        }
        await profiles.setAutoSwitch(req.body.autoSwitch);
        return { data: { autoSwitch: req.body.autoSwitch } };
      }
    );

    // Current detected LAN fingerprint + whether any profile claims it.
    app.get("/profiles/current-network", async () => {
      const sig = await detector.detect();
      const list = await profiles.listProfiles();
      const mac = sig.gatewayMac?.toLowerCase();
      const match = mac
        ? list.find((p) =>
            p.networkSigs.some((s) => s.gatewayMac?.toLowerCase() === mac)
          )
        : undefined;
      return {
        data: {
          signature: sig,
          matchedProfileId: match?.id ?? null,
        },
      };
    });

    app.get<{ Params: { id: string } }>("/profiles/:id", async (req, reply) => {
      const p = await profiles.getProfile(req.params.id);
      if (!p) {
        return reply
          .status(404)
          .send({ error: { code: "NOT_FOUND", message: "profile not found" } });
      }
      const [counts, activeId] = await Promise.all([
        profiles.serviceCounts(),
        profiles.getActiveProfileId(),
      ]);
      return { data: toDto(p, counts, activeId) };
    });

    app.post<{ Body: unknown }>("/profiles", async (req, reply) => {
      try {
        const actor = (req.headers["x-actor"] as string) ?? null;
        const created = await profiles.createProfile(
          (req.body ?? {}) as Record<string, unknown>,
          actor ?? undefined
        );
        const [counts, activeId] = await Promise.all([
          profiles.serviceCounts(),
          profiles.getActiveProfileId(),
        ]);
        return reply
          .status(201)
          .send({ data: toDto(created, counts, activeId) });
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
      "/profiles/:id",
      async (req, reply) => {
        try {
          const actor = (req.headers["x-actor"] as string) ?? null;
          const updated = await profiles.updateProfile(
            req.params.id,
            (req.body ?? {}) as Record<string, unknown>,
            actor ?? undefined
          );
          const [counts, activeId] = await Promise.all([
            profiles.serviceCounts(),
            profiles.getActiveProfileId(),
          ]);
          return { data: toDto(updated, counts, activeId) };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "invalid input";
          const status = msg.includes("not found") ? 404 : 400;
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
      "/profiles/:id",
      async (req, reply) => {
        try {
          const actor = (req.headers["x-actor"] as string) ?? null;
          await profiles.deleteProfile(req.params.id, actor ?? undefined);
          return reply.status(204).send();
        } catch (e) {
          // Invariant guards (active / non-empty / last profile) surface as 409.
          if (e instanceof ValidationError) {
            return reply
              .status(409)
              .send({ error: { code: "CONFLICT", message: e.message } });
          }
          return reply.status(400).send({
            error: {
              code: "VALIDATION",
              message: e instanceof Error ? e.message : "invalid input",
            },
          });
        }
      }
    );

    // Capture the current LAN fingerprint onto a profile (the "assign this
    // network" action). Replaces any existing signature with the same MAC.
    app.post<{ Params: { id: string } }>(
      "/profiles/:id/capture-network",
      async (req, reply) => {
        const profile = await profiles.getProfile(req.params.id);
        if (!profile) {
          return reply
            .status(404)
            .send({
              error: { code: "NOT_FOUND", message: "profile not found" },
            });
        }
        const sig = await detector.detect();
        if (!sig.gatewayIp && !sig.gatewayMac) {
          return reply.status(409).send({
            error: {
              code: "NO_NETWORK",
              message: "could not detect the current network",
            },
          });
        }
        const captured = {
          ...sig,
          capturedAt: new Date().toISOString(),
        };
        const kept = profile.networkSigs.filter(
          (s) =>
            !sig.gatewayMac ||
            s.gatewayMac?.toLowerCase() !== sig.gatewayMac.toLowerCase()
        );
        const actor = (req.headers["x-actor"] as string) ?? null;
        const updated = await profiles.updateProfile(
          req.params.id,
          { networkSigs: [...kept, captured] },
          actor ?? undefined
        );
        // Remember the current signature so the watcher treats this network as
        // known on its next tick.
        await deps.profiles.setLastSignature(sig);
        const [counts, activeId] = await Promise.all([
          profiles.serviceCounts(),
          profiles.getActiveProfileId(),
        ]);
        return { data: toDto(updated, counts, activeId) };
      }
    );
  };
}
