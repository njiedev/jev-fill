export function siteAccessPattern(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? `${parsed.origin}/*` : null;
  } catch {
    return null;
  }
}
