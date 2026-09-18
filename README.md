# Aisamad

A professional, secure, Hindi-friendly AI assistant with a modern chat UI, multi-session support, rendering, export/import, TTS, and deployment-ready configuration.

## Roadmap / phases

### Phase 1: Professional chat foundation
- Modern responsive chat interface
- Multi-session chat history
- Mode switching: General / Study / Code / Support
- Auto language behavior
- Copy and speak actions
- Export/import conversations
- Stable server-side prompt handling
- Rate limiting and health endpoint

### Phase 2: Advanced AI workflows
- Image understanding support
- PDF/document analysis support
- User context and memory improvements
- Better code execution / coding workflow
- Search-grounded answers

### Phase 3: Product features
- User authentication
- Database-backed chat storage
- Usage limits and billing control
- Admin dashboard
- Secure deployment and monitoring

### Phase 4: Trusted product identity
- Premium brand experience
- Privacy policy and compliance
- Better safety layers and moderation
- Performance optimization and multilingual UX
- Scalable provider abstraction for Gemini/OpenAI/Anthropic-style models

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Then open `http://localhost:3000`.

## Security

Never commit `.env`, API keys, passwords, OTPs, or private user data. Keep secrets only in local `.env` files or your hosting provider's private environment variables. Use usage caps, deployment limits, and a clear privacy policy before launching publicly.
