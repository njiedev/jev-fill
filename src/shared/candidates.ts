import type { ProfileCandidate } from "./types.js";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const URL_RE = /https?:\/\/[^\s<>)\]}]+/gi;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractCandidates(text: string, limit = 80): ProfileCandidate[] {
  const candidates: Omit<ProfileCandidate, "id">[] = [];
  const seen = new Set<string>();

  const add = (candidate: Omit<ProfileCandidate, "id">) => {
    const value = clean(candidate.value);
    if (!value || value.length > 700) return;
    const key = `${candidate.label?.toLowerCase() ?? ""}\u0000${value.toLowerCase()}`;
    if (seen.has(key) || candidates.length >= limit) return;
    seen.add(key);
    candidates.push({ ...candidate, value });
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const labeled = trimmed.match(/^([^:]{2,60}):\s*(.+)$/);
    if (labeled) {
      add({ label: clean(labeled[1]), value: labeled[2], source: "labeled" });
    } else if (trimmed.length <= 240) {
      add({ label: null, value: trimmed, source: "line" });
    }
  }

  for (const value of text.match(EMAIL_RE) ?? []) add({ label: "email", value, source: "email" });
  for (const value of text.match(PHONE_RE) ?? []) add({ label: "phone", value, source: "phone" });
  for (const value of text.match(URL_RE) ?? []) add({ label: "url", value, source: "url" });

  for (const paragraph of text.split(/\n\s*\n/)) {
    const value = clean(paragraph);
    if (value.length >= 40 && value.length <= 700) {
      add({ label: null, value, source: "paragraph" });
    }
  }

  return candidates.map((candidate, index) => ({
    id: `c${String(index).padStart(3, "0")}`,
    ...candidate,
  }));
}
