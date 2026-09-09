import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { handleConnection } from './src/chat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const DEFAULT_PASSWORD = 'ElMatadero';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAuth() {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      const initial = { password: DEFAULT_PASSWORD };
      fs.writeFileSync(AUTH_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    const data = fs.readFileSync(AUTH_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed?.password ? parsed : { password: DEFAULT_PASSWORD };
  } catch (err) {
    console.error('Error reading auth file:', err);
    return { password: DEFAULT_PASSWORD };
  }
}

function writeAuth(data) {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing auth file:', err);
    return false;
  }
}

const activeTokens = new Set();

function generateToken() {
  const token = crypto.randomBytes(24).toString('hex');
  activeTokens.add(token);
  return token;
}

// Initial default shows if file does not exist
const DEFAULT_SCHEDULE = [
  {
    id: 'pociones-musicales',
    name: '🎵 Pociones Musicales',
    days: 'LUN - VIE',
    time: '20:00',
    desc: 'Los mejores hits y descubrimientos del mundo mágico',
    host: 'DJ Wizard',
  },
  {
    id: 'confesiones-nocturnas',
    name: '🎙️ Confesiones Nocturnas',
    days: 'MAR - JUE',
    time: '22:00',
    desc: 'Historias anónimas, secretos y relatos de los oyentes',
    host: 'Anfitrión Anónimo',
  },
  {
    id: 'audiolibros-magicos',
    name: '📚 Audiolibros Mágicos',
    days: 'SÁB',
    time: '18:00',
    desc: 'Lectura en vivo de capítulos y literatura fantástica',
    host: 'El Narrador',
  },
  {
    id: 'podcast-wizardly',
    name: '🎧 Podcast Wizardly',
    days: 'DOM',
    time: '16:00',
    desc: 'Debates, teorías y charlas sobre el universo mágico',
    host: 'WizardFM Team',
  },
];

function readSchedule() {
  try {
    if (!fs.existsSync(SCHEDULE_FILE)) {
      fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(DEFAULT_SCHEDULE, null, 2));
      return DEFAULT_SCHEDULE;
    }
    const data = fs.readFileSync(SCHEDULE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : DEFAULT_SCHEDULE;
  } catch (err) {
    console.error('Error reading schedule file:', err);
    return DEFAULT_SCHEDULE;
  }
}

function writeSchedule(data) {
  try {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing schedule file:', err);
    return false;
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Configure CORS for Socket.io
const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// --- Schedule CRUD Endpoints ---
app.get('/api/schedule', (req, res) => {
  const schedule = readSchedule();
  res.json(schedule);
});

app.post('/api/schedule', (req, res) => {
  const { name, days, time, desc, host } = req.body;
  if (!name || !days || !time) {
    return res.status(400).json({ error: 'Nombre, días y hora son obligatorios' });
  }

  const schedule = readSchedule();
  const newEvent = {
    id: 'show-' + Date.now(),
    name: name.trim(),
    days: days.trim(),
    time: time.trim(),
    desc: (desc || '').trim(),
    host: (host || 'WizardFM').trim(),
  };

  schedule.push(newEvent);
  writeSchedule(schedule);
  res.status(201).json(newEvent);
});

app.put('/api/schedule/:id', (req, res) => {
  const { id } = req.params;
  const { name, days, time, desc, host } = req.body;

  const schedule = readSchedule();
  const index = schedule.findIndex((item) => String(item.id) === String(id));

  if (index === -1) {
    return res.status(404).json({ error: 'Evento no encontrado' });
  }

  schedule[index] = {
    ...schedule[index],
    name: name !== undefined ? name.trim() : schedule[index].name,
    days: days !== undefined ? days.trim() : schedule[index].days,
    time: time !== undefined ? time.trim() : schedule[index].time,
    desc: desc !== undefined ? desc.trim() : schedule[index].desc,
    host: host !== undefined ? host.trim() : schedule[index].host,
  };

  writeSchedule(schedule);
  res.json(schedule[index]);
});

app.delete('/api/schedule/:id', (req, res) => {
  const { id } = req.params;
  let schedule = readSchedule();
  const initialLength = schedule.length;
  schedule = schedule.filter((item) => String(item.id) !== String(id));

  if (schedule.length === initialLength) {
    return res.status(404).json({ error: 'Evento no encontrado' });
  }

  writeSchedule(schedule);
  res.json({ message: 'Evento eliminado correctamente', id });
});

// --- DJ Panel Authentication Endpoints ---
app.post('/api/dj/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'La contraseña es requerida' });
  }

  const auth = readAuth();
  if (password === auth.password) {
    const token = generateToken();
    return res.json({ success: true, token, message: 'Acceso concedido a la cabina' });
  }

  return res.status(401).json({ error: 'Contraseña mágica incorrecta' });
});

app.post('/api/dj/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7)
    : (req.body && req.body.token);

  if (token && activeTokens.has(token)) {
    return res.json({ valid: true });
  }

  return res.status(401).json({ valid: false, error: 'Sesión no válida o expirada' });
});

app.post('/api/dj/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'La contraseña actual y la nueva son obligatorias' });
  }

  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
  }

  const auth = readAuth();
  if (currentPassword !== auth.password) {
    return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
  }

  const updated = writeAuth({ password: newPassword.trim() });
  if (!updated) {
    return res.status(500).json({ error: 'No se pudo guardar la nueva contraseña' });
  }

  // Clear existing tokens and create fresh one
  activeTokens.clear();
  const token = generateToken();

  return res.json({
    success: true,
    message: 'Contraseña actualizada exitosamente',
    token,
  });
});

// Handle Socket.io connections
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  handleConnection(io, socket);
});

const PORT = process.env.PORT || process.env.WS_PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🧙‍♂️ WizardFM Chat & Schedule service listening on port ${PORT}`);
});
