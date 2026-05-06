import type { Request, Response } from 'express';
import * as sessionStore from '../session/redis';
import * as evolution from '../services/evolution.service';
import * as chatwoot from '../services/chatwoot.service';
import * as identificationFlow from '../flows/identification.flow';
import * as menuFlow from '../flows/menu.flow';
import * as newTicketFlow from '../flows/new-ticket.flow';
import * as consultFlow from '../flows/consult-tickets.flow';
import * as onboardingFlow from '../flows/onboarding.flow';
import * as csatFlow from '../flows/csat.flow';
import type { EvolutionWebhookPayload } from '../types';

export async function handleEvolutionWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200); // responde imediatamente para não timeout

  const payload = req.body as EvolutionWebhookPayload;

  if (payload.event !== 'messages.upsert') return;

  const { key, message, pushName } = payload.data;

  // Ignora mensagens enviadas pelo próprio bot
  if (key.fromMe) return;

  // Ignora mensagens de grupos
  if (key.remoteJid.includes('@g.us')) return;

  // Deduplicação: ignora mensagem já processada (protege contra webhook duplo)
  const isNew = await sessionStore.markMessageProcessed(key.id);
  if (!isNew) return;

  const phone = evolution.extractPhone(key.remoteJid);
  const text = extractText(message);
  const media = extractMedia(message);

  if (!text && !media) return;

  void markAsReadAsync(key.remoteJid, key.id);

  let session = await sessionStore.getSession(phone);

  // ─── Handoff humano: proxy para ChatWoot ────────────────────────────────────
  if (session?.state === 'HUMAN_HANDOFF') {
    const conversationId = session.ticketDraft?.chatwootConversationId;
    if (conversationId) {
      if (text) {
        await chatwoot.sendIncomingMessage(conversationId, text).catch(console.error);
      }
      if (media) {
        const downloaded = await evolution.downloadMedia(
          key,
          message as Record<string, unknown>,
        );
        if (downloaded) {
          await chatwoot.sendIncomingMessageWithFile(
            conversationId,
            downloaded.base64,
            downloaded.mimetype,
            media.filename,
            media.caption,
          ).catch(console.error);
        }
      }
    }
    return;
  }

  // Em estados não-handoff, mídia sem texto é ignorada silenciosamente
  if (!text) return;

  // ─── Roteamento por estado ────────────────────────────────────────────────
  try {
    if (!session || session.state === 'WAITING_EMAIL') {
      if (!session) {
        // Primeira mensagem — inicia identificação
        await identificationFlow.start(phone);
        return;
      }
      await identificationFlow.handleEmailInput(phone, text);
      return;
    }

    switch (session.state) {
      case 'WAITING_ANON_CONFIRM':
        await identificationFlow.handleAnonConfirm(phone, text);
        break;

      case 'WAITING_ANON_NAME':
        await identificationFlow.handleAnonName(phone, text);
        break;

      case 'WAITING_ANON_PERSONAL_EMAIL':
        await identificationFlow.handleAnonPersonalEmail(phone, text, session);
        break;

      case 'MENU':
        await menuFlow.handleMenuChoice(phone, text);
        break;

      case 'TICKET_TITLE':
        await newTicketFlow.handleTitle(phone, text, session);
        break;

      case 'TICKET_DESCRIPTION':
        await newTicketFlow.handleDescription(phone, text, session);
        break;

      case 'KB_RESULT':
        await newTicketFlow.handleKbResult(phone, text, session);
        break;

      case 'CONSULTING_TICKETS':
      case 'TICKET_DETAIL':
        await consultFlow.handleTicketSelection(phone, text, session);
        break;

      case 'ONBOARDING_DESCRIPTION':
        await onboardingFlow.handleOnboardingDescription(phone, text, session);
        break;

      case 'WAITING_CSAT':
        await csatFlow.handleCsatResponse(phone, text, session);
        break;

      default:
        // Estado desconhecido — reinicia
        await sessionStore.deleteSession(phone);
        await identificationFlow.start(phone);
    }
  } catch (err) {
    console.error(`[Bot] erro ao processar mensagem de ${phone}:`, err);
    await evolution.sendText(
      phone,
      '❌ Ocorreu um erro inesperado. Por favor, tente novamente.',
    ).catch(() => undefined);
  }
}

function extractText(
  message: EvolutionWebhookPayload['data']['message'],
): string | null {
  if (!message) return null;
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.buttonsResponseMessage?.selectedButtonId ??
    message.listResponseMessage?.singleSelectReply?.selectedRowId ??
    null
  );
}

interface MediaInfo { filename: string; caption?: string }

function extractMedia(
  message: EvolutionWebhookPayload['data']['message'],
): MediaInfo | null {
  if (!message) return null;
  if (message.imageMessage) {
    return { filename: 'imagem.jpg', caption: message.imageMessage.caption };
  }
  if (message.videoMessage) {
    return { filename: 'video.mp4', caption: message.videoMessage.caption };
  }
  if (message.audioMessage || message.pttMessage) {
    return { filename: 'audio.ogg' };
  }
  if (message.documentMessage) {
    return {
      filename: message.documentMessage.fileName ?? message.documentMessage.title ?? 'documento',
      caption: message.documentMessage.caption,
    };
  }
  if (message.stickerMessage) {
    return { filename: 'sticker.webp' };
  }
  return null;
}

async function markAsReadAsync(remoteJid: string, messageId: string): Promise<void> {
  await evolution.markAsRead(remoteJid, messageId).catch(() => undefined);
}
