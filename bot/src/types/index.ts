// ─── Estados da conversa ──────────────────────────────────────────────────────

export type BotState =
  | 'WAITING_EMAIL'
  | 'WAITING_ANON_CONFIRM'
  | 'WAITING_ANON_NAME'
  | 'WAITING_ANON_PERSONAL_EMAIL'
  | 'MENU'
  | 'TICKET_TITLE'
  | 'TICKET_DESCRIPTION'
  | 'KB_RESULT'
  | 'TICKET_OPENING'
  | 'CONSULTING_TICKETS'
  | 'TICKET_DETAIL'
  | 'ONBOARDING_DESCRIPTION'
  | 'HUMAN_HANDOFF'
  | 'WAITING_CSAT';

// ─── Sessão do usuário (armazenada no Redis) ──────────────────────────────────

export interface UserData {
  phone: string;
  glpiUserId?: number;
  name: string;
  email: string;
  isAnonymous: boolean;
}

export interface TicketDraft {
  title?: string;
  description?: string;
  chatwootConversationId?: number;
  glpiTicketId?: number;
}

export interface Session {
  state: BotState;
  user: UserData;
  ticketDraft: TicketDraft;
  chatwootContactId?: number;
  csatConversationId?: number;
  lastActivityAt: number;
}

// ─── Evolution API ────────────────────────────────────────────────────────────

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      buttonsResponseMessage?: { selectedButtonId: string };
      listResponseMessage?: { singleSelectReply: { selectedRowId: string } };
      imageMessage?: { mimetype: string; caption?: string };
      videoMessage?: { mimetype: string; caption?: string };
      audioMessage?: { mimetype: string };
      documentMessage?: { mimetype: string; title?: string; fileName?: string; caption?: string };
      stickerMessage?: { mimetype: string };
      pttMessage?: { mimetype: string };
    };
    messageType?: string;
    messageTimestamp?: number;
  };
}

// ─── GLPI API ─────────────────────────────────────────────────────────────────

export interface GLPIUser {
  id: number;
  name: string;
  realname?: string;
  firstname?: string;
  email?: string;
}

export interface GLPITicket {
  id: number;
  name: string;
  content: string;
  status: number;
  date_creation: string;
  date_mod: string;
  users_id_lastupdater?: number;
}

export interface GLPIKBArticle {
  id: number;
  name: string;
  answer: string;
  is_faq: number;
  view: number;
}

export interface GLPITicketStatus {
  1: 'Novo';
  2: 'Em andamento (atribuído)';
  3: 'Em andamento (planejado)';
  4: 'Pendente';
  5: 'Resolvido';
  6: 'Fechado';
}

export const TICKET_STATUS_LABEL: Record<number, string> = {
  1: 'Novo',
  2: 'Em andamento',
  3: 'Em andamento',
  4: 'Pendente',
  5: 'Resolvido',
  6: 'Fechado',
};

// ─── ChatWoot API ─────────────────────────────────────────────────────────────

export interface ChatwootContact {
  id: number;
  name: string;
  phone_number?: string;
  email?: string;
}

export interface ChatwootConversation {
  id: number;
  inbox_id: number;
  contact_id: number;
  status: string;
}

export interface ChatwootWebhookPayload {
  event: string;

  // Campos raiz — presentes em conversation_status_changed
  id?: number;
  status?: string;
  meta?: {
    sender?: { phone_number?: string; type?: string };
  };

  // Campos de message_created
  message_type?: string;
  content?: string;
  attachments?: Array<{
    id: number;
    file_type: 'image' | 'video' | 'audio' | 'file' | string;
    data_url: string;
    thumb_url?: string;
    file_name?: string;
  }>;
  sender?: {
    type: 'agent' | 'user' | 'agent_bot' | 'contact' | string;
  };
  conversation?: {
    id: number;
    status: string;
    meta?: {
      sender?: { phone_number?: string };
    };
    contact_inbox?: {
      source_id?: string;
    };
  };

  account?: { id: number };
}

// ─── Claude KB Search ─────────────────────────────────────────────────────────

export interface KBSearchResult {
  found: boolean;
  articleId?: number;
  articleTitle?: string;
  summary?: string;
}
