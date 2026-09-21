import type { ApplyInstruction, FieldMatch, FormField, MatchResponse } from "../src/shared/types.js";

const SERVER = "http://127.0.0.1:8788";
const profile = document.querySelector<HTMLTextAreaElement>("#profile")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const scanButton = document.querySelector<HTMLButtonElement>("#scan")!;
const applyButton = document.querySelector<HTMLButtonElement>("#apply")!;
const editProfileButton = document.querySelector<HTMLButtonElement>("#edit-profile")!;
const saveStatus = document.querySelector<HTMLElement>("#save-status")!;
const serverStatus = document.querySelector<HTMLElement>("#server-status")!;
const message = document.querySelector<HTMLElement>("#message")!;
const profileState = document.querySelector<HTMLElement>("#profile-state")!;
const pageTitle = document.querySelector<HTMLElement>("#page-title")!;
const pageHost = document.querySelector<HTMLElement>("#page-host")!;
const resultsSection = document.querySelector<HTMLElement>("#results-section")!;
const resultGroups = document.querySelector<HTMLElement>("#result-groups")!;
const resultsCount = document.querySelector<HTMLElement>("#results-count")!;
const fillBar = document.querySelector<HTMLElement>("#fill-bar")!;
const selectedCount = document.querySelector<HTMLElement>("#selected-count")!;
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const views = {
  autofill: document.querySelector<HTMLElement>("#autofill-view")!,
  profile: document.querySelector<HTMLElement>("#profile-view")!,
};

let currentMatches: FieldMatch[] = [];

function showView(view: keyof typeof views): void {
  for (const [name, element] of Object.entries(views)) element.classList.toggle("hidden", name !== view);
  for (const tab of tabs) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  fillBar.classList.toggle("hidden", view !== "autofill" || currentMatches.every((match) => match.value === null));
}

function setMessage(value: string, error = false): void {
  message.textContent = value;
  message.classList.toggle("error", error);
}

function updateProfileState(): void {
  const text = profile.value.trim();
  const lines = text ? text.split(/\r?\n/).filter((line) => line.trim()).length : 0;
  profileState.textContent = text ? `${lines} source line${lines === 1 ? "" : "s"} saved on this device` : "No profile source saved yet";
  scanButton.textContent = text ? "Review autofill for this page" : "Add profile source first";
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab found.");
  return tab;
}

async function updatePageContext(): Promise<void> {
  try {
    const tab = await activeTab();
    pageTitle.textContent = tab.title || "Untitled application page";
    pageHost.textContent = tab.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "Unknown site";
  } catch {
    pageTitle.textContent = "No active application page";
    pageHost.textContent = "Open a job application, then return here.";
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function sendToPage<T>(payload: unknown): Promise<T> {
  const tab = await activeTab();
  await ensureContentScript(tab.id!);
  return chrome.tabs.sendMessage(tab.id!, payload) as Promise<T>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function resultMarkup(match: FieldMatch): string {
  const badge = match.source === "deterministic" ? "Exact" : match.source === "jev" ? "Jev" : "Manual";
  const confidence = match.confidence === null ? "" : ` · ${Math.round(match.confidence * 100)}% confidence`;
  return `
    <label class="result">
      <input type="checkbox" data-field-id="${escapeHtml(match.fieldId)}" ${match.selectedByDefault ? "checked" : ""} ${match.value === null ? "disabled" : ""} />
      <span class="result-main">
        <span class="field-label">${escapeHtml(match.fieldLabel)}</span>
        <span class="field-value">${escapeHtml(match.displayValue ?? match.reason)}</span>
        <span class="field-meta">${escapeHtml(match.reason + confidence)}</span>
      </span>
      <span class="badge ${match.source === "deterministic" ? "exact" : match.source === "jev" ? "jev" : "manual"}">${badge}</span>
    </label>`;
}

function groupMarkup(title: string, note: string, matches: FieldMatch[], open: boolean): string {
  if (!matches.length) return "";
  return `
    <details class="result-group" ${open ? "open" : ""}>
      <summary>
        <span><span class="group-title">${escapeHtml(title)}</span><span class="group-note">${escapeHtml(note)}</span></span>
        <span class="group-count">${matches.length}</span>
      </summary>
      <div>${matches.map(resultMarkup).join("")}</div>
    </details>`;
}

function updateSelectedCount(): void {
  const selected = resultGroups.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked').length;
  selectedCount.textContent = `${selected} selected`;
  applyButton.disabled = selected === 0;
}

function renderMatches(matches: FieldMatch[]): void {
  currentMatches = matches;
  resultsSection.classList.remove("hidden");
  const exact = matches.filter((match) => match.source === "deterministic");
  const jev = matches.filter((match) => match.source === "jev");
  const manual = matches.filter((match) => match.source === "manual");
  const fillable = exact.length + jev.length;
  resultsCount.textContent = `${fillable}/${matches.length} matched`;
  resultGroups.innerHTML = [
    groupMarkup("Exact matches", "Ready from labeled profile facts", exact, true),
    groupMarkup("Jev suggestions", "Select after checking the source value", jev, true),
    groupMarkup("Manual review", "Missing, sensitive, or unsupported", manual, manual.length > 0 && fillable === 0),
  ].join("");
  resultGroups.addEventListener("change", updateSelectedCount);
  fillBar.classList.toggle("hidden", fillable === 0);
  scanButton.textContent = "Refresh autofill plan";
  updateSelectedCount();
}

async function checkServer(): Promise<void> {
  try {
    const response = await fetch(`${SERVER}/health`);
    if (!response.ok) throw new Error("Server unavailable");
    const health = await response.json() as { jevConfigured: boolean };
    serverStatus.textContent = health.jevConfigured ? "Jev ready" : "Exact only";
    serverStatus.className = `status ${health.jevConfigured ? "good" : "neutral"}`;
  } catch {
    serverStatus.textContent = "Offline";
    serverStatus.className = "status bad";
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => showView(tab.dataset.view as keyof typeof views));
}
editProfileButton.addEventListener("click", () => showView("profile"));

saveButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ profileText: profile.value });
  updateProfileState();
  saveStatus.textContent = "Saved on this device";
  setTimeout(() => { saveStatus.textContent = ""; }, 1800);
  showView("autofill");
  setMessage("Profile updated. Review autofill when the application is ready.");
});

