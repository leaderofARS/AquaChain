import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || '*', credentials: true }));
// Serve static assets from /public
app.use(express.static(path.join(__dirname, '../../public')));

// View engine setup (EJS views folder at ../../views)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../views'));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'backend', ts: Date.now() });
});

// Basic views: login and dashboard
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => {
  const { error } = req.query;
  res.render('login', { error: error || null });
});
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.redirect('/login?error=' + encodeURIComponent('Username and password required'));
  }
  // In milestone 3, replace with real auth/session
  return res.redirect('/dashboard?username=' + encodeURIComponent(username));
});
app.get('/dashboard', (req, res) => {
  const username = req.query.username || 'User';
  res.render('dashboard', { username });
});

app.post('/api/sensor', (req, res) => {
  io.emit('telemetry', req.body || {});
  res.status(200).json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_ORIGIN?.split(',') || '*', credentials: true },
  path: process.env.SOCKET_PATH || '/socket.io'
});

const port = process.env.PORT || 3000;
const host = '0.0.0.0';
server.listen(port, host, () => {
  console.log(`Backend listening on ${host}:${port}`);
});

// Entry point for backend
console.log('Backend server starting...');