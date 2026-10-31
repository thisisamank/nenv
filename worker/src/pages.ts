const STYLE = `
  :root { color-scheme: light dark; --bg: #fafaf9; --fg: #1c1917; --muted: #57534e; --panel: #f5f5f4; --accent: #ea580c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1917; --fg: #fafaf9; --muted: #a8a29e; --panel: #292524; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 48px 16px; }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  p { color: var(--muted); }
  pre { background: var(--panel); padding: 12px 16px; border-radius: 8px; overflow-x: auto; }
  input { font: inherit; font-family: ui-monospace, monospace; padding: 8px 12px; letter-spacing: 0.1em; text-transform: uppercase; }
  button { font: inherit; padding: 8px 16px; background: var(--accent); color: white; border: 0; border-radius: 6px; cursor: pointer; }
`;

const CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'";

export function htmlPage(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP,
    },
  });
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