scanButton.addEventListener("click", async () => {
  if (!profile.value.trim()) {
    showView("profile");
    saveStatus.textContent = "Paste your source before scanning.";
    profile.focus();
    return;
  }
  scanButton.disabled = true;
  scanButton.textContent = "Scanning visible fields…";
  fillBar.classList.add("hidden");
  setMessage("Reading the current page and matching exact source values…");
  try {
    await chrome.storage.local.set({ profileText: profile.value });
    const page = await sendToPage<{ fields: FormField[] }>({ type: "JEV_FILL_SCAN" });
    if (!page.fields.length) throw new Error("No visible form fields found on this page.");
    setMessage(`Matching ${page.fields.length} visible fields…`);
    const response = await fetch(`${SERVER}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileText: profile.value, fields: page.fields }),
    });
    const body = await response.json() as MatchResponse & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Matching failed.");
    renderMatches(body.matches);
    setMessage(body.warnings[0] ?? "Check the grouped plan. Jev suggestions stay unselected until you approve them.");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Could not scan this form.", true);
    scanButton.textContent = "Try scanning again";
  } finally {
    scanButton.disabled = false;
    void checkServer();
    void updatePageContext();
  }
});

applyButton.addEventListener("click", async () => {
  const selectedIds = new Set(
    Array.from(resultGroups.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')).map((input) => input.dataset.fieldId),
  );
  const instructions: ApplyInstruction[] = currentMatches
    .filter((match) => match.value !== null && selectedIds.has(match.fieldId))
    .map((match) => ({ fieldId: match.fieldId, value: match.value! }));
  if (!instructions.length) return setMessage("Select at least one proposed fill.", true);
  applyButton.disabled = true;
  applyButton.textContent = "Filling…";
  try {
    const outcome = await sendToPage<{ applied: number; failed: string[] }>({ type: "JEV_FILL_APPLY", instructions });
    setMessage(`Filled ${outcome.applied} field${outcome.applied === 1 ? "" : "s"}. Review the application before continuing.${outcome.failed.length ? ` ${outcome.failed.length} need manual attention.` : ""}`);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Could not fill the selected fields.", true);
  } finally {
    applyButton.textContent = "Fill selected";
    updateSelectedCount();
  }
});

void chrome.storage.local.get("profileText").then((stored) => {
  profile.value = typeof stored.profileText === "string" ? stored.profileText : "";
  updateProfileState();
});
void updatePageContext();
void checkServer();
