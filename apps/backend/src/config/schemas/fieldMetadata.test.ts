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
