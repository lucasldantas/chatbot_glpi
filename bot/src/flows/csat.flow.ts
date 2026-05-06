import * as evolution from '../services/evolution.service';
import * as glpi from '../services/glpi.service';
import * as sessionStore from '../session/redis';
import { config } from '../config';
import { toJid } from '../services/evolution.service';
import type { Session } from '../types';

const SCALE = config.csat.scale; // 5 por padrão

export async function sendCsatRequest(phone: string, ticketId: number): Promise<void> {
  let session = await sessionStore.getSession(phone);
  if (!session) {
    session = sessionStore.createSession(phone);
  }

  session.state = 'WAITING_CSAT';
  session.csatTicketId = ticketId;
  await sessionStore.saveSession(phone, session);

  const stars = Array.from({ length: SCALE }, (_, i) => `${i + 1}⭐`).join('  ');

  await evolution.sendText(
    toJid(phone),
    [
      `✅ *Seu chamado #${ticketId} foi resolvido!*`,
      '',
      'Como você avalia o atendimento recebido?',
      '',
      stars,
      '',
      `Responda com um número de *1* a *${SCALE}*:`,
      `(1 = Péssimo  |  ${SCALE} = Excelente)`,
    ].join('\n'),
  );
}

export async function handleCsatResponse(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const score = parseInt(text.trim(), 10);

  if (isNaN(score) || score < 1 || score > SCALE) {
    const stars = Array.from({ length: SCALE }, (_, i) => String(i + 1)).join(', ');
    await evolution.sendText(
      phone,
      `❌ Resposta inválida. Por favor, digite um número entre 1 e ${SCALE} (${stars}):`,
    );
    return;
  }

  if (!session.csatTicketId) {
    await sessionStore.updateState(phone, 'MENU');
    return;
  }

  try {
    await glpi.saveCsatScore(session.csatTicketId, score, SCALE);
  } catch (err) {
    console.error('[CSAT] erro ao salvar no GLPI:', err);
  }

  const emoji = score >= SCALE ? '🌟' : score >= Math.ceil(SCALE / 2) ? '😊' : '😔';
  const msg =
    score >= SCALE
      ? 'Que ótimo! Fico muito feliz em ter ajudado! 🎉'
      : score >= Math.ceil(SCALE / 2)
        ? 'Obrigado pelo feedback! Vamos continuar melhorando. 💪'
        : 'Que pena! Vamos trabalhar para melhorar nosso atendimento. 🙏';

  await evolution.sendText(
    phone,
    [
      `${emoji} Avaliação registrada: *${score}/${SCALE}*`,
      '',
      msg,
      '',
      'Se precisar de mais ajuda, é só chamar! 👋',
    ].join('\n'),
  );

  // Reseta a sessão para o menu
  session.state = 'MENU';
  session.csatTicketId = undefined;
  session.ticketDraft = {};
  await sessionStore.saveSession(phone, session);
}
