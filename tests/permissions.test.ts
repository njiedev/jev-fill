import { describe, expect, it } from "vitest";

import { siteAccessPattern } from "../src/shared/permissions.js";

describe("siteAccessPattern", () => {
  it("limits access to the current web origin", () => {
    expect(siteAccessPattern("https://jobs.example.com/apply/123")).toBe("https://jobs.example.com/*");
    expect(siteAccessPattern("http://localhost:3000/form")).toBe("http://localhost:3000/*");
  });

  it("rejects browser and extension pages", () => {
    expect(siteAccessPattern("chrome://extensions")).toBeNull();
    expect(siteAccessPattern("chrome-extension://abc/sidepanel.html")).toBeNull();
  });
});
