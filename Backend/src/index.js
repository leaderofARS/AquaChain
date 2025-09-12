import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || '*', credentials: true }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'backend', ts: Date.now() });
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