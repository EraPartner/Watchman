import { describe, expect, it } from "vitest";
import { KIND_META, SERVICE_KINDS } from "./fieldMetadata.js";

describe("KIND_META field defaults", () => {
  // The add-service form pre-fills these defaults, so one that disagrees with
  // the Zod schema makes a UI-added service differ from an API-added one.
  it.each(SERVICE_KINDS)(
    "%s form defaults match the schema defaults",
    (kind) => {
      const meta = KIND_META[kind];
      const schemaDefaults = meta.schema.parse({
        kind,
        // Satisfy required fields; their defaults are not under test.
        host: "h",
        baseUrl: "http://h",
      }) as Record<string, unknown>;
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
