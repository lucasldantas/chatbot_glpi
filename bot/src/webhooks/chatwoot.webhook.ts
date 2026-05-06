import type { Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';
import * as evolution from '../services/evolution.service';
import * as sessionStore from '../session/redis';
import type { ChatwootWebhookPayload } from '../types';

// ChatWoot envia webhooks para: http://bot:3000/webhook/chatwoot
// Configure em: ChatWoot > Configurações > Integrações > Webhooks

export async function handleChatwootWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200);

  const payload = req.body as ChatwootWebhookPayload;
  console.log('[ChatWoot WH]', JSON.stringify({ event: payload.event, message_type: payload.message_type, sender_type: payload.sender?.type, conv_id: payload.conversation?.id ?? payload.id, content: payload.content?.slice(0, 50) }));

  // ─── Agente humano enviou mensagem → encaminhar ao WhatsApp ─────────────────
  // sender.type = 'user' para agentes humanos no ChatWoot v3
  if (
    payload.event === 'message_created' &&
    payload.message_type === 'outgoing' &&
    (payload.sender?.type === 'user' || payload.sender?.type === 'agent')
  ) {
    const phone = extractPhoneFromConversation(payload);
    if (!phone) return;

    const session = await sessionStore.getSession(phone);
    if (session?.state !== 'HUMAN_HANDOFF') return;

    const jid = evolution.toJid(phone);

    if (payload.content) {
      await evolution.sendText(jid, payload.content).catch(console.error);
    }

    for (const att of payload.attachments ?? []) {
      const downloaded = await downloadChatwootAttachment(att.data_url);
      if (!downloaded) continue;

      if (att.file_type === 'audio') {
        await evolution.sendAudio(jid, downloaded.base64).catch((err) => {
          console.error('[ChatWoot WH] sendAudio erro:', JSON.stringify(err?.response?.data ?? err?.message));
        });
      } else {
        const mediatype = chatwootFileTypeToEvolution(att.file_type);
        const fileName = att.file_name || att.data_url.split('/').pop()?.split('?')[0] || `arquivo.${att.file_type}`;
        await evolution.sendMedia(jid, mediatype, downloaded.base64, downloaded.mimetype, undefined, fileName).catch((err) => {
          console.error('[ChatWoot WH] sendMedia erro:', JSON.stringify(err?.response?.data ?? err?.message));
        });
      }
    }

    return;
  }

  // ─── Conversa resolvida → volta ao menu ───────────────────────────────────
  // No conversation_status_changed o payload É a conversa (status e meta na raiz)
  if (payload.event === 'conversation_status_changed' && payload.status === 'resolved') {
    const conversationId = payload.id;

    // Phone vem de payload.meta.sender.phone_number (raiz do payload)
    let phone = payload.meta?.sender?.phone_number?.replace(/\D/g, '') ?? null;

    // Fallback: mapeamento conversationId→phone salvo no Redis durante o handoff
    if (!phone && conversationId) {
      phone = await sessionStore.getPhoneByConversation(conversationId);
    }

    console.log('[ChatWoot WH] conversa resolvida — conv_id:', conversationId, 'phone:', phone);
    if (!phone) return;

    const session = await sessionStore.getSession(phone);
    if (!session) return;

    session.state = 'MENU';
    session.ticketDraft = {};
    await sessionStore.saveSession(phone, session);
    await evolution.sendText(
      evolution.toJid(phone),
      '✅ Seu atendimento foi concluído pelo nosso analista.\n\nEspero que tudo tenha sido resolvido da melhor forma! Se precisar de qualquer outra ajuda com a tecnologia no seu dia a dia, é só me chamar por aqui. Bom trabalho! 😊🚀',
    ).catch(console.error);

    const { sendMenu } = await import('../flows/menu.flow');
    await sendMenu(evolution.toJid(phone)).catch(console.error);
  }
}

function extractPhoneFromConversation(payload: ChatwootWebhookPayload): string | null {
  const phoneRaw =
    payload.conversation?.meta?.sender?.phone_number ??
    payload.conversation?.contact_inbox?.source_id;

  if (!phoneRaw) return null;
  return phoneRaw.replace(/\D/g, '');
}

function chatwootFileTypeToEvolution(
  fileType: string,
): 'image' | 'video' | 'document' {
  if (fileType === 'image') return 'image';
  if (fileType === 'video') return 'video';
  return 'document';
}

async function downloadChatwootAttachment(
  externalUrl: string,
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    // Substitui URL externa pela URL interna do Docker
    const internalUrl = externalUrl.replace(
      /^https?:\/\/[^/]+/,
      config.chatwoot.url,
    );
    const response = await axios.get<ArrayBuffer>(internalUrl, {
      responseType: 'arraybuffer',
      headers: { api_access_token: config.chatwoot.apiToken },
      timeout: 15_000,
    });
    const mimetype = (response.headers['content-type'] as string) || 'application/octet-stream';
    const base64 = Buffer.from(response.data).toString('base64');
    return { base64, mimetype };
  } catch (err) {
    console.error('[ChatWoot WH] erro ao baixar anexo:', err);
    return null;
  }
}
