import * as evolution from '../services/evolution.service';
import * as chatwoot from '../services/chatwoot.service';
import * as chatwootDb from '../services/chatwoot-db.service';
import * as sessionStore from '../session/redis';
import type { Session } from '../types';

export async function sendCsatRequest(phone: string, conversationId: number): Promise<void> {
  const session = await sessionStore.getSession(phone);
  if (!session) return;

  session.state = 'WAITING_CSAT';
  session.csatConversationId = conversationId;
  session.ticketDraft = {};
  await sessionStore.saveSession(phone, session);

  await evolution.sendText(
    evolution.toJid(phone),
    '⭐ *Pesquisa de satisfação*\n\nDe *1 a 10*, como você avalia o atendimento que recebeu?\n\n_(Digite apenas o número)_',
  );
}

export async function handleCsatResponse(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const score = parseInt(text.trim(), 10);

  if (isNaN(score) || score < 1 || score > 10) {
    await evolution.sendText(
      evolution.toJid(phone),
      'Por favor, envie apenas um número de *1 a 10*.',
    );
    return;
  }

  const emoji = score >= 9 ? '😄' : score >= 7 ? '🙂' : score >= 5 ? '😐' : '😕';

  await evolution.sendText(
    evolution.toJid(phone),
    `${emoji} Obrigado pela avaliação! Você deu nota *${score}/10*.\n\nSua opinião é muito importante para continuarmos melhorando. Até a próxima! 👋`,
  );

  if (session.csatConversationId) {
    const convId = session.csatConversationId;

    // Nota privada — sempre salva; retorna messageId para o relatório
    const messageId = await chatwoot.sendBotMessage(
      convId,
      `⭐ Avaliação CSAT: ${score}/10 — coletado via WhatsApp`,
      true,
    ).catch((err) => { console.error('[CSAT] erro nota privada:', err); return null; });

    // Tenta registrar no relatório nativo do Chatwoot (falha silenciosamente)
    if (messageId) {
      const contactId =
        session.chatwootContactId ??
        await chatwoot.getConversationContactId(convId).catch(() => null);

      if (contactId) {
        await chatwootDb.submitCsatToReport({ conversationId: convId, messageId, contactId, score })
          .catch(console.error);
      } else {
        console.warn('[CSAT] contactId não encontrado para conv', convId);
      }
    }
  }

  session.state = 'MENU';
  session.csatConversationId = undefined;
  await sessionStore.saveSession(phone, session);
}
