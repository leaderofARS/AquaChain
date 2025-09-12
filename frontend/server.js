const express = require("express");
const bodyParser = require("body-parser");
const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", "../views");

// JSON Array (3 Users)
const users = [
  { username: "prakul", password: "1234" },
  { username: "abhay", password: "5678" },
  { username: "devapriya", password: "abcd" }
  { username : "rohan", password :"xyz"}
];

// GET Login Page
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// POST Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  console.log("Received:", username, password); // Debug line

 const user = users.find(
  (u) => u.username === username.trim() && u.password === password.trim()
);

  if (user) {
    res.render("dashboard", { username: user.username });
  } else {
    res.render("login", { error: "Invalid username or password ❌" });
  }
});


app.listen(3000, () => {
  console.log("Server running on http://localhost:3000/login");
});


/**
 * Test Users (Login Credentials):
 * 
 * Username: prakul   | Password: 1234
 * Username: abhay    | Password: 5678
 * Username: devapriya| Password: abcd
 * 
 * Use any one of these to log in successfully ✅
 */
