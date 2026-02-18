import cors from "cors";
import express from "express";
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

app.listen(PORT, () => {
  console.log(`Flow backend listening on ${PORT}`);
});
