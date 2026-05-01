import { createServer } from "node:http";
import { mkdir, readFile, writeFile, appendFile, unlink } from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.DEBUG_LOG_SINK_PORT || 4010);
const rootDir = process.cwd();
const logDir = path.join(rootDir, "logs");
const logFile = path.join(logDir, "trainer-debug.jsonl");

async function ensureLogDir() {
  await mkdir(logDir, { recursive: true });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function main() {
  await ensureLogDir();

  const server = createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { ok: false, error: "Missing URL" });
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, file: logFile });
      return;
    }

    if (req.method === "GET" && req.url === "/log") {
      try {
        const body = await readFile(logFile, "utf8");
        sendJson(res, 200, { ok: true, file: logFile, body });
      } catch {
        sendJson(res, 200, { ok: true, file: logFile, body: "" });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/clear") {
      try {
        await unlink(logFile);
      } catch {
        // Ignore missing files.
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/log") {
      try {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== "object") {
          sendJson(res, 400, { ok: false, error: "Invalid payload" });
          return;
        }

        await appendFile(logFile, `${JSON.stringify(parsed)}\n`, "utf8");
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to store debug event",
        });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Debug log sink listening on http://127.0.0.1:${port}`);
    console.log(`Writing debug events to ${logFile}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
