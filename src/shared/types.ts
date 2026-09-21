export type FieldKind = "text" | "textarea" | "select" | "radio" | "checkbox";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormField {
  id: string;
  kind: FieldKind;
  label: string;
  name: string;
  required: boolean;
  sensitive: boolean;
  currentValue: string;
  options: FieldOption[];
}

export interface ProfileCandidate {
  id: string;
  label: string | null;
  value: string;
  source: "labeled" | "email" | "phone" | "url" | "line" | "paragraph";
}

export type MatchSource = "deterministic" | "jev" | "manual";

export interface FieldMatch {
  fieldId: string;
  fieldLabel: string;
  value: string | null;
  displayValue: string | null;
  confidence: number | null;
  source: MatchSource;
  reason: string;
  selectedByDefault: boolean;
}

export interface MatchRequest {
  profileText: string;
  fields: FormField[];
}

export interface MatchResponse {
  matches: FieldMatch[];
  warnings: string[];
  model: string | null;
}

export interface ApplyInstruction {
  fieldId: string;
  value: string;
}
