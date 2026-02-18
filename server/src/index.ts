import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const app = express();
const PORT = Number(process.env.PORT || 5175);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = process.env.FLOW_STORAGE_DIR || path.join(__dirname, "..", "data", "flows");

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

const ensureStorage = async () => {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
};

const flowPath = (id: string) => path.join(STORAGE_DIR, `${id}.json`);

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const getToken = (authHeader: string) => (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "");
const getUpdater = (token: string, body: any) => {
  if (token) return sha256(token).slice(0, 16);
  const email = body?.contact?.email;
  return email ? `email:${email}` : "anonymous";
};

const readFlow = async (id: string) => {
  const file = await fs.readFile(flowPath(id), "utf-8");
  return JSON.parse(file);
};

const writeFlow = async (id: string, payload: unknown) => {
  await ensureStorage();
  await fs.writeFile(flowPath(id), JSON.stringify(payload, null, 2), "utf-8");
};

app.get("/api/flows/:id", async (req, res) => {
  try {
    const flow = await readFlow(req.params.id);
    res.json(flow);
  } catch (error) {
    res.status(404).json({ error: "Flow not found" });
  }
});

app.post("/api/flows", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = getToken(authHeader);
  if (!token) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const payload = {
    ...req.body,
    id,
    createdAt: now,
    updatedAt: now,
    owner: sha256(token).slice(0, 16),
    lastUpdatedBy: getUpdater(token, req.body),
  };

  await writeFlow(id, payload);
  res.json({ id });
});

app.put("/api/flows/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const existing = await readFlow(id);
    const now = new Date().toISOString();
    const authHeader = req.headers.authorization || "";
    const token = getToken(authHeader);
    const payload = {
      ...existing,
      ...req.body,
      id,
      updatedAt: now,
      lastUpdatedBy: getUpdater(token, req.body),
    };
    await writeFlow(id, payload);
    res.json({ id });
  } catch (error) {
    res.status(404).json({ error: "Flow not found" });
  }
});

app.delete("/api/flows/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await fs.unlink(flowPath(id));
    res.json({ ok: true });
  } catch (error) {
    res.status(404).json({ error: "Flow not found" });
  }
});

// ─── Localhost-only admin ───────────────────────────────────────────────────

const localhostOnly = (req: Request, res: Response, next: NextFunction) => {
  const addr = req.socket.remoteAddress || "";
  if (addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1") {
    return next();
  }
  res.status(403).send("Forbidden");
};

app.get("/api/admin/flows", localhostOnly, async (_req, res) => {
  try {
    await ensureStorage();
    const files = await fs.readdir(STORAGE_DIR);
    const rows = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const id = f.replace(/\.json$/, "");
          try {
            const raw = await fs.readFile(path.join(STORAGE_DIR, f), "utf-8");
            const d = JSON.parse(raw);
            const nodeCount =
              (d?.graph?.nodes ?? d?.nodes ?? []).length;
            return {
              id,
              createdAt: d.createdAt ?? null,
              email: d?.contact?.email ?? "",
              phone: d?.contact?.phone ?? "",
              nodeCount,
            };
          } catch {
            return { id, createdAt: null, email: "", phone: "", nodeCount: 0 };
          }
        })
    );
    // newest first
    rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to list flows" });
  }
});

app.delete("/api/admin/flows/:id", localhostOnly, async (req, res) => {
  const id = req.params.id;
  try {
    await fs.unlink(flowPath(id));
    res.json({ ok: true });
  } catch (error) {
    res.status(404).json({ error: "Flow not found" });
  }
});

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Flow Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 1.25rem; color: #f8fafc; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  thead th {
    text-align: left; padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #334155; color: #94a3b8; font-weight: 600;
    white-space: nowrap;
  }
  tbody tr { border-bottom: 1px solid #1e293b; }
  tbody tr:hover { background: #1e293b; }
  tbody td { padding: 0.5rem 0.75rem; vertical-align: middle; }
  .btn {
    display: inline-block; padding: 0.3rem 0.75rem; border-radius: 0.375rem;
    font-size: 0.8rem; font-weight: 500; cursor: pointer; border: none;
    text-decoration: none; line-height: 1.5;
  }
  .btn-open { background: #3b82f6; color: #fff; }
  .btn-open:hover { background: #2563eb; }
  .btn-del { background: #ef4444; color: #fff; }
  .btn-del:hover { background: #dc2626; }
  .empty { color: #64748b; font-style: italic; padding: 1rem 0; }
  #status { margin-top: 1rem; font-size: 0.85rem; color: #94a3b8; }
</style>
</head>
<body>
<h1>Flow Admin</h1>
<table id="tbl">
  <thead>
    <tr>
      <th>Created (Budapest)</th>
      <th>Nodes</th>
      <th>Email</th>
      <th>Phone</th>
      <th></th>
      <th></th>
    </tr>
  </thead>
  <tbody id="tbody"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody>
</table>
<div id="status"></div>
<script>
  const BASE = window.location.origin;

  function toLocalTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('hu-HU', {
      timeZone: 'Europe/Budapest',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  async function load() {
    const res = await fetch(BASE + '/api/admin/flows');
    const rows = await res.json();
    const tbody = document.getElementById('tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No flows yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => \`
      <tr data-id="\${r.id}">
        <td>\${toLocalTime(r.createdAt)}</td>
        <td>\${r.nodeCount}</td>
        <td>\${r.email || '—'}</td>
        <td>\${r.phone || '—'}</td>
        <td><a class="btn btn-open" href="/s/\${r.id}" target="_blank">Open</a></td>
        <td><button class="btn btn-del" onclick="del('\${r.id}')">Delete</button></td>
      </tr>
    \`).join('');
  }

  async function del(id) {
    if (!confirm('Delete this flow?')) return;
    const res = await fetch(BASE + '/api/admin/flows/' + id, { method: 'DELETE' });
    if (res.ok) {
      document.querySelector('[data-id="' + id + '"]').remove();
      document.getElementById('status').textContent = 'Deleted ' + id;
    } else {
      alert('Delete failed');
    }
  }

  load();
</script>
</body>
</html>`;

app.get("/admin", localhostOnly, (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(ADMIN_HTML);
});

app.listen(PORT, () => {
  console.log(`Flow backend listening on ${PORT}`);
});
