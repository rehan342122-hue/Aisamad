const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maxHistory = 18;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Thoda ruk kar phir try karo.' }
}));

function trainingContext() {
  const file = path.join(__dirname, 'train.example.jsonl');
  if (!fs.existsSync(file)) return '';

  const examples = fs.readFileSync(file, 'utf8').split('\n').map(line => line.trim()).filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });

  return examples.map(item => {
    const messages = (item.messages || []).map(m => `${m.role}: ${m.content}`).join('\n');
    return messages ? `Example conversation:\n${messages}` : '';
  }).filter(Boolean).join('\n\n');
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(item => item && typeof item.text === 'string').slice(-maxHistory).map(item => ({
    role: item.role === 'user' ? 'user' : 'model',
    parts: [{ text: item.text.slice(0, 10000) }]
  }));
}

function buildSystemPrompt(mode = 'general', language = 'auto') {
  const roles = {
    general: 'You are Aisamad, a helpful, honest, Hindi-friendly AI assistant.',
    study: 'You are Aisamad, a patient study coach. Explain clearly, step by step, and encourage learning.',
    code: 'You are Aisamad, a professional coding assistant. Help with JavaScript, Node.js, HTML, CSS, APIs, debugging, and clean code.',
    support: 'You are Aisamad, a calm mentor and support assistant. Be empathetic, practical, and concise.'
  };

  const context = trainingContext();
  const languageLabel = language === 'hi' ? 'Hindi' : language === 'en' ? 'English' : 'Auto';
  return `${roles[mode] || roles.general}\nPreferred reply language: ${languageLabel}. Reply in the user language when possible. Never claim to be a human. Ask clarifying questions when needed.${context ? `\nUse these examples as style guidance only, not as facts:\n${context}` : ''}`;
}

function requireSupabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.' });
  }
  next();
}

async function requireAuth(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured.' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required.' });

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Session expired or invalid.' });
    req.user = { id: user.id, email: user.email };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Aisamad', model: defaultModel, supabaseReady: !!supabase, geminiReady: !!geminiApiKey });
});

app.post('/api/auth/register', requireSupabase, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return res.status(400).json({ error: 'Valid email and minimum 8-character password required.' });
  }

  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message || 'Registration failed.' });
    return res.status(201).json({ user: data.user, session: data.session });
  } catch (error) {
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/login', requireSupabase, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message || 'Login failed.' });
    return res.json({ user: data.user, session: data.session });
  } catch (error) {
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/auth/me', requireSupabase, requireAuth, (req, res) => {
  return res.json({ user: { id: req.user.id, email: req.user.email } });
});

app.get('/api/conversations', requireSupabase, requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('conversations').select('*').eq('user_id', req.user.id).order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message || 'Could not fetch conversations.' });
  return res.json({ conversations: data || [] });
});

app.post('/api/conversations', requireSupabase, requireAuth, async (req, res) => {
  const title = String(req.body?.title || 'New chat').slice(0, 100);
  const { data, error } = await supabase.from('conversations').insert({ user_id: req.user.id, title, messages: [] }).select().single();
  if (error) return res.status(500).json({ error: error.message || 'Could not create conversation.' });
  return res.status(201).json({ conversation: data });
});

app.get('/api/conversations/:id', requireSupabase, requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('conversations').select('*').eq('user_id', req.user.id).eq('id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Conversation not found.' });
  return res.json({ conversation: data });
});

app.put('/api/conversations/:id', requireSupabase, requireAuth, async (req, res) => {
  const title = String(req.body?.title || 'New chat').slice(0, 100);
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const { error } = await supabase.from('conversations').update({ title, messages, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message || 'Could not update conversation.' });
  return res.json({ ok: true });
});

app.delete('/api/conversations/:id', requireSupabase, requireAuth, async (req, res) => {
  const { error } = await supabase.from('conversations').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message || 'Could not delete conversation.' });
  return res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  if (!geminiApiKey) {
    return res.status(500).json({ error: 'Server configuration incomplete. Add GEMINI_API_KEY to .env.' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 10000) return res.status(413).json({ error: 'Message bahut lamba hai.' });

  const mode = String(req.body?.mode || 'general');
  const language = String(req.body?.language || 'auto');
  const modelName = String(req.body?.model || defaultModel);
  const contents = [
    { role: 'user', parts: [{ text: buildSystemPrompt(mode, language) }] },
    ...normalizeHistory(req.body?.history || []),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': geminiApiKey },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: 'Gemini request failed. Check model and API key.' });

    const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || 'Mujhe jawab nahi mila.';
    return res.json({ reply, model: modelName, language });
  } catch (error) {
    return res.status(502).json({ error: 'Gemini se connection nahi ho saka.' });
  }
});

app.listen(port, () => console.log(`Aisamad Supabase-ready server running at http://localhost:${port}`));
