import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "upgrade-insecure-requests"
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
});

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function normalizedHostname(hostHeader) {
  const value = String(hostHeader || "").trim().toLowerCase();
  if (!value || /[\s/@]/.test(value)) {
    return "";
  }
  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    return closingBracket > 1 ? value.slice(1, closingBracket) : "";
  }
  return value.split(":", 1)[0];
}

function filteredHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()) && value !== undefined) {
      result[name] = value;
    }
  }
  return result;
}

function sendText(response, statusCode, text, extraHeaders = {}) {
  const body = Buffer.from(text, "utf8");
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Length": body.length,
    "Content-Type": "text/plain; charset=utf-8",
    ...extraHeaders
  });
  response.end(body);
}

function isApiRequest(requestUrl) {
  return requestUrl === "/api" || requestUrl.startsWith("/api/") || requestUrl.startsWith("/api?");
}

function proxyToBackend(request, response, backendHost, backendPort) {
  const requestHeaders = filteredHeaders(request.headers);
  requestHeaders.host = `${backendHost}:${backendPort}`;

  const proxyRequest = http.request({
    hostname: backendHost,
    port: backendPort,
    method: request.method,
    path: request.url,
    headers: requestHeaders
  }, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode || 502, {
      ...filteredHeaders(proxyResponse.headers),
      ...SECURITY_HEADERS
    });
    proxyResponse.pipe(response);
  });

  proxyRequest.setTimeout(15 * 60 * 1000, () => {
    proxyRequest.destroy(new Error("Backend request timed out"));
  });
  proxyRequest.on("error", () => {
    if (!response.headersSent) {
      sendText(response, 502, "Backend service unavailable\n");
    } else {
      response.destroy();
    }
  });
  request.on("aborted", () => proxyRequest.destroy());
  request.pipe(proxyRequest);
}

async function safeStaticFile(distDirectory, requestedPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    return { error: 400 };
  }
  if (decodedPath.includes("\0")) {
    return { error: 400 };
  }

  const relativePath = decodedPath.replace(/^\/+/, "") || "index.html";
  const candidate = path.resolve(distDirectory, relativePath);
  if (candidate !== distDirectory && !candidate.startsWith(`${distDirectory}${path.sep}`)) {
    return { error: 403 };
  }

  try {
    const candidateRealPath = await realpath(candidate);
    if (candidateRealPath !== distDirectory && !candidateRealPath.startsWith(`${distDirectory}${path.sep}`)) {
      return { error: 403 };
    }
    const candidateStat = await stat(candidateRealPath);
    if (candidateStat.isFile()) {
      return { filePath: candidateRealPath, fileStat: candidateStat };
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
      return { error: 500 };
    }
  }

  if (path.extname(relativePath)) {
    return { error: 404 };
  }

  try {
    const indexPath = await realpath(path.join(distDirectory, "index.html"));
    if (indexPath !== distDirectory && !indexPath.startsWith(`${distDirectory}${path.sep}`)) {
      return { error: 403 };
    }
    const indexStat = await stat(indexPath);
    return { filePath: indexPath, fileStat: indexStat };
  } catch {
    return { error: 500 };
  }
}

async function serveStatic(request, response, distDirectory) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed\n", { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    sendText(response, 400, "Bad request\n");
    return;
  }

  const selected = await safeStaticFile(distDirectory, pathname);
  if (!selected.filePath) {
    const messages = {
      400: "Bad request\n",
      403: "Forbidden\n",
      404: "Not found\n",
      500: "Static site unavailable\n"
    };
    sendText(response, selected.error || 500, messages[selected.error] || messages[500]);
    return;
  }

  const extension = path.extname(selected.filePath).toLowerCase();
  const immutableAsset = /[/\\]assets[/\\].*-[a-z0-9_-]{8,}\.[a-z0-9]+$/i.test(selected.filePath);
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "Cache-Control": immutableAsset ? "public, max-age=31536000, immutable" : "no-cache",
    "Content-Length": selected.fileStat.size,
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Last-Modified": selected.fileStat.mtime.toUTCString()
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(selected.filePath);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

export async function createProductionServer(options = {}) {
  const distDirectory = await realpath(options.distDirectory || path.join(moduleDirectory, "dist"));
  const backendHost = options.backendHost || "127.0.0.1";
  const backendPort = Number(options.backendPort || 8000);
  const allowedHosts = new Set(options.allowedHosts || [
    "127.0.0.1",
    "localhost",
    "yearbooktool.sighton.ca"
  ]);

  const server = http.createServer((request, response) => {
    if (!allowedHosts.has(normalizedHostname(request.headers.host))) {
      sendText(response, 421, "Unrecognized host\n");
      return;
    }
    const requestUrl = request.url || "/";
    if (isApiRequest(requestUrl)) {
      proxyToBackend(request, response, backendHost, backendPort);
      return;
    }
    serveStatic(request, response, distDirectory).catch(() => {
      if (!response.headersSent) {
        sendText(response, 500, "Static site unavailable\n");
      } else {
        response.destroy();
      }
    });
  });

  server.headersTimeout = 15_000;
  server.requestTimeout = 15 * 60 * 1000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 1000;
  return server;
}

async function start() {
  const listenHost = process.env.YMGA_FRONTEND_HOST || "127.0.0.1";
  const listenPort = Number(process.env.YMGA_FRONTEND_PORT || 5173);
  const backendHost = process.env.YMGA_BACKEND_HOST || "127.0.0.1";
  const backendPort = Number(process.env.YMGA_BACKEND_PORT || 8000);
  const allowedHosts = (process.env.YMGA_FRONTEND_ALLOWED_HOSTS || "127.0.0.1,localhost,yearbooktool.sighton.ca")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const server = await createProductionServer({ backendHost, backendPort, allowedHosts });
  server.listen(listenPort, listenHost, () => {
    console.log(`Production frontend listening on http://${listenHost}:${listenPort}`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  start().catch((error) => {
    console.error(`Could not start production frontend: ${error?.message || "unknown error"}`);
    process.exit(1);
  });
}
