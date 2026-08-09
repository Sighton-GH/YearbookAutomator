import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { createProductionServer } from "../production-server.js";

let backend;
let backendPort;
let distDirectory;
let frontend;
let frontendPort;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function request(requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: frontendPort,
      method: options.method || "GET",
      path: requestPath,
      headers: {
        Host: options.host || "yearbooktool.sighton.ca",
        ...(options.headers || {})
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
        status: response.statusCode
      }));
    });
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

before(async () => {
  distDirectory = await mkdtemp(path.join(os.tmpdir(), "ymga-production-server-"));
  await mkdir(path.join(distDirectory, "assets"));
  await writeFile(path.join(distDirectory, "index.html"), "<!doctype html><title>YMGA</title>");
  await writeFile(path.join(distDirectory, "assets", "app-12345678.js"), "console.log('ok');");

  backend = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        body: Buffer.concat(chunks).toString("utf8"),
        host: req.headers.host,
        method: req.method,
        url: req.url
      }));
    });
  });
  backendPort = await listen(backend);
  frontend = await createProductionServer({ backendPort, distDirectory });
  frontendPort = await listen(frontend);
});

after(async () => {
  await close(frontend);
  await close(backend);
  await rm(distDirectory, { recursive: true, force: true });
});

test("serves the SPA with production security headers", async () => {
  const response = await request("/review/session-1");
  assert.equal(response.status, 200);
  assert.match(response.body, /<title>YMGA<\/title>/);
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
});

test("rejects unapproved host headers", async () => {
  const response = await request("/", { host: "attacker.example" });
  assert.equal(response.status, 421);
});

test("serves immutable fingerprinted assets", async () => {
  const response = await request("/assets/app-12345678.js");
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "text/javascript; charset=utf-8");
  assert.match(response.headers["cache-control"], /immutable/);
});

test("does not expose files outside dist", async () => {
  const response = await request("/%2e%2e/package.json");
  assert.notEqual(response.body.includes("yearbook-mugshot-automator"), true);
});

test("streams API requests to the loopback backend", async () => {
  const response = await request("/api/example?value=1", {
    body: "payload",
    headers: { "Content-Type": "text/plain" },
    method: "POST"
  });
  assert.equal(response.status, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.body, "payload");
  assert.equal(payload.host, `127.0.0.1:${backendPort}`);
  assert.equal(payload.method, "POST");
  assert.equal(payload.url, "/api/example?value=1");
});
