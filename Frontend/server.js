const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();

// Resolve base dir for shared views/public regardless of container path
const candidateBases = [
  path.resolve(__dirname, ".."),
  path.resolve(__dirname)
];
const baseDir = candidateBases.find((d) => {
  try { return require("fs").statSync(path.join(d, "views")).isDirectory(); } catch { return false; }
}) || candidateBases[0];

// Serve static and views
app.use(express.static(path.join(baseDir, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(baseDir, "views"));

// Backend base for API redirects (optional)
const BACKEND_BASE = process.env.BACKEND_BASE || "http://localhost:5000";

// Health endpoint for external checks
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "frontend", ts: Date.now(), baseDir });
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Redirect any /api/* calls to backend (keeps manual testing convenient)
app.all("/api/*", (req, res) => {
  const target = BACKEND_BASE + req.originalUrl;
  // Use 307 to preserve method & body
  return res.redirect(307, target);
});

// JSON Array (sample users)
const users = [
  { username: "prakul", password: "1234" },
  { username: "abhay", password: "5678" },
  { username: "devapriya", password: "abcd" },
  { username: "rohan", password: "xyz" },
];

app.get("/", (_req, res) => res.redirect("/login"));

// GET Login Page
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// POST Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username?.trim() && u.password === password?.trim());
  if (user) {
    res.render("dashboard", { username: user.username });
  } else {
    res.render("login", { error: "Invalid username or password ❌" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Frontend running on http://localhost:${PORT}/login (views from ${path.join(baseDir, 'views')})`);
});
