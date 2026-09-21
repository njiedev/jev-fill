import type { ApplyInstruction, FieldMatch, FormField, MatchResponse } from "../src/shared/types.js";
import { siteAccessPattern } from "../src/shared/permissions.js";
import { parseResumeFile } from "./resume.js";

const profile = document.querySelector<HTMLTextAreaElement>("#profile")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const scanButton = document.querySelector<HTMLButtonElement>("#scan")!;
const applyButton = document.querySelector<HTMLButtonElement>("#apply")!;
const editProfileButton = document.querySelector<HTMLButtonElement>("#edit-profile")!;
const saveStatus = document.querySelector<HTMLElement>("#save-status")!;
const connectionStatus = document.querySelector<HTMLElement>("#connection-status")!;
const keyStatus = document.querySelector<HTMLElement>("#key-status")!;
const apiKey = document.querySelector<HTMLInputElement>("#api-key")!;
const rememberKey = document.querySelector<HTMLInputElement>("#remember-key")!;
const saveKeyButton = document.querySelector<HTMLButtonElement>("#save-key")!;
const removeKeyButton = document.querySelector<HTMLButtonElement>("#remove-key")!;
const resumeFile = document.querySelector<HTMLInputElement>("#resume-file")!;
const chooseResumeButton = document.querySelector<HTMLButtonElement>("#choose-resume")!;
const resumeStatus = document.querySelector<HTMLElement>("#resume-status")!;
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
  setup: document.querySelector<HTMLElement>("#setup-view")!,
};

type ExtensionResponse<T> = { ok: true } & T | { ok: false; error: string };
type KeyState = { configured: boolean; persistence: "session" | "local" | null };

let currentMatches: FieldMatch[] = [];
let resumeName = "";
let resumeBlock = "";
let currentTab: chrome.tabs.Tab | null = null;

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
  profileState.textContent = resumeName
    ? `${resumeName} · ${lines} source line${lines === 1 ? "" : "s"}`
    : text ? `${lines} source line${lines === 1 ? "" : "s"} saved on this device` : "No résumé or profile saved yet";
  scanButton.textContent = text ? "Review autofill for this page" : "Add your résumé first";
}

async function extensionMessage<T>(payload: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(payload) as ExtensionResponse<T>;
  if (!response?.ok) throw new Error(response?.error || "Jev Fill could not complete this request.");
  return response;
}

function renderKeyState(state: KeyState): void {
  connectionStatus.textContent = state.configured ? "Jev ready" : "Add key";
  connectionStatus.className = `status ${state.configured ? "good" : "neutral"}`;
  keyStatus.textContent = state.configured
    ? state.persistence === "local" ? "Connected · remembered on this device" : "Connected · this Chrome session"
    : "Not connected";
  removeKeyButton.classList.toggle("hidden", !state.configured);
}

async function refreshKeyState(): Promise<void> {
  try {
    renderKeyState(await extensionMessage<KeyState>({ type: "JEV_FILL_KEY_STATUS" }));
  } catch {
    connectionStatus.textContent = "Setup needed";
    connectionStatus.className = "status bad";
    keyStatus.textContent = "Could not read extension storage.";
  }
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab found.");
  return tab;
}

async function updatePageContext(): Promise<void> {
  try {
    const tab = await activeTab();
    currentTab = tab;
    pageTitle.textContent = tab.title || "Untitled application page";
    pageHost.textContent = tab.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "Unknown site";
  } catch {
    currentTab = null;
    pageTitle.textContent = "No active application page";
    pageHost.textContent = "Open a job application, then return here.";
  }
}

async function requestSiteAccess(): Promise<void> {
  const tab = currentTab ?? await activeTab();
  const origin = siteAccessPattern(tab.url);
  if (!origin) throw new Error("Open a regular job application webpage first. Chrome system pages cannot be scanned.");
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error("Jev Fill needs access to this site to read and fill its application form.");
}

async function sendToPage<T>(payload: unknown): Promise<T> {
  const tab = await activeTab();
  await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ["content.js"] });
  return chrome.tabs.sendMessage(tab.id!, payload) as Promise<T>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function resultMarkup(match: FieldMatch): string {
  const badge = match.source === "deterministic" ? "Exact" : match.source === "jev" ? "Jev" : "Manual";
  const badgeClass = match.source === "deterministic" ? "exact" : match.source;
  const confidence = match.confidence === null ? "" : ` · ${Math.round(match.confidence * 100)}% confidence`;
  return `<label class="result"><input type="checkbox" data-field-id="${escapeHtml(match.fieldId)}" ${match.selectedByDefault ? "checked" : ""} ${match.value === null ? "disabled" : ""} /><span class="result-main"><span class="field-label">${escapeHtml(match.fieldLabel)}</span><span class="field-value">${escapeHtml(match.displayValue ?? match.reason)}</span><span class="field-meta">${escapeHtml(match.reason + confidence)}</span></span><span class="badge ${badgeClass}">${badge}</span></label>`;
}

