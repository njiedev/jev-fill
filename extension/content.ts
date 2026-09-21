import type { ApplyInstruction, FieldKind, FieldOption, FormField } from "../src/shared/types.js";

declare global {
  interface Window {
    __jevFillLoaded?: boolean;
  }
}

const SENSITIVE_RE = /\b(race|ethnicity|gender|sex|sexual orientation|lgbt|transgender|disability|disabled|veteran|military status|pronouns?|voluntary self.?identification)\b/i;
const SKIP_INPUT_TYPES = new Set(["hidden", "password", "file", "submit", "button", "image", "reset"]);
let nextId = 0;

function visible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function textFromIds(ids: string): string {
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function fieldLabel(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const explicit = element.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`) : null;
  const wrapped = element.closest("label");
  const labelledBy = element.getAttribute("aria-labelledby");
  return (
    explicit?.innerText?.trim() ||
    wrapped?.innerText?.trim() ||
    element.getAttribute("aria-label")?.trim() ||
    (labelledBy ? textFromIds(labelledBy) : "") ||
    element.getAttribute("placeholder")?.trim() ||
    element.getAttribute("name")?.trim() ||
    "Unlabeled field"
  ).replace(/\s+/g, " ");
}

function idFor(element: HTMLElement): string {
  if (!element.dataset.jevFillId) element.dataset.jevFillId = `jev-${nextId++}`;
  return element.dataset.jevFillId;
}

function optionsFor(element: HTMLInputElement | HTMLSelectElement): FieldOption[] {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options)
      .filter((option) => !option.disabled && option.value !== "")
      .map((option) => ({ value: option.value, label: option.text.trim() }));
  }
  if (element.type === "radio" && element.name) {
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(element.name)}"]`)).map(
      (radio) => ({ value: radio.value, label: fieldLabel(radio) }),
    );
  }
  return [];
}

function kindFor(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): FieldKind {
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  if (element.type === "radio") return "radio";
  if (element.type === "checkbox") return "checkbox";
  return "text";
}

function scan(): FormField[] {
  const controls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"));
  const seenRadioGroups = new Set<string>();
  const fields: FormField[] = [];

  for (const element of controls) {
    const readOnly = !(element instanceof HTMLSelectElement) && element.readOnly;
    if (!visible(element) || element.disabled || readOnly) continue;
    if (element instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(element.type)) continue;
    if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
      if (seenRadioGroups.has(element.name)) continue;
      seenRadioGroups.add(element.name);
    }
    const label = fieldLabel(element);
    fields.push({
      id: idFor(element),
      kind: kindFor(element),
      label,
      name: element.name,
      required: element.required || element.getAttribute("aria-required") === "true",
      sensitive: SENSITIVE_RE.test(label),
      currentValue: element instanceof HTMLInputElement && element.type === "checkbox" ? String(element.checked) : element.value,
      options: optionsFor(element as HTMLInputElement | HTMLSelectElement),
    });
  }
  return fields;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function apply(instructions: ApplyInstruction[]): { applied: number; failed: string[] } {
  let applied = 0;
  const failed: string[] = [];
  for (const instruction of instructions) {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `[data-jev-fill-id="${CSS.escape(instruction.fieldId)}"]`,
    );
    if (!element) {
      failed.push(instruction.fieldId);
      continue;
    }
    if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
      const radio = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(element.name)}"]`))
        .find((item) => item.value === instruction.value);
      if (!radio) {
        failed.push(instruction.fieldId);
        continue;
      }
      radio.click();
      applied++;
      continue;
    }
    setNativeValue(element, instruction.value);
    if (element.value === instruction.value) applied++;
    else failed.push(instruction.fieldId);
  }
  return { applied, failed };
}

if (!window.__jevFillLoaded) {
  window.__jevFillLoaded = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "JEV_FILL_SCAN") sendResponse({ fields: scan(), url: location.href, title: document.title });
    if (message?.type === "JEV_FILL_APPLY") sendResponse(apply(message.instructions as ApplyInstruction[]));
  });
}
