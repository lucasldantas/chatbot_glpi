import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config';
import type { ChatwootContact, ChatwootConversation } from '../types';

const http = axios.create({
  baseURL: `${config.chatwoot.url}/api/v1/accounts/${config.chatwoot.accountId}`,
  headers: {
    api_access_token: config.chatwoot.apiToken,
    'Content-Type': 'application/json',
  },
  timeout: 15_000,
});

// ─── Contatos ─────────────────────────────────────────────────────────────────

export async function findOrCreateContact(
  phone: string,
  name: string,
  email?: string,
): Promise<ChatwootContact> {
  // Tenta buscar pelo telefone primeiro
  const clean = phone.replace(/\D/g, '');
  const searchRes = await http.get<{ payload: ChatwootContact[] }>('/contacts/search', {
    params: { q: clean, include_contacts: true },
  });

  const existing = searchRes.data.payload?.find(
    (c) => c.phone_number?.replace(/\D/g, '') === clean,
  );

  if (existing) {
    // Atualiza nome se necessário
    if (existing.name !== name) {
      await http.put(`/contacts/${existing.id}`, { name, email });
    }
    return existing;
  }

  const createRes = await http.post<{ id: number; name: string; phone_number: string }>(
    '/contacts',
    { name, phone_number: `+${clean}`, email: email ?? undefined },
  );

  return createRes.data;
}

// ─── Conversas ────────────────────────────────────────────────────────────────

export interface CreateConversationInput {
  contactId: number;
  additionalAttributes?: Record<string, unknown>;
}

export async function createConversation(
  input: CreateConversationInput,
): Promise<ChatwootConversation> {
  const { data } = await http.post<ChatwootConversation>('/conversations', {
    inbox_id: config.chatwoot.inboxId,
    contact_id: input.contactId,
    additional_attributes: input.additionalAttributes,
  });
  return data;
}

// ─── Mensagens ────────────────────────────────────────────────────────────────

export async function sendBotMessage(
  conversationId: number,
  content: string,
  isPrivate = false,
): Promise<void> {
  await http.post(`/conversations/${conversationId}/messages`, {
    content,
    message_type: 'outgoing',
    private: isPrivate,
  });
}

export async function sendIncomingMessage(
  conversationId: number,
  content: string,
): Promise<void> {
  await http.post(`/conversations/${conversationId}/messages`, {
    content,
    message_type: 'incoming',
  });
}

export async function sendIncomingMessageWithFile(
  conversationId: number,
  base64: string,
  mimetype: string,
  filename: string,
  caption?: string,
): Promise<void> {
  const buffer = Buffer.from(base64, 'base64');

  const form = new FormData();
  form.append('message_type', 'incoming');
  form.append('attachments[]', buffer, { filename, contentType: mimetype });
  if (caption) form.append('content', caption);

  await http.post(`/conversations/${conversationId}/messages`, form, {
    headers: form.getHeaders(),
  });
}

// ─── Notas / contexto ─────────────────────────────────────────────────────────

export async function addNote(conversationId: number, note: string): Promise<void> {
  await http.post(`/conversations/${conversationId}/messages`, {
    content: note,
    message_type: 'activity',
    private: true,
  });
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function resolveConversation(conversationId: number): Promise<void> {
  await http.patch(`/conversations/${conversationId}`, { status: 'resolved' });
}
