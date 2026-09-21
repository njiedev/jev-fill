import { strFromU8, unzipSync } from "fflate";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function normalizeResumeText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseDocxBytes(bytes: Uint8Array): string {
  const archive = unzipSync(bytes);
  const document = archive["word/document.xml"];
  if (!document) throw new Error("This DOCX file does not contain a readable document.");

  const xml = strFromU8(document);
  const paragraphs = Array.from(xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g), (paragraph) => {
    const tokens = paragraph[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g);
    return Array.from(tokens, (token) => token[0].startsWith("<w:tab") ? "\t" : token[0].startsWith("<w:br") ? "\n" : decodeXml(token[1])).join("");
  });
  return normalizeResumeText(paragraphs.join("\n"));
}

async function parsePdf(file: File): Promise<string> {
  GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.mjs");
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return normalizeResumeText(pages.join("\n\n"));
}

export async function parseResumeFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) throw new Error("Choose a resume smaller than 10 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text = "";
  if (extension === "pdf") text = await parsePdf(file);
  else if (extension === "docx") text = parseDocxBytes(new Uint8Array(await file.arrayBuffer()));
  else if (extension === "txt") text = normalizeResumeText(await file.text());
  else throw new Error("Choose a PDF, DOCX, or TXT resume.");
  if (!text) throw new Error("No readable text was found in this resume.");
  return text;
}
