import type { Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';
import * as evolution from '../services/evolution.service';
import * as sessionStore from '../session/redis';
import * as chatwootService from '../services/chatwoot.service';
import * as claudeService from '../services/claude.service';
import * as glpi from '../services/glpi.service';
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
      '✅ Seu atendimento foi concluído pelo nosso analista.\n\nEspero que tudo tenha sido resolvido da melhor forma! 😊',
    ).catch(console.error);

    const { sendCsatRequest } = await import('../flows/csat.flow');
    await sendCsatRequest(phone, conversationId!).catch(console.error);

    // ─── Auto-geração de artigo na base de conhecimento ─────────────────────
    if (conversationId) {
      setImmediate(() => tryGenerateKBArticle(conversationId!));
    }
  }
}

async function tryGenerateKBArticle(conversationId: number): Promise<void> {
  try {
    const messages = await chatwootService.getConversationMessages(conversationId);

    // Filtra apenas mensagens públicas (não notas privadas) com conteúdo
    const publicMessages = messages.filter(
      (m) => !m.private && m.content?.trim(),
    );

    if (publicMessages.length < 3) {
      // Conversa muito curta — sem valor para KB
      return;
    }

    // Monta transcrição legível para o Claude
    const transcript = publicMessages
      .map((m) => {
        const role = m.message_type === 0 ? 'Usuário' : 'Analista';
        return `${role}: ${m.content.trim()}`;
      })
      .join('\n');

    const draft = await claudeService.generateKBArticle(transcript);

    if (!draft.shouldCreate || !draft.title || !draft.content) {
      console.log('[KB Auto] Claude decidiu não criar artigo para conversa', conversationId);
      return;
    }

    const articleId = await glpi.createKBArticle(draft.title, draft.content);

    if (articleId) {
      console.log('[KB Auto] Artigo criado com sucesso — ID:', articleId, 'título:', draft.title);

      // ─── Anexa imagens enviadas pelo analista (máx 5) ───────────────────
      const agentImages = messages
        .filter((m) => !m.private && m.message_type === 1)
        .flatMap((m) => m.attachments ?? [])
        .filter((a) => a.file_type === 'image')
        .slice(0, 5);

      let imagesAttached = 0;
      for (const att of agentImages) {
        try {
          const downloaded = await downloadChatwootAttachment(att.data_url);
          if (!downloaded) continue;

          const ext = downloaded.mimetype.split('/')[1]?.split(';')[0] || 'jpg';
          const filename = `kb-${articleId}-img${imagesAttached + 1}.${ext}`;
          await glpi.attachImageToKBArticle(articleId, downloaded.base64, downloaded.mimetype, filename);
          imagesAttached++;
        } catch (imgErr) {
          console.error('[KB Auto] erro ao anexar imagem:', imgErr);
        }
      }

      if (imagesAttached > 0) {
        console.log('[KB Auto]', imagesAttached, 'imagem(ns) anexada(s) ao artigo', articleId);
      }

      // Nota privada na conversa com link para o artigo
      const articleLink = glpi.kbArticleUrl(articleId);
      await chatwootService.addNote(
        conversationId,
        `📚 Artigo gerado automaticamente na base de conhecimento:\n${draft.title}\n${articleLink}${imagesAttached > 0 ? `\n🖼️ ${imagesAttached} imagem(ns) anexada(s)` : ''}`,
      ).catch(console.error);
    } else {
      console.warn('[KB Auto] createKBArticle retornou null para conversa', conversationId);
    }
  } catch (err) {
    console.error('[KB Auto] erro ao gerar artigo KB para conversa', conversationId, err);
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
