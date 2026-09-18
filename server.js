const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { getFirebaseAdmin, getFirebaseConfig, requireFirebaseAuth } = require('./firebase-admin');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
const maxHistory = 18;
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Thoda ruk kar phir try karo.' } }));

function trainingContext() {
  const file = path.join(__dirname, 'train.example.jsonl');
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split('\n').map(x => x.trim()).filter(Boolean).flatMap(x => { try { return [JSON.parse(x)]; } catch { return []; } }).map(item => (item.messages || []).map(m => `${m.role}: ${m.content}`).join('\n')).filter(Boolean).join('\n\n');
}
function normalizeHistory(history) { return Array.isArray(history) ? history.filter(x => x && typeof x.text === 'string').slice(-maxHistory).map(x => ({ role: x.role === 'user' ? 'user' : 'model', parts: [{ text: x.text.slice(0, 10000) }] })) : []; }
function prompt(mode = 'general', language = 'auto') {
  const roles = { general: 'helpful, honest Hindi-friendly AI assistant', study: 'patient study coach', code: 'professional coding assistant', support: 'calm and practical support mentor' };
  const examples = trainingContext();
  return `You are Aisamad, a ${roles[mode] || roles.general}. Preferred language: ${language}. Never claim to be human. Ask clarifying questions when needed.${examples ? `\nStyle examples only:\n${examples}` : ''}`;
}
function db() { const firebase = getFirebaseAdmin(); return firebase ? firebase.firestore() : null; }

app.get('/api/config', (_req, res) => res.json({ firebase: getFirebaseConfig() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Aisamad', firebaseReady: !!getFirebaseAdmin(), geminiReady: !!geminiApiKey }));
app.get('/api/conversations', requireFirebaseAuth, async (req, res) => {
  try { const snap = await db().collection('conversations').where('userId', '==', req.user.uid).orderBy('updatedAt', 'desc').limit(50).get(); res.json({ conversations: snap.docs.map(x => ({ id: x.id, ...x.data() })) }); }
  catch (e) { res.status(500).json({ error: 'Could not load conversations.' }); }
});
app.post('/api/conversations', requireFirebaseAuth, async (req, res) => {
  try { const now = new Date().toISOString(); const ref = await db().collection('conversations').add({ userId: req.user.uid, title: String(req.body?.title || 'New chat').slice(0, 100), messages: [], createdAt: now, updatedAt: now }); res.status(201).json({ conversation: { id: ref.id, userId: req.user.uid, title: 'New chat', messages: [], createdAt: now, updatedAt: now } }); }
  catch (e) { res.status(500).json({ error: 'Could not create conversation.' }); }
});
app.get('/api/conversations/:id', requireFirebaseAuth, async (req, res) => { const snap = await db().collection('conversations').doc(req.params.id).get(); if (!snap.exists || snap.data().userId !== req.user.uid) return res.status(404).json({ error: 'Conversation not found.' }); res.json({ conversation: { id: snap.id, ...snap.data() } }); });
app.put('/api/conversations/:id', requireFirebaseAuth, async (req, res) => { const ref = db().collection('conversations').doc(req.params.id); const snap = await ref.get(); if (!snap.exists || snap.data().userId !== req.user.uid) return res.status(404).json({ error: 'Conversation not found.' }); await ref.update({ title: String(req.body?.title || 'New chat').slice(0, 100), messages: Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [], updatedAt: new Date().toISOString() }); res.json({ ok: true }); });
app.delete('/api/conversations/:id', requireFirebaseAuth, async (req, res) => { const ref = db().collection('conversations').doc(req.params.id); const snap = await ref.get(); if (snap.exists && snap.data().userId === req.user.uid) await ref.delete(); res.json({ ok: true }); });
app.post('/api/chat', async (req, res) => {
  if (!geminiApiKey) return res.status(500).json({ error: 'Add GEMINI_API_KEY to the server environment.' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 10000) return res.status(413).json({ error: 'Message bahut lamba hai.' });
  try {
    const model = String(req.body?.model || defaultModel);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': geminiApiKey }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt(String(req.body?.mode || 'general'), String(req.body?.language || 'auto')) }] }, ...normalizeHistory(req.body?.history), { role: 'user', parts: [{ text: message }] }] }) });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: 'Gemini request failed.' });
    res.json({ reply: data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || 'Mujhe jawab nahi mila.' });
  } catch { res.status(502).json({ error: 'Gemini se connection nahi ho saka.' }); }
});
app.listen(port, () => console.log(`Aisamad Firebase server running at http://localhost:${port}`));
