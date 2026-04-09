// ...existing code...
// Utility helpers for normalizing and building clickable URLs used by service cards
export const formatDisplayUrl = (raw?: string | null) => {
  if (!raw) return "N/A";
  return String(raw)
    .replace(/^(?:https?:|wss?:)\/\//, "")
    .replace(/\/$/, "");
};

// Build an href from a raw value. If preferHttps is true and no scheme exists, use https://
export const buildHref = (raw?: string | null, preferHttps = false): string | null => {
  if (!raw) return null;
  const r = String(raw);
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(r);
  if (hasScheme) return r;
  return preferHttps ? `https://${r}` : `http://${r}`;
};

export const formatPingDisplay = (ping?: boolean | null): string => {
  if (ping === true) return "ICMP: Responding";
  if (ping === false) return "ICMP: No response";
  return "ICMP: N/A";
};

export const openHref = (href?: string | null) => {
  if (!href) return;
  try {
    window.open(href, "_blank");
  } catch (e) {
    // ignore in non-browser tests
  }
};
// ...existing code...
