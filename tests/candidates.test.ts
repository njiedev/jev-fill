import { describe, expect, it } from "vitest";

import { extractCandidates } from "../src/shared/candidates.js";

describe("extractCandidates", () => {
  it("keeps labeled values and exact contact spans", () => {
    const candidates = extractCandidates(`
Name: Mohammed Njie
Email: mo@example.com
Phone: +1 (312) 555-0199
Portfolio: https://example.dev/work
    `);

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Name", value: "Mohammed Njie", source: "labeled" }),
      expect.objectContaining({ label: "Email", value: "mo@example.com", source: "labeled" }),
      expect.objectContaining({ label: "Phone", value: "+1 (312) 555-0199", source: "labeled" }),
      expect.objectContaining({ label: "url", value: "https://example.dev/work", source: "url" }),
    ]));
  });

  it("deduplicates candidates and respects the limit", () => {
    const candidates = extractCandidates("Alpha\nAlpha\nBeta\nGamma", 2);
    expect(candidates.map((candidate) => candidate.value)).toEqual(["Alpha", "Beta"]);
  });
});
