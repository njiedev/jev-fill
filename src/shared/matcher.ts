import { extractCandidates } from "./candidates.js";
import { deterministicMatch } from "./deterministic.js";
import type {
  FieldMatch,
  FormField,
  MatchResponse,
  ProfileCandidate,
} from "./types.js";

const NONE = "none";

export type ChoiceAnswer = {
  choice: string;
  confidence: number;
};

export type AskChoices = (
  profileText: string,
  fields: FormField[],
  candidates: ProfileCandidate[],
) => Promise<Record<string, ChoiceAnswer>>;

function manualMatch(field: FormField, reason: string): FieldMatch {
  return {
    fieldId: field.id,
    fieldLabel: field.label,
    value: null,
    displayValue: null,
    confidence: null,
    source: "manual",
    reason,
    selectedByDefault: false,
  };
}

function criteriaFor(field: FormField, candidates: ProfileCandidate[]): Record<string, string | null> {
  if (field.kind === "select" || field.kind === "radio") {
    return Object.fromEntries([
      ...field.options.map((option, index) => [
        `o${String(index).padStart(3, "0")}`,
        `Use this exact form option: ${JSON.stringify(option.label)}`,
      ]),
      [NONE, "The pasted profile does not state a reliable answer for this field."],
    ]);
  }

  return Object.fromEntries([
    ...candidates.map((candidate) => [
      candidate.id,
      `Use this exact profile value: ${JSON.stringify(candidate.value)}${
        candidate.label ? ` (source label: ${candidate.label})` : ""
      }`,
    ]),
    [NONE, "None of the candidate values correctly answers this field."],
  ]);
}

export function buildChoiceQuestions(
  fields: FormField[],
  candidates: ProfileCandidate[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      {
        type: "choice",
        instructions: [
          `Choose the exact answer for the job application field ${JSON.stringify(field.label)}.`,
          "Use only facts explicitly stated in `profile`.",
          "Do not infer preferences, legal status, protected traits, or missing facts.",
          "Choose `none` when the profile is ambiguous or does not contain the answer.",
        ].join(" "),
        criteria: criteriaFor(field, candidates),
      },
    ]),
  );
}

export async function matchForm(
  profileText: string,
  fields: FormField[],
  options: { askChoices?: AskChoices; model?: string } = {},
): Promise<MatchResponse> {
  const candidates = extractCandidates(profileText);
  const matches = new Map<string, FieldMatch>();
  const warnings: string[] = [];

  for (const field of fields) {
    if (field.sensitive) {
      matches.set(field.id, manualMatch(field, "Sensitive or voluntary-disclosure field; review manually."));
      continue;
    }
    if (field.kind === "checkbox") {
      matches.set(field.id, manualMatch(field, "Checkboxes require explicit manual review in this version."));
      continue;
    }
    const exact = deterministicMatch(field, candidates);
    if (exact) matches.set(field.id, exact);
  }

  const unresolved = fields.filter((field) => !matches.has(field.id));
  const model = options.model ?? "jev-latest";

  if (unresolved.length && options.askChoices) {
    const answers = await options.askChoices(profileText, unresolved, candidates);
    for (const field of unresolved) {
      const answer = answers[field.id];
      if (!answer || answer.choice === NONE) {
        matches.set(field.id, manualMatch(field, "Jev found no reliable source value."));
        continue;
      }

      if (field.kind === "select" || field.kind === "radio") {
        const optionIndex = Number(answer.choice.slice(1));
        const selected = field.options[optionIndex];
        if (!selected) {
          matches.set(field.id, manualMatch(field, "Jev returned an unavailable form option."));
          continue;
        }
        matches.set(field.id, {
          fieldId: field.id,
          fieldLabel: field.label,
          value: selected.value,
          displayValue: selected.label,
          confidence: answer.confidence,
          source: "jev",
          reason: "Jev selected one of the form's exact options from the profile source.",
          selectedByDefault: false,
        });
        continue;
      }

      const candidate = candidates.find((item) => item.id === answer.choice);
      if (!candidate) {
        matches.set(field.id, manualMatch(field, "Jev returned an unavailable profile candidate."));
        continue;
      }
      matches.set(field.id, {
        fieldId: field.id,
        fieldLabel: field.label,
        value: candidate.value,
        displayValue: candidate.value,
        confidence: answer.confidence,
        source: "jev",
        reason: "Jev selected an exact span from the profile source.",
        selectedByDefault: false,
      });
    }
  } else if (unresolved.length) {
    warnings.push("Add a TypeSafe API key in Setup to enable Jev matching. Exact labeled matches are still available.");
    for (const field of unresolved) {
      matches.set(field.id, manualMatch(field, "No exact match; add a TypeSafe API key in Setup for Jev matching."));
    }
  }

  return {
    matches: fields.map((field) => matches.get(field.id) ?? manualMatch(field, "No match available.")),
    warnings,
    model: options.askChoices ? model : null,
  };
}
