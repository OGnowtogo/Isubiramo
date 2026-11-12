require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const PUBLIC_DIR = path.join(ROOT, "public");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12 || process.env.ADMIN_PASSWORD.startsWith("CHANGE-THIS")) {
  console.error("Set ADMIN_PASSWORD in your .env file (at least 12 characters) before starting.");
  process.exit(1);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.startsWith("CHANGE-THIS")) {
  console.error("Set SESSION_SECRET in your .env file (at least 32 characters) before starting.");
  process.exit(1);
}

const db = new Database(path.join(DATA_DIR, "isubiramo.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('books','papers','videos')),
  class_level TEXT NOT NULL CHECK(class_level IN ('S1','S2','S3','S4','S5','S6')),
  title TEXT NOT NULL,
  subject TEXT DEFAULT '',
  description TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  stored_name TEXT DEFAULT '',
  original_name TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
`);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      frameSrc: ["'self'", "https://www.youtube-nocookie.com", "https://player.vimeo.com"],
      connectSrc: ["'self'"],
      objectSrc: ["'self'"],
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "1mb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR, concurrentDB: true }),
  name: "isubiramo.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many sign-in attempts. Please wait 15 minutes and try again." } });
const requireAdmin = (req, res, next) => req.session && req.session.isAdmin
  ? next()
  : res.status(401).json({ error: "Administrator sign-in required." });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`)
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" && path.extname(file.originalname).toLowerCase() === ".pdf";
    cb(isPdf ? null : new Error("Only PDF files are accepted for books and past papers."), isPdf);
  }
});

function validVideoUrl(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return ["youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"].includes(host)
      && (u.protocol === "https:" || u.protocol === "http:");
  } catch { return false; }
}
function resourceForClient(row) {
  const isVideo = row.type === "videos";
  return {
    id: row.id, type: row.type, cls: row.class_level, title: row.title,
    subject: row.subject, description: row.description,
    url: isVideo ? row.video_url : `/api/files/${row.id}/preview`,
    downloadUrl: isVideo ? row.video_url : `/api/files/${row.id}/download`,
    originalName: row.original_name || "",
    createdAt: row.created_at
  };
}
function getResource(id) {
  return db.prepare("SELECT * FROM resources WHERE id = ?").get(id);
}

app.post("/api/auth/login", loginLimiter, (req, res) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const expected = Buffer.from(process.env.ADMIN_PASSWORD);
  const supplied = Buffer.from(password);
  const matches = expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
  if (!matches) return res.status(401).json({ error: "Incorrect administrator password." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not create administrator session." });
    req.session.isAdmin = true;
    res.json({ authenticated: true });
  });
});
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("isubiramo.sid", { httpOnly: true, sameSite: "strict" });
    res.json({ authenticated: false });
  });
});
app.get("/api/auth/me", (req, res) => res.json({ authenticated: Boolean(req.session && req.session.isAdmin) }));

app.get("/api/resources", (_req, res) => {
  const rows = db.prepare("SELECT * FROM resources ORDER BY created_at DESC").all();
  res.json(rows.map(resourceForClient));
});
app.post("/api/resources", requireAdmin, (req, res, next) => {
  upload.single("file")(req, res, err => {
    if (err) return next(err);
    try {
      const { type, classLevel, title, subject = "", description = "", url = "" } = req.body;
      if (!["books", "papers", "videos"].includes(type)) throw new Error("Choose a valid resource type.");
      if (!["S1", "S2", "S3", "S4", "S5", "S6"].includes(classLevel)) throw new Error("Choose a valid class.");
      if (typeof title !== "string" || !title.trim() || title.trim().length > 100) throw new Error("Enter a title of up to 100 characters.");
      if (type === "videos" && !validVideoUrl(url)) throw new Error("Use a valid YouTube or Vimeo URL for video lessons.");
      if (type !== "videos" && !req.file) throw new Error("Choose a PDF file to upload.");
      if (req.file) {
        const fd = fs.openSync(req.file.path, "r");
        const header = Buffer.alloc(5);
        fs.readSync(fd, header, 0, 5, 0);
        fs.closeSync(fd);
        if (header.toString("ascii") !== "%PDF-") {
          fs.unlinkSync(req.file.path);
          throw new Error("The selected file is not a valid PDF document.");
        }
      }
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare(`INSERT INTO resources
        (id,type,class_level,title,subject,description,video_url,stored_name,original_name,mime_type,created_at)
        VALUES (@id,@type,@class_level,@title,@subject,@description,@video_url,@stored_name,@original_name,@mime_type,@created_at)`)
        .run({
          id, type, class_level: classLevel, title: title.trim(),
          subject: String(subject).slice(0, 60), description: String(description).slice(0, 240),
          video_url: type === "videos" ? url : "",
          stored_name: req.file ? req.file.filename : "",
          original_name: req.file ? path.basename(req.file.originalname) : "",
          mime_type: req.file ? "application/pdf" : "", created_at: createdAt
        });
      res.status(201).json({ success: true, id });
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(error);
    }
  });
});
app.get("/api/files/:id/preview", (req, res) => {
  const row = getResource(req.params.id);
  if (!row || !row.stored_name) return res.status(404).send("PDF not found.");
  const file = path.join(UPLOAD_DIR, path.basename(row.stored_name));
  if (!fs.existsSync(file)) return res.status(404).send("PDF file is missing.");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="preview.pdf"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(file);
});
app.get("/api/files/:id/download", (req, res) => {
  const row = getResource(req.params.id);
  if (!row || !row.stored_name) return res.status(404).send("PDF not found.");
  const file = path.join(UPLOAD_DIR, path.basename(row.stored_name));
  if (!fs.existsSync(file)) return res.status(404).send("PDF file is missing.");
  res.download(file, row.original_name || "study-resource.pdf");
});
app.delete("/api/resources/:id", requireAdmin, (req, res) => {
  const row = getResource(req.params.id);
  if (!row) return res.status(404).json({ error: "Resource not found." });
  db.prepare("DELETE FROM resources WHERE id = ?").run(req.params.id);
  if (row.stored_name) {
    const file = path.join(UPLOAD_DIR, path.basename(row.stored_name));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  res.json({ success: true });
});
app.delete("/api/resources", requireAdmin, (_req, res) => {
  const files = db.prepare("SELECT stored_name FROM resources WHERE stored_name <> ''").all();
  db.prepare("DELETE FROM resources").run();
  files.forEach(row => {
    const file = path.join(UPLOAD_DIR, path.basename(row.stored_name));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  res.json({ success: true });
});

app.use(express.static(PUBLIC_DIR));
app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  res.status(status).json({ error: err.message || "The request could not be completed." });
});

app.listen(PORT, () => console.log(`ISUBIRAMO server running at http://localhost:${PORT}`));
