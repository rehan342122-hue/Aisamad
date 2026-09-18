const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const apiKey = process.env.GEMINI_API_KEY;
const maxHistory = 18;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Thoda ruk kar phir try karo.' }
}));

function loadTrainingExamples() {
  const file = path.join(__dirname, 'train.example.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function trainingContext() {
  return loadTrainingExamples().map(item => {
    const messages = (item.messages || []).map(m => `${m.role}: ${m.content}`).join('\n');
    return messages ? `Example conversation:\n${messages}` : '';
  }).filter(Boolean).join('\n\n');
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(item => item && typeof item.text === 'string')
    .slice(-maxHistory)
    .map(item => ({ role: item.role === 'user' ? 'user' : 'model', parts: [{ text: item.text.slice(0, 10000) }] }));
}

function getLanguageLabel(language) {
  switch ((language || 'auto').toLowerCase()) {
    case 'hi': return 'Hindi';
    case 'en': return 'English';
    default: return 'Auto';
  }
}

function buildSystemPrompt({ mode = 'general', language = 'auto' }) {
  const languageLabel = getLanguageLabel(language);
  const roleMap = {
    general: 'You are Aisamad, a helpful, honest, Hindi-friendly AI assistant.',
    study: 'You are Aisamad, a patient study coach. Explain clearly, step by step, and encourage learning.',
    code: 'You are Aisamad, a coding assistant. Help with JavaScript, Node.js, HTML, CSS, APIs, debugging, and clean code.',
    support: 'You are Aisamad, a calm mentor and support assistant. Be empathetic, practical, and concise.'
  };

  const context = trainingContext();
  const base = `${roleMap[mode] || roleMap.general}\nPreferred reply language: ${languageLabel}. Reply in the user language when possible. Never claim to be a human. Ask clarifying questions when needed.\n${context ? `Use these examples as style guidance only, not as facts:\n${context}` : ''}`;
  return base;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Aisamad', model: defaultModel }));

app.post('/api/chat', async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration incomplete. GEMINI_API_KEY add karo.' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 10000) return res.status(413).json({ error: 'Message bahut lamba hai.' });

  const mode = String(req.body?.mode || 'general');
  const language = String(req.body?.language || 'auto');
  const history = normalizeHistory(req.body?.history || []);
  const modelName = String(req.body?.model || defaultModel);

  const systemPrompt = buildSystemPrompt({ mode, language });
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    ...history,
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error:', data.error?.message || data);
      return res.status(response.status).json({ error: 'Gemini request failed. Model ya API settings check karo.' });
    }

    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || 'Mujhe jawab nahi mila.';
    return res.json({ reply: text, model: modelName, language });
  } catch (error) {
    console.error('Request error:', error && error.message ? error.message : error);
    return res.status(502).json({ error: 'Gemini se connection nahi ho saka.' });
  }
});

app.listen(port, () => console.log(`Aisamad is running at http://localhost:${port}`));
