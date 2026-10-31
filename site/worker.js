const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'",
};

const LONG_CACHE = "public, max-age=604800";
const CANONICAL_HOST = "noenv.thisisamank.in";
const OLD_HOSTS = new Set(["nenv.thisisamank.in"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === "http:" || OLD_HOSTS.has(url.hostname)) {
      url.protocol = "https:";
      url.hostname = OLD_HOSTS.has(url.hostname) ? CANONICAL_HOST : url.hostname;
      return Response.redirect(url.toString(), 301);
    }

    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }

    const type = response.headers.get("Content-Type") ?? "";
    if (type.startsWith("text/html") && !type.includes("charset")) {
      response.headers.set("Content-Type", "text/html; charset=utf-8");
    }
    if (url.pathname.startsWith("/assets/") && response.ok) {
      response.headers.set("Cache-Control", LONG_CACHE);
    }
    return response;
  },
};
