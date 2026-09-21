import { describe, expect, it } from "vitest";

import { extractCandidates } from "../src/shared/candidates.js";
import { deterministicMatch } from "../src/shared/deterministic.js";
import type { FormField } from "../src/shared/types.js";

function field(overrides: Partial<FormField>): FormField {
  return {
    id: "field-1",
    kind: "text",
    label: "Email address",
    name: "email",
    required: true,
    sensitive: false,
    currentValue: "",
    options: [],
    ...overrides,
  };
}

describe("deterministicMatch", () => {
  it("matches a labeled profile value without Jev", () => {
    const match = deterministicMatch(field({}), extractCandidates("Email: mo@example.com"));
    expect(match).toMatchObject({ value: "mo@example.com", confidence: 1, source: "deterministic" });
  });

  it("uses the form's exact select value", () => {
    const match = deterministicMatch(
      field({
        kind: "select",
        label: "Country / Region",
        options: [
          { value: "US", label: "United States" },
          { value: "CA", label: "Canada" },
        ],
      }),
      extractCandidates("Country: United States"),
    );
    expect(match).toMatchObject({ value: "US", displayValue: "United States" });
  });

  it("does not fill protected fields", () => {
    const match = deterministicMatch(
      field({ label: "Gender", sensitive: true }),
      extractCandidates("Gender: Prefer not to say"),
    );
    expect(match).toBeNull();
  });
});
