import axios, { type AxiosInstance } from 'axios';
import { config } from '../config';
import type { GLPIUser, GLPITicket, GLPIKBArticle } from '../types';

// ─── Gerenciamento de sessão GLPI ─────────────────────────────────────────────

let sessionToken: string | null = null;
let sessionExpiresAt = 0;

const SESSION_TTL_MS = 50 * 60 * 1000; // 50 minutos (GLPI expira em 60)

const http: AxiosInstance = axios.create({
  baseURL: `${config.glpi.url}/apirest.php`,
  headers: {
    'App-Token': config.glpi.appToken,
    'Content-Type': 'application/json',
  },
  timeout: 15_000,
});

async function initSession(): Promise<string> {
  const { data } = await http.get<{ session_token: string }>('/initSession', {
    headers: { Authorization: `user_token ${config.glpi.userToken}` },
  });
  sessionToken = data.session_token;
  sessionExpiresAt = Date.now() + SESSION_TTL_MS;
  return sessionToken;
}

async function getSessionToken(): Promise<string> {
  if (!sessionToken || Date.now() > sessionExpiresAt) {
    await initSession();
  }
  return sessionToken!;
}

async function authHeaders(): Promise<Record<string, string>> {
  return { 'Session-Token': await getSessionToken() };
}

// ─── Usuários ─────────────────────────────────────────────────────────────────

export async function findUserByEmail(email: string): Promise<GLPIUser | null> {
  const headers = await authHeaders();

  // /search retorna chaves numéricas: 1=id, 2=name(login), 9=firstname, 34=realname
  const { data } = await http.get<{ data: Array<Record<string, unknown>>; count: number }>('/search/User', {
    headers,
    params: {
      'criteria[0][field]': 5,
      'criteria[0][searchtype]': 'contains',
      'criteria[0][value]': email,
      range: '0-1',
      'forcedisplay[0]': 1,  // id
      'forcedisplay[1]': 2,  // name (login)
      'forcedisplay[2]': 9,  // firstname
      'forcedisplay[3]': 34, // realname
    },
  });

  if (!data?.data || data.data.length === 0) return null;
  const row = data.data[0];
  // field "2" = ID no retorno do /search/User
  const userId = row[2] as number;
  return getUserById(userId);
}

export async function getUserById(id: number): Promise<GLPIUser | null> {
  const headers = await authHeaders();
  const { data } = await http.get<GLPIUser>(`/User/${id}`, { headers });
  return data ?? null;
}

// ─── Chamados ─────────────────────────────────────────────────────────────────

export interface CreateTicketInput {
  title: string;
  description: string;
  glpiUserId?: number;
  requesterName?: string;
  requesterEmail?: string;
  isOnboarding?: boolean;
}

export async function createTicket(input: CreateTicketInput): Promise<GLPITicket> {
  const headers = await authHeaders();

  const ticketInput: Record<string, unknown> = {
    name: input.title,
    content: input.description,
    type: 2,   // 2 = Requisição
    status: 1, // 1 = Novo
    urgency: 3,
    impact: 3,
    priority: 3,
  };

  if (input.glpiUserId) {
    ticketInput['_users_id_requester'] = input.glpiUserId;
  }

  if (input.isOnboarding) {
    if (config.glpi.onboardingCategoryId > 0) {
      ticketInput['itilcategories_id'] = config.glpi.onboardingCategoryId;
    }
    ticketInput['name'] = `[ONBOARDING] ${input.title}`;
  } else if (config.glpi.defaultCategoryId > 0) {
    ticketInput['itilcategories_id'] = config.glpi.defaultCategoryId;
  }

  // Para usuários anônimos, injeta nome/email no conteúdo
  if (input.requesterName || input.requesterEmail) {
    ticketInput['content'] = [
      `**Solicitante:** ${input.requesterName ?? 'Não informado'}`,
      `**E-mail:** ${input.requesterEmail ?? 'Não informado'}`,
      '',
      input.description,
    ].join('\n');
  }

  const { data } = await http.post<{ id: number; message: string }>('/Ticket', {
    input: ticketInput,
  }, { headers });

  return { id: data.id, ...ticketInput } as unknown as GLPITicket;
}

export async function getTicketsByUser(glpiUserId: number, limit = 100): Promise<GLPITicket[]> {
  const headers = await authHeaders();

  const { data } = await http.get('/search/Ticket', {
    headers,
    params: {
      'criteria[0][field]': 4,
      'criteria[0][searchtype]': 'equals',
      'criteria[0][value]': glpiUserId,
      'forcedisplay[0]': 1,  // name/title
      'forcedisplay[1]': 2,  // id
      'forcedisplay[2]': 12, // status
      'forcedisplay[3]': 19, // date_creation
      'order': 'DESC',
      'sort': 19,
      'range': `0-${limit - 1}`,
    },
  });

  interface SearchResponse { data?: Array<Record<string, unknown>> }
  const result = data as SearchResponse;
  if (!result.data) return [];

  return result.data.map((row) => ({
    id: row[2] as number,
    name: row[1] as string,
    status: row[12] as number,
    content: '',
    date_creation: row[19] as string,
    date_mod: row[19] as string,
  }));
}

export async function getTicketById(ticketId: number): Promise<GLPITicket | null> {
  const headers = await authHeaders();
  const { data } = await http.get<GLPITicket>(`/Ticket/${ticketId}`, { headers });
  return data ?? null;
}

// ─── Base de conhecimento ─────────────────────────────────────────────────────

export async function searchKnowledgeBase(keywords: string): Promise<GLPIKBArticle[]> {
  const headers = await authHeaders();

  const { data } = await http.get('/search/KnowledgebaseItem', {
    headers,
    params: {
      'criteria[0][field]': 1,   // name
      'criteria[0][searchtype]': 'contains',
      'criteria[0][value]': keywords,
      'criteria[1][link]': 'OR',
      'criteria[1][field]': 6,   // answer/content
      'criteria[1][searchtype]': 'contains',
      'criteria[1][value]': keywords,
      'forcedisplay[0]': 1,  // id
      'forcedisplay[1]': 2,  // name
      'forcedisplay[2]': 6,  // answer
      'range': '0-9',
    },
  });

  interface KBResponse { data?: Array<Record<string, unknown>>; totalcount?: number }
  const result = data as KBResponse;
  if (!result.data) return [];

  return result.data.map((row) => ({
    id: row[1] as number,
    name: row[2] as string,
    answer: (row[6] ?? '') as string,
    is_faq: 0,
    view: 0,
  }));
}

// ─── CSAT ─────────────────────────────────────────────────────────────────────

export async function saveCsatScore(ticketId: number, score: number, scale: number): Promise<void> {
  const headers = await authHeaders();

  await http.post('/ITILFollowup', {
    input: {
      itemtype: 'Ticket',
      items_id: ticketId,
      content: `⭐ Avaliação CSAT: ${score}/${scale}\nColetado via WhatsApp Bot`,
      is_private: 1,
      requesttypes_id: 1,
    },
  }, { headers });
}

// ─── URL de um ticket ─────────────────────────────────────────────────────────

export function ticketUrl(ticketId: number): string {
  return `${config.glpi.url}/front/ticket.form.php?id=${ticketId}`;
}
