import * as evolution from '../services/evolution.service';
import * as glpi from '../services/glpi.service';
import * as sessionStore from '../session/redis';
import { performHandoff } from './new-ticket.flow';
import type { Session } from '../types';

export async function handleOnboardingDescription(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const description = text.trim();
  if (description.length < 10) {
    await evolution.sendText(
      phone,
      '❌ Por favor, forneça mais detalhes sobre o que você precisa configurar:',
    );
    return;
  }

  const title = 'Onboarding - Primeiro Acesso';
  session.ticketDraft.title = title;
  session.ticketDraft.description = description;
  await sessionStore.saveSession(phone, session);

  await evolution.sendText(phone, '⏳ Abrindo seu chamado de onboarding...');

  try {
    const ticket = await glpi.createTicket({
      title,
      description,
      glpiUserId: session.user.glpiUserId,
      requesterName: session.user.isAnonymous ? session.user.name : undefined,
      requesterEmail: session.user.isAnonymous ? session.user.email : undefined,
      isOnboarding: true,
    });

    session.ticketDraft.glpiTicketId = ticket.id;
    await sessionStore.saveSession(phone, session);

    await evolution.sendText(
      phone,
      [
        `✅ *Chamado de Onboarding #${ticket.id} aberto!*`,
        '',
        `👤 ${session.user.name}`,
        `📝 ${description.slice(0, 100)}${description.length > 100 ? '...' : ''}`,
        '',
        `🔗 ${glpi.ticketUrl(ticket.id)}`,
        '',
        '⏳ Transferindo para um técnico que vai te ajudar com o setup...',
      ].join('\n'),
    );

    await performHandoff(phone, session, ticket.id);
  } catch (err) {
    console.error('[Onboarding] erro:', err);
    await evolution.sendText(
      phone,
      '❌ Ocorreu um erro. Por favor, entre em contato com o suporte diretamente.',
    );
    await sessionStore.updateState(phone, 'MENU');
  }
}
