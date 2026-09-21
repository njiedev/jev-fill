import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { matchForm } from "./matcher.js";
import type { MatchRequest } from "../src/shared/types.js";

const port = Number(process.env.JEV_FILL_PORT ?? 8788);
const MAX_BODY_BYTES = 1_000_000;

function extensionOrigin(origin: string | undefined): string | null {
  return origin?.startsWith("chrome-extension://") ? origin : null;
}

function send(response: ServerResponse, status: number, body: unknown, origin?: string): void {
  const allowedOrigin = extensionOrigin(origin);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isMatchRequest(value: unknown): value is MatchRequest {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<MatchRequest>;
  return typeof input.profileText === "string" && Array.isArray(input.fields);
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (request.method === "OPTIONS") {
    return extensionOrigin(origin)
      ? send(response, 204, null, origin)
      : send(response, 403, { error: "Only the Jev Fill extension may call this server." });
  }
  if (request.method === "GET" && request.url === "/health") {
    return send(response, 200, {
      ok: true,
      jevConfigured: Boolean(process.env.TYPESAFE_API_KEY),
      model: process.env.TYPESAFE_MODEL ?? "jev-1.13",
    }, origin);
  }
  if (request.method === "POST" && request.url === "/match") {
    if (!extensionOrigin(origin)) {
      return send(response, 403, { error: "Only the Jev Fill extension may call this server." });
    }
    try {
      const body = await readJson(request);
      if (!isMatchRequest(body)) return send(response, 400, { error: "Invalid match request." }, origin);
      if (!body.profileText.trim()) return send(response, 400, { error: "Paste profile text first." }, origin);
      if (body.fields.length > 120) return send(response, 400, { error: "Too many form fields." }, origin);
      return send(response, 200, await matchForm(body.profileText, body.fields), origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error.";
      return send(response, 500, { error: message }, origin);
    }
  }
  return send(response, 404, { error: "Not found." }, origin);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Jev Fill server listening on http://127.0.0.1:${port}`);
  console.log(process.env.TYPESAFE_API_KEY ? "Jev matching enabled." : "Exact-match mode only; TYPESAFE_API_KEY is not set.");
});
