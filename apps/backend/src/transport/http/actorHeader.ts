import type { FastifyRequest } from "fastify";

/**
 * The optional `x-actor` header recorded in the audit log. A repeated header
 * arrives as an array; it is not a single actor, so it is ignored.
 */
export function actorHeader(req: FastifyRequest): string | undefined {
  const value = req.headers["x-actor"];
  return typeof value === "string" ? value : undefined;
}
