// Minimal static server that roots at standalone/, so the built app is reachable at
// http://localhost:4002/dist/ — i.e. served from a SUBPATH, exactly like a portal CDN.
// This is the real test that base:'./' + assetUrl() + the CSS url rewrite all resolve.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4002;
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(fp, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("404 " + p);
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(fp)] || "application/octet-stream",
      });
      res.end(data);
    });
  })
  .listen(PORT, () =>
    console.log(`subpath test server: http://localhost:${PORT}/dist/`)
  );
