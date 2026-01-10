import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const pref = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
};

const port = Number(getArg("port", process.env.EXPORTS_PORT ?? "8080"));
const rootDir = path.join(process.cwd(), "exports");

const contentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") return "text/csv; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
};

const safeResolve = (urlPath) => {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(rootDir, rel);
  if (!resolved.startsWith(path.resolve(rootDir))) return null;
  return resolved;
};

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    if (req.url === "/" || req.url.startsWith("/?")) {
      const files = await fs.readdir(rootDir).catch(() => []);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><body><h3>exports/</h3><ul>` +
          files.map((f) => `<li><a href="/${encodeURIComponent(f)}">${f}</a></li>`).join("") +
          `</ul></body></html>`
      );
      return;
    }

    const target = safeResolve(req.url);
    if (!target) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const stat = await fs.stat(target).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const data = await fs.readFile(target);
    res.writeHead(200, { "content-type": contentType(target) });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

server.listen(port, () => {
  console.log(`✅ Serving ${rootDir} at http://localhost:${port}`);
  console.log("Open http://localhost:" + port + "/ to list files.");
});
