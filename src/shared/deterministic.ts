import type { FieldMatch, FormField, ProfileCandidate } from "./types.js";

const ALIASES: Record<string, string[]> = {
  "first name": ["first name", "given name"],
  "last name": ["last name", "surname", "family name"],
  "full name": ["full name", "legal name", "name"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "mobile phone"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile"],
  github: ["github", "github url", "github profile"],
  portfolio: ["portfolio", "portfolio url", "website", "personal website"],
  city: ["city"],
  state: ["state", "province", "state province"],
  country: ["country", "country region"],
  address: ["address", "street address"],
  "postal code": ["postal code", "zip", "zip code"],
  "work authorization": ["work authorization", "authorized to work", "legally authorized"],
  sponsorship: ["sponsorship", "visa sponsorship", "require sponsorship"],
};

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalLabel(label: string): string | null {
  const normalized = normalize(label);
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) return canonical;
  }
  return null;
}

function optionValue(field: FormField, candidateValue: string): string | null {
  if (field.kind !== "select" && field.kind !== "radio") return candidateValue;
  const candidate = normalize(candidateValue);
  const exact = field.options.find(
    (option) => normalize(option.label) === candidate || normalize(option.value) === candidate,
  );
  return exact?.value ?? null;
}

export function deterministicMatch(
  field: FormField,
  candidates: ProfileCandidate[],
): FieldMatch | null {
  if (field.sensitive) return null;
  const fieldLabel = canonicalLabel(field.label || field.name);
  if (!fieldLabel) return null;

  const candidate = candidates.find(
    (item) => item.label && canonicalLabel(item.label) === fieldLabel,
  );
  if (!candidate) return null;

  const value = optionValue(field, candidate.value);
  if (value === null) return null;
  const displayValue = field.options.find((option) => option.value === value)?.label ?? candidate.value;

  return {
    fieldId: field.id,
    fieldLabel: field.label,
    value,
    displayValue,
    confidence: 1,
    source: "deterministic",
    reason: `Exact profile label match: ${candidate.label}`,
    selectedByDefault: true,
  };
}
