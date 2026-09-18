const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('./db');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const apiKey = process.env.GEMINI_API_KEY;
const jwtSecret = process.env.JWT_SECRET || 'development-only-change-me';
const maxHistory = 18;
const uploadDir = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 } });

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Thoda ruk kar phir try karo.' } }));

function tokenFor(user) { return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' }); }
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  try {
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Login required.' });
    req.user = jwt.verify(header.slice(7), jwtSecret);
    next();
  } catch { return res.status(401).json({ error: 'Session expired. Login again.' }); }
}
function loadTrainingExamples() {
  const file = path.join(__dirname, 'train.example.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(x => x.trim()).filter(Boolean).flatMap(x => { try { return [JSON.parse(x)]; } catch { return []; } });
}
function trainingContext() {
  return loadTrainingExamples().map(item => (item.messages || []).map(m => `${m.role}: ${m.content}`).join('\n')).filter(Boolean).join('\n\n');
}
function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(x => x && typeof x.text === 'string').slice(-maxHistory).map(x => ({ role: x.role === 'user' ? 'user' : 'model', parts: [{ text: x.text.slice(0, 10000) }] }));
}
function systemPrompt(mode = 'general', language = 'auto') {
  const roles = { general: 'helpful, honest Hindi-friendly AI assistant', study: 'patient study coach that explains step by step', code: 'professional coding assistant', support: 'calm and practical support mentor' };
  const examples = trainingContext();
  return `You are Aisamad, a ${roles[mode] || roles.general}. Preferred language: ${language}. Never claim to be human. Ask clarifying questions when needed.${examples ? `\nStyle examples only:\n${examples}` : ''}`;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Aisamad', model: defaultModel }));
app.post('/api/auth/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Valid email aur minimum 8-character password required.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    const user = { id: result.lastInsertRowid, email };
    res.status(201).json({ user, token: tokenFor(user) });
  } catch (error) { res.status(error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500).json({ error: error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Email already registered.' : 'Registration failed.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password incorrect.' });
  const safeUser = { id: user.id, email: user.email };
  res.json({ user: safeUser, token: tokenFor(safeUser) });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: { id: req.user.sub, email: req.user.email } }));
app.get('/api/conversations', auth, (req, res) => {
  const rows = db.prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.sub);
  res.json({ conversations: rows });
});
app.post('/api/conversations', auth, (req, res) => {
  const title = String(req.body?.title || 'New chat').slice(0, 100);
  const result = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.sub, title);
  res.status(201).json({ id: result.lastInsertRowid, title });
});
app.get('/api/conversations/:id', auth, (req, res) => {
  const row = db.prepare('SELECT id, title, messages_json, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.sub);
  if (!row) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ ...row, messages: JSON.parse(row.messages_json) });
});
app.put('/api/conversations/:id', auth, (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [];
  const title = String(req.body?.title || 'New chat').slice(0, 100);
  const result = db.prepare("UPDATE conversations SET title = ?, messages_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(title, JSON.stringify(messages), req.params.id, req.user.sub);
  if (!result.changes) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ ok: true });
});
app.delete('/api/conversations/:id', auth, (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.sub);
  res.json({ ok: true });
});
app.post('/api/files', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required.' });
  res.status(201).json({ id: req.file.filename, name: req.file.originalname, type: req.file.mimetype, size: req.file.size, note: 'Upload stored. Document understanding pipeline can be connected next.' });
});

app.post('/api/chat', async (req, res) => {
  if (!apiKey) return res.status(500).json({ error: 'Server configuration incomplete. GEMINI_API_KEY add karo.' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 10000) return res.status(413).json({ error: 'Message bahut lamba hai.' });
  const modelName = String(req.body?.model || defaultModel);
  const contents = [{ role: 'user', parts: [{ text: systemPrompt(String(req.body?.mode || 'general'), String(req.body?.language || 'auto')) }] }, ...normalizeHistory(req.body?.history), { role: 'user', parts: [{ text: message }] }];
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey }, body: JSON.stringify({ contents }) });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: 'Gemini request failed. Model ya API settings check karo.' });
    res.json({ reply: data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || 'Mujhe jawab nahi mila.', model: modelName });
  } catch (error) { console.error(error.message); res.status(502).json({ error: 'Gemini se connection nahi ho saka.' }); }
});

app.listen(port, () => console.log(`Aisamad is running at http://localhost:${port}`));
