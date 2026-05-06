import Redis from 'ioredis';
import { config } from '../config';
import type { Session, BotState, UserData } from '../types';

export const redis = new Redis(config.redis.url, { lazyConnect: true });

redis.on('error', (err) => console.error('[Redis] erro:', err.message));

export async function connect(): Promise<void> {
  await redis.connect();
  console.log('[Redis] conectado');
}

function sessionKey(phone: string): string {
  return `bot:session:${phone}`;
}

export async function getSession(phone: string): Promise<Session | null> {
  const raw = await redis.get(sessionKey(phone));
  if (!raw) return null;
  return JSON.parse(raw) as Session;
}

export async function saveSession(phone: string, session: Session): Promise<void> {
  session.lastActivityAt = Date.now();
  await redis.setex(
    sessionKey(phone),
    config.redis.sessionTtlSeconds,
    JSON.stringify(session),
  );
}

export async function deleteSession(phone: string): Promise<void> {
  await redis.del(sessionKey(phone));
}

export function createSession(phone: string): Session {
  return {
    state: 'WAITING_EMAIL',
    user: {
      phone,
      name: '',
      email: '',
      isAnonymous: false,
    },
    ticketDraft: {},
    lastActivityAt: Date.now(),
  };
}

export async function updateState(phone: string, state: BotState): Promise<Session> {
  const session = (await getSession(phone)) ?? createSession(phone);
  session.state = state;
  await saveSession(phone, session);
  return session;
}

// Retorna true se a mensagem é nova (primeira vez), false se duplicada
export async function markMessageProcessed(messageId: string): Promise<boolean> {
  const result = await redis.set(`dedup:${messageId}`, '1', 'EX', 60, 'NX');
  return result === 'OK';
}

// Mapeia conversationId do ChatWoot → phone para resolver handoff na resolução
export async function saveConversationPhone(conversationId: number, phone: string): Promise<void> {
  await redis.setex(`conv:${conversationId}`, 60 * 60 * 24, phone); // TTL 24h
}

export async function getPhoneByConversation(conversationId: number): Promise<string | null> {
  return redis.get(`conv:${conversationId}`);
}

export async function updateUser(phone: string, updates: Partial<UserData>): Promise<Session> {
  const session = (await getSession(phone)) ?? createSession(phone);
  session.user = { ...session.user, ...updates };
  await saveSession(phone, session);
  return session;
}
