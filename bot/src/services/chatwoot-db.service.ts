import { Pool } from 'pg';
import { config } from '../config';

// Escala Chatwoot: 1=Awful 2=Bad 3=Neutral 4=Good 5=Excellent
function toChatwootRating(score: number): number {
  if (score <= 2) return 1;
  if (score <= 4) return 2;
  if (score <= 6) return 3;
  if (score <= 8) return 4;
  return 5;
}

let pool: Pool | null = null;

function getPool(): Pool | null {
  const host = process.env.CHATWOOT_DB_HOST;
  const user = process.env.CHATWOOT_DB_USER;
  const password = process.env.CHATWOOT_DB_PASSWORD;
  const database = process.env.CHATWOOT_DB_NAME;

  if (!host || !user || !password || !database) return null;

  if (!pool) {
    pool = new Pool({
      host, user, password, database,
      max: 2,
      connectionTimeoutMillis: 4_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on('error', (err) => {
      console.error('[ChatwootDB] pool error:', err.message);
      pool = null;
    });
  }
  return pool;
}

export async function submitCsatToReport(params: {
  conversationId: number;
  messageId: number;
  contactId: number;
  score: number;
}): Promise<void> {
  const db = getPool();
  if (!db) {
    console.warn('[CSAT] variáveis CHATWOOT_DB_* não configuradas — pulando relatório');
    return;
  }

  const { conversationId, messageId, contactId, score } = params;
  const rating = toChatwootRating(score);
  const feedback = `Nota WhatsApp: ${score}/10`;

  // message_id tem constraint UNIQUE — ignora se já existe
  await db.query(
    `INSERT INTO csat_survey_responses
       (account_id, conversation_id, message_id, rating, feedback_message, contact_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (message_id) DO NOTHING`,
    [config.chatwoot.accountId, conversationId, messageId, rating, feedback, contactId],
  );

  console.log(`[CSAT] nota ${score}/10 (rating=${rating}) registrada no relatório Chatwoot (conv ${conversationId})`);
}