function groupMarkup(title: string, note: string, matches: FieldMatch[], open: boolean): string {
  if (!matches.length) return "";
  return `<details class="result-group" ${open ? "open" : ""}><summary><span><span class="group-title">${escapeHtml(title)}</span><span class="group-note">${escapeHtml(note)}</span></span><span class="group-count">${matches.length}</span></summary><div>${matches.map(resultMarkup).join("")}</div></details>`;
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
  fillBar.classList.toggle("hidden", fillable === 0);
  scanButton.textContent = "Refresh autofill plan";
  updateSelectedCount();
}

for (const tab of tabs) tab.addEventListener("click", () => showView(tab.dataset.view as keyof typeof views));
editProfileButton.addEventListener("click", () => showView("setup"));
resultGroups.addEventListener("change", updateSelectedCount);

saveKeyButton.addEventListener("click", async () => {
  saveKeyButton.disabled = true;
  saveKeyButton.textContent = "Verifying…";
  keyStatus.textContent = "Checking this key with TypeSafe…";
  try {
    const state = await extensionMessage<KeyState>({ type: "JEV_FILL_VALIDATE_KEY", apiKey: apiKey.value, remember: rememberKey.checked });
    apiKey.value = "";
    renderKeyState(state);
  } catch (error) {
    keyStatus.textContent = error instanceof Error ? error.message : "Could not verify this key.";
  } finally {
    saveKeyButton.disabled = false;
    saveKeyButton.textContent = "Verify & save";
  }
});

removeKeyButton.addEventListener("click", async () => {
  renderKeyState(await extensionMessage<KeyState>({ type: "JEV_FILL_REMOVE_KEY" }));
});

chooseResumeButton.addEventListener("click", () => resumeFile.click());
resumeFile.addEventListener("change", async () => {
  const file = resumeFile.files?.[0];
  if (!file) return;
  chooseResumeButton.disabled = true;
  resumeStatus.textContent = `Reading ${file.name}…`;
  try {
    const parsed = await parseResumeFile(file);
    const nextBlock = `Resume source: ${file.name}\n\n${parsed}`;
    const remaining = resumeBlock && profile.value.includes(resumeBlock)
      ? profile.value.replace(resumeBlock, "").trim()
      : profile.value.trim();
    profile.value = [remaining, nextBlock].filter(Boolean).join("\n\n");
    resumeName = file.name;
    resumeBlock = nextBlock;
    await chrome.storage.local.set({ profileText: profile.value, resumeName, resumeBlock });
    resumeStatus.textContent = `${file.name} parsed locally. Review the text below.`;
    updateProfileState();
  } catch (error) {
    resumeStatus.textContent = error instanceof Error ? error.message : "Could not read this résumé.";
  } finally {
    chooseResumeButton.disabled = false;
    resumeFile.value = "";
  }
});

saveButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ profileText: profile.value, resumeName, resumeBlock });
  updateProfileState();
  saveStatus.textContent = "Saved on this device";
  setTimeout(() => { saveStatus.textContent = ""; }, 1800);
  showView("autofill");
  setMessage("Profile updated. Review autofill when the application is ready.");
});

scanButton.addEventListener("click", async () => {
  if (!profile.value.trim()) {
    showView("setup");
    resumeStatus.textContent = "Add a résumé or profile source before scanning.";
    return;
  }
  try {
    await requestSiteAccess();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Site access was not granted.", true);
    return;
  }
  scanButton.disabled = true;
  scanButton.textContent = "Scanning visible fields…";
  fillBar.classList.add("hidden");
  setMessage("Reading the current page and matching your saved facts…");
  try {
    await chrome.storage.local.set({ profileText: profile.value, resumeName, resumeBlock });
    const page = await sendToPage<{ fields: FormField[] }>({ type: "JEV_FILL_SCAN" });
    if (!page.fields.length) throw new Error("No visible form fields found on this page.");
    setMessage(`Matching ${page.fields.length} visible fields…`);
    const body = await extensionMessage<{ result: MatchResponse }>({
      type: "JEV_FILL_MATCH",
      request: { profileText: profile.value, fields: page.fields },
    });
    renderMatches(body.result.matches);
    setMessage(body.result.warnings[0] ?? "Check the grouped plan. Jev suggestions stay unselected until you approve them.");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Could not scan this form.", true);
    scanButton.textContent = "Try scanning again";
  } finally {
    scanButton.disabled = false;
    void refreshKeyState();
    void updatePageContext();
  }
});

applyButton.addEventListener("click", async () => {
  const selectedIds = new Set(Array.from(resultGroups.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')).map((input) => input.dataset.fieldId));
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

void chrome.storage.local.get(["profileText", "resumeName", "resumeBlock"]).then((stored) => {
  profile.value = typeof stored.profileText === "string" ? stored.profileText : "";
  resumeName = typeof stored.resumeName === "string" ? stored.resumeName : "";
  resumeBlock = typeof stored.resumeBlock === "string" ? stored.resumeBlock : "";
  if (resumeName) resumeStatus.textContent = `${resumeName} is saved. Choose another file to replace it.`;
  updateProfileState();
});
void updatePageContext();
void refreshKeyState();
chrome.tabs.onActivated.addListener(() => { void updatePageContext(); });
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status || changeInfo.url || changeInfo.title)) void updatePageContext();
});
