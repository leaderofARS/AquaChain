import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const port = Number(process.env.PORT) || 3000;

// PostgreSQL config (prefer env vars or DATABASE_URL)
const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl:
        (process.env.PGSSL && process.env.PGSSL.toLowerCase() === "true") ||
        process.env.PGSSLMODE === "require"
          ? { rejectUnauthorized: false }
          : false,
    }
  : {
      user: process.env.PGUSER || process.env.POSTGRES_USER || "postgres",
      host: process.env.PGHOST || "localhost",
      database: process.env.PGDATABASE || "smart_irrigation",
      password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
      port: Number(process.env.PGPORT) || 5432,
    };

const db = new pg.Client(dbConfig);

// Log DB target (without secrets)
if (process.env.DATABASE_URL) {
  console.log("Using DATABASE_URL for PostgreSQL connection");
} else {
  console.log(
    `PostgreSQL target -> user=${dbConfig.user}, host=${dbConfig.host}, port=${dbConfig.port}, database=${dbConfig.database}`
  );
}

db.connect()
  .then(async () => {
    console.log("✅ Connected to PostgreSQL");
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL
        );
      `);
      console.log("✅ Ensured users table exists");
    } catch (schemaErr) {
      console.error("⚠ Could not ensure users table:", schemaErr.message || schemaErr);
    }
  })
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
      return res.send("⚠ Username already exists. Please login.");
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