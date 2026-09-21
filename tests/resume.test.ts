import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { normalizeResumeText, parseDocxBytes } from "../extension/resume.js";

describe("resume parsing", () => {
  it("extracts paragraphs and XML entities from DOCX files", () => {
    const documentXml = `<?xml version="1.0"?><w:document xmlns:w="test"><w:body><w:p><w:r><w:t>Mohammed &amp; Co.</w:t></w:r></w:p><w:p><w:r><w:t>Built Jev Fill</w:t></w:r></w:p></w:body></w:document>`;
    const docx = zipSync({ "word/document.xml": strToU8(documentXml) });
    expect(parseDocxBytes(docx)).toBe("Mohammed & Co.\nBuilt Jev Fill");
  });

  it("normalizes excess whitespace without flattening paragraphs", () => {
    expect(normalizeResumeText("Name  \r\n\n\n  Experience")).toBe("Name\n\nExperience");
  });
});
