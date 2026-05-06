import express from 'express';
import { config } from './config';
import { connect as connectRedis } from './session/redis';
import { handleEvolutionWebhook } from './webhooks/evolution.webhook';
import { handleChatwootWebhook } from './webhooks/chatwoot.webhook';

const app = express();

app.use(express.json({ limit: '10mb' }));

// ─── Webhooks ──────────────────────────────────────────────────────────────────
app.post('/webhook/evolution', handleEvolutionWebhook);
app.post('/webhook/chatwoot', handleChatwootWebhook);

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── Inicialização ─────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  await connectRedis();

  app.listen(config.port, () => {
    console.log(`[Bot] servidor iniciado na porta ${config.port}`);
    console.log(`[Bot] ambiente: ${config.nodeEnv}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Bot] falha ao iniciar:', err);
  process.exit(1);
});
