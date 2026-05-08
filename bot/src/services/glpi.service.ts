import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
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

  // /search retorna chaves numéricas: 1=id, 2=name(login), 5=email, 9=firstname, 34=realname
  const { data } = await http.get<{ data: Array<Record<string, unknown>>; count: number }>('/search/User', {
    headers,
    params: {
      'criteria[0][field]': 5,
      'criteria[0][searchtype]': 'contains',
      'criteria[0][value]': email,
      range: '0-9',
      'forcedisplay[0]': 1,  // id
      'forcedisplay[1]': 2,  // name (login)
      'forcedisplay[2]': 5,  // email
      'forcedisplay[3]': 9,  // firstname
      'forcedisplay[4]': 34, // realname
    },
  });

  if (!data?.data || data.data.length === 0) return null;

  // Validação exata: descarta resultados onde o e-mail do GLPI não bate exatamente
  const typedEmail = email.toLowerCase();
  const exactRow = data.data.find(
    (row) => (row[5] as string)?.toLowerCase() === typedEmail,
  );
  if (!exactRow) return null;

  const userId = exactRow[2] as number;
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

  console.log('[GLPI] criando ticket — input:', JSON.stringify(ticketInput));

  const { data } = await http.post<{ id: number; message: string }>('/Ticket', {
    input: ticketInput,
  }, { headers });

  console.log('[GLPI] resposta:', JSON.stringify(data));

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

  // Campo 1=Assunto, 2=ID, 7=Conteúdo, 8=is_faq (conforme listSearchOptions/KnowbaseItem)
  const words = keywords.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const params: Record<string, unknown> = {
    'forcedisplay[0]': 2, // id
    'forcedisplay[1]': 1, // name/assunto
    'forcedisplay[2]': 7, // answer/conteúdo
    'forcedisplay[3]': 8, // is_faq
    // Range maior para compensar o post-filter de is_faq
    'range': '0-29',
  };

  // Busca por palavra individual com OR entre assunto e conteúdo
  let idx = 0;
  for (const word of words) {
    if (idx > 0) params[`criteria[${idx}][link]`] = 'OR';
    params[`criteria[${idx}][field]`] = 1;
    params[`criteria[${idx}][searchtype]`] = 'contains';
    params[`criteria[${idx}][value]`] = word;
    idx++;

    params[`criteria[${idx}][link]`] = 'OR';
    params[`criteria[${idx}][field]`] = 7;
    params[`criteria[${idx}][searchtype]`] = 'contains';
    params[`criteria[${idx}][value]`] = word;
    idx++;
  }

  console.log('[KB] params:', JSON.stringify(params));
  const { data } = await http.get('/search/KnowbaseItem', { headers, params });
  console.log('[KB] resposta:', JSON.stringify(data));

  interface KBResponse { data?: Array<Record<string, unknown>>; totalcount?: number }
  const result = data as KBResponse;
  if (!result.data) return [];

  // Post-filter: exibe apenas artigos marcados como FAQ (is_faq = 1, campo 30)
  // Artigos internos de técnicos (is_faq = 0) ficam invisíveis para os usuários
  return result.data
    .filter((row) => {
      const isFaq = row[8];
      // Se o campo não vier na resposta (versão GLPI diferente), inclui por segurança
      if (isFaq === undefined) return true;
      return isFaq == 1;
    })
    .map((row) => ({
      id: row[2] as number,
      name: row[1] as string,
      answer: (row[7] ?? '') as string,
      is_faq: 1,
      view: 0,
    }));
}

// ─── URL de um ticket ─────────────────────────────────────────────────────────

export async function createKBArticle(title: string, content: string): Promise<number | null> {
  const headers = await authHeaders();
  const { data } = await http.post<{ id: number }>('/KnowbaseItem', {
    input: {
      name: title,
      answer: content,
      is_faq: 0,
      entities_id: 0,
    },
  }, { headers });
  return data?.id ?? null;
}

// ─── Documentos / Imagens na KB ──────────────────────────────────────────────

export async function attachImageToKBArticle(
  articleId: number,
  imageBase64: string,
  mimetype: string,
  filename: string,
): Promise<void> {
  const headers = await authHeaders();

  const buffer = Buffer.from(imageBase64, 'base64');
  const form = new FormData();

  // GLPI REST espera um manifest JSON + o arquivo com chave "filename[0]"
  form.append('uploadManifest', JSON.stringify({
    input: {
      name: filename,
      _filename: [filename],
    },
  }));
  form.append('filename[0]', buffer, { filename, contentType: mimetype });

  const { data } = await http.post<{ id?: number; message?: string }>('/Document', form, {
    headers: { ...headers, ...form.getHeaders() },
  });

  if (!data?.id) {
    console.warn('[GLPI] upload de imagem não retornou ID — resposta:', JSON.stringify(data));
    return;
  }

  // Vincula o documento ao artigo da KB
  await http.post('/Document_Item', {
    input: {
      documents_id: data.id,
      itemtype: 'KnowbaseItem',
      items_id: articleId,
    },
  }, { headers });

  console.log('[GLPI] imagem', filename, 'vinculada ao artigo KB', articleId, '— doc ID:', data.id);
}

export function ticketUrl(ticketId: number): string {
  return `${config.glpi.url}/front/ticket.form.php?id=${ticketId}`;
}

export function kbArticleUrl(articleId: number): string {
  return `${config.glpi.url}/front/knowbaseitem.form.php?id=${articleId}`;
}
