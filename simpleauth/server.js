import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";

const app = express();
const port = 3000;

// PostgreSQL config
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "smart_irrigation",
  password: "PRAKULPSHETTY", // change this
  port: 5432,
});

db.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ DB connection error:", err));

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public")); // serve all static files from public folder

/* ---------- ROUTES ---------- */

// Home → redirect to signup
app.get("/", (req, res) => {
  res.redirect("/signup");
});

// Signup Page
app.get("/signup", (req, res) => {
  res.render("signup");
});

// Handle Signup
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const checkUser = await db.query("SELECT * FROM users WHERE username=$1", [
      username,
    ]);
    if (checkUser.rows.length > 0) {
      return res.send("⚠️ Username already exists. Please login.");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hashedPassword]
    );
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.send("❌ Error while signing up.");
  }
});

// Login Page
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// Handle Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE username=$1", [
      username,
    ]);
    if (result.rows.length === 0) {
      return res.render("login", { error: "User not found. Please signup." });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      res.render("dashboard", { username: user.username });
    } else {
      res.render("login", { error: "Incorrect password." });
    }
  } catch (err) {
    console.error(err);
    res.send("❌ Error while logging in.");
  }
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
