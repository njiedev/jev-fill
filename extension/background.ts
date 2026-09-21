import { buildChoiceQuestions, matchForm, type AskChoices, type ChoiceAnswer } from "../src/shared/matcher.js";
import type { MatchRequest } from "../src/shared/types.js";

const API_ROOT = "https://api.typesafe.ai/v1";
const API_KEY_STORAGE = "typesafeApiKey";
const MODEL = "jev-latest";

type KeyLocation = "session" | "local";

async function keyStatus(): Promise<{ configured: boolean; persistence: KeyLocation | null }> {
  const session = await chrome.storage.session.get(API_KEY_STORAGE);
  if (typeof session[API_KEY_STORAGE] === "string" && session[API_KEY_STORAGE]) {
    return { configured: true, persistence: "session" };
  }
  const local = await chrome.storage.local.get(API_KEY_STORAGE);
  const configured = typeof local[API_KEY_STORAGE] === "string" && Boolean(local[API_KEY_STORAGE]);
  return { configured, persistence: configured ? "local" : null };
}

async function getApiKey(): Promise<string | null> {
  const session = await chrome.storage.session.get(API_KEY_STORAGE);
  if (typeof session[API_KEY_STORAGE] === "string" && session[API_KEY_STORAGE]) return session[API_KEY_STORAGE];
  const local = await chrome.storage.local.get(API_KEY_STORAGE);
  return typeof local[API_KEY_STORAGE] === "string" && local[API_KEY_STORAGE] ? local[API_KEY_STORAGE] : null;
}

async function apiError(response: Response): Promise<Error> {
  if (response.status === 401 || response.status === 403) return new Error("TypeSafe rejected this API key.");
  if (response.status === 429) return new Error("TypeSafe is rate-limiting requests. Try again in a moment.");
  let detail = "";
  try {
    const body = await response.json() as { error?: string; message?: string; detail?: string };
    detail = body.error ?? body.message ?? body.detail ?? "";
  } catch {
    detail = "";
  }
  return new Error(detail || `TypeSafe request failed (${response.status}).`);
}

async function typeSafeFetch(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (response.ok) return response;
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2) throw await apiError(response);
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 400 * (2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("TypeSafe request failed.");
}

async function validateAndStoreKey(apiKey: string, remember: boolean): Promise<void> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) throw new Error("Paste a TypeSafe API key first.");
  await typeSafeFetch("/models", cleanKey);
  const destination = remember ? chrome.storage.local : chrome.storage.session;
  const other = remember ? chrome.storage.session : chrome.storage.local;
  await destination.set({ [API_KEY_STORAGE]: cleanKey });
  await other.remove(API_KEY_STORAGE);
}

function makeTypeSafeAsker(apiKey: string): AskChoices {
  return async (profileText, fields, candidates) => {
    const response = await typeSafeFetch("/systemone", apiKey, {
      method: "POST",
      body: JSON.stringify({
        state: { profile: profileText },
        questions: buildChoiceQuestions(fields, candidates),
        model: MODEL,
      }),
    });
    const body = await response.json() as { answers?: Record<string, ChoiceAnswer> };
    if (!body.answers || typeof body.answers !== "object") throw new Error("TypeSafe returned an unreadable answer.");
    return body.answers;
  };
}

async function runMatch(request: MatchRequest) {
  if (!request.profileText.trim()) throw new Error("Add your resume or profile source first.");
  if (!Array.isArray(request.fields) || request.fields.length > 120) throw new Error("This page has too many form fields.");
  const apiKey = await getApiKey();
  return matchForm(request.profileText, request.fields, {
    model: MODEL,
    askChoices: apiKey ? makeTypeSafeAsker(apiKey) : undefined,
  });
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== "object") return false;
  const input = message as { type?: string; apiKey?: string; remember?: boolean; request?: MatchRequest };
  void (async () => {
    try {
      if (input.type === "JEV_FILL_KEY_STATUS") return sendResponse({ ok: true, ...(await keyStatus()) });
      if (input.type === "JEV_FILL_VALIDATE_KEY") {
        await validateAndStoreKey(input.apiKey ?? "", input.remember !== false);
        return sendResponse({ ok: true, ...(await keyStatus()) });
      }
      if (input.type === "JEV_FILL_REMOVE_KEY") {
        await Promise.all([chrome.storage.local.remove(API_KEY_STORAGE), chrome.storage.session.remove(API_KEY_STORAGE)]);
        return sendResponse({ ok: true, configured: false, persistence: null });
      }
      if (input.type === "JEV_FILL_MATCH" && input.request) {
        return sendResponse({ ok: true, result: await runMatch(input.request) });
      }
      return sendResponse({ ok: false, error: "Unknown Jev Fill request." });
    } catch (error) {
      return sendResponse({ ok: false, error: error instanceof Error ? error.message : "Jev Fill request failed." });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
