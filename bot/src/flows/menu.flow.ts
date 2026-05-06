import * as evolution from '../services/evolution.service';
import * as sessionStore from '../session/redis';

function getGreeting(): string {
  // Brazil timezone: UTC-3
  const hour = (new Date().getUTCHours() - 3 + 24) % 24;
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export async function sendMenu(phone: string): Promise<void> {
  await evolution.sendText(
    phone,
    [
      '📋 *Menu Principal*',
      '',
      '1️⃣ - Abrir Novo Chamado',
      '2️⃣ - Consultar Meus Chamados',
      '3️⃣ - Onboarding / Primeiro Acesso',
      '0️⃣ - Sair',
      '',
      'Responda com o número da opção desejada:',
    ].join('\n'),
  );
}

export async function handleMenuChoice(phone: string, text: string): Promise<void> {
  const choice = text.trim();

  if (choice === '1') {
    await sessionStore.updateState(phone, 'TICKET_TITLE');
    await evolution.sendText(
      phone,
      '📝 Vamos abrir um chamado!\n\nInforme um *título resumido* para o seu problema:',
    );
    return;
  }

  if (choice === '2') {
    await sessionStore.updateState(phone, 'CONSULTING_TICKETS');
    const { showTicketList } = await import('./consult-tickets.flow');
    await showTicketList(phone);
    return;
  }

  if (choice === '0') {
    await evolution.sendText(
      phone,
      '👋 Até logo! Se precisar de ajuda, é só me chamar. Bom trabalho! 😊',
    );
    await sessionStore.deleteSession(phone);
    return;
  }

  if (choice === '3') {
    await sessionStore.updateState(phone, 'ONBOARDING_DESCRIPTION');
    await evolution.sendText(
      phone,
      [
        '🆕 *Onboarding - Primeiro Acesso*',
        '',
        'Descreva brevemente o que você precisa para configurar seu acesso (ex: configurar e-mail, VPN, conta no sistema X...):',
      ].join('\n'),
    );
    return;
  }

  // Input inválido — cumprimenta pelo nome se identificado
  const session = await sessionStore.getSession(phone);
  if (session?.user?.name && !session.user.isAnonymous) {
    const firstName = session.user.name.split(' ')[0];
    const greeting = getGreeting();
    await evolution.sendText(
      phone,
      `Olá, ${firstName}! ${greeting}! 😊 Tudo bem? Como posso te ajudar hoje?`,
    );
  }

  await sendMenu(phone);
}
