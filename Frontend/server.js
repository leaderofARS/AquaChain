const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();

// Serve static files and EJS views from top-level AquaChain/views and AquaChain/public
app.use(express.static(path.join(__dirname, "../public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Health endpoint for external checks
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "frontend", ts: Date.now() });
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));

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
  console.log(`Frontend running on http://localhost:${PORT}/login`);
});
