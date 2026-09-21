import { describe, expect, it } from "vitest";

import { matchForm } from "../src/shared/matcher.js";
import type { FormField } from "../src/shared/types.js";

const fields: FormField[] = [
  {
    id: "email",
    kind: "text",
    label: "Email address",
    name: "email",
    required: true,
    sensitive: false,
    currentValue: "",
    options: [],
  },
  {
    id: "favorite-project",
    kind: "textarea",
    label: "Describe your most relevant project",
    name: "project",
    required: false,
    sensitive: false,
    currentValue: "",
    options: [],
  },
];

describe("matchForm", () => {
  it("combines deterministic matches with review-first Jev matches", async () => {
    const result = await matchForm(
      "Email: mo@example.com\nProject: Built an evidence-grounded equity research system.",
      fields,
      {
        model: "test-jev",
        askChoices: async (_profile, unresolved, candidates) => ({
          [unresolved[0].id]: {
            choice: candidates.find((candidate) => candidate.value.startsWith("Built an"))!.id,
            confidence: 0.84,
          },
        }),
      },
    );

    expect(result.matches[0]).toMatchObject({ source: "deterministic", selectedByDefault: true });
    expect(result.matches[1]).toMatchObject({
      source: "jev",
      value: "Built an evidence-grounded equity research system.",
      confidence: 0.84,
      selectedByDefault: false,
    });
  });
});
