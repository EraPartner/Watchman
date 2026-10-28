import { describe, expect, it } from "vitest";
import { KIND_META, SERVICE_KINDS } from "./fieldMetadata.js";

describe("KIND_META field defaults", () => {
  // The add-service form pre-fills these defaults, so one that disagrees with
  // the Zod schema makes a UI-added service differ from an API-added one.
  it.each(SERVICE_KINDS)(
    "%s form defaults match the schema defaults",
    (kind) => {
      const meta = KIND_META[kind];
      // Fill only fields the form itself requires and leaves empty, so every
      // field with a form default is left to the schema's own default.
      const input: Record<string, unknown> = { kind };
      for (const f of meta.fields) {
        if (f.required && f.default === undefined) {
          input[f.name] = f.type === "url" ? "http://h" : "h";
        }
      }
      const schemaDefaults = meta.schema.parse(input) as Record<
        string,
        unknown
      >;
      for (const field of meta.fields) {
        if (field.default === undefined) continue;
        expect([field.name, field.default]).toEqual([
          field.name,
          schemaDefaults[field.name],
        ]);
      }
    }
  );
});

describe("Roon apiPort default", () => {
  it("defaults new Roon services to 9330 and keeps a stored port", () => {
    const schema = KIND_META.roon.schema;
    const fresh = schema.parse({ kind: "roon", host: "core" }) as {
      apiPort: number;
    };
    expect(fresh.apiPort).toBe(9330);
    const stored = schema.parse({
      kind: "roon",
      host: "core",
      apiPort: 9100,
    }) as { apiPort: number };
    expect(stored.apiPort).toBe(9100);
  });
});

describe("pinned fingerprint fields", () => {
  const SSH_KEY = "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU";
  const CERT = "AB:".repeat(31) + "AB";

  it("accepts an empty value or an ssh-keygen fingerprint for SSH host keys", () => {
    const schema = KIND_META.macMini.schema;
    expect(schema.safeParse({ kind: "macMini", host: "h" }).success).toBe(true);
    const parsed = schema.parse({ kind: "macMini", host: "h", sshHostKey: ` ${SSH_KEY} ` }) as {
      sshHostKey: string;
    };
    expect(parsed.sshHostKey).toBe(SSH_KEY);
    for (const kind of ["raspberryPi"] as const) {
      expect(
        KIND_META[kind].schema.safeParse({ kind, host: "h", sshHostKey: SSH_KEY, macMiniSshHostKey: SSH_KEY })
          .success
      ).toBe(true);
    }
  });

  it("rejects a malformed SSH host key fingerprint", () => {
    for (const bad of ["MD5:16:27:ac:a5", "SHA256:short", "ssh-ed25519 AAAAC3Nza"]) {
      expect(KIND_META.macMini.schema.safeParse({ kind: "macMini", host: "h", sshHostKey: bad }).success).toBe(false);
      expect(
        KIND_META.raspberryPi.schema.safeParse({ kind: "raspberryPi", host: "h", macMiniSshHostKey: bad }).success
      ).toBe(false);
    }
  });

  it("accepts a 64-hex DSM certificate fingerprint, with or without colons", () => {
    const schema = KIND_META.synology.schema;
    expect(schema.safeParse({ kind: "synology", host: "h", dsmCertSha256: CERT }).success).toBe(true);
    expect(schema.safeParse({ kind: "synology", host: "h", dsmCertSha256: CERT.replace(/:/g, "").toLowerCase() }).success).toBe(true);
    expect(schema.safeParse({ kind: "synology", host: "h", dsmCertSha256: "AB:CD" }).success).toBe(false);
  });
});
