import * as evolution from '../services/evolution.service';
import * as glpi from '../services/glpi.service';
import * as sessionStore from '../session/redis';
import type { Session } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function start(phone: string): Promise<void> {
  let session = await sessionStore.getSession(phone);
  if (!session) {
    session = sessionStore.createSession(phone);
    await sessionStore.saveSession(phone, session);
  }

  await evolution.sendText(
    phone,
    '🐸 Olá! Eu sou o *Kermit*, seu assistente virtual de TI da Arco!\n\nEstou aqui para garantir que a sua tecnologia funcione sem interrupções. Como posso te ajudar hoje?',
  );
  await evolution.sendText(
    phone,
    '🔐 Para começar, preciso te identificar.\n\nInforme seu *e-mail corporativo*:',
  );
}

export async function handleEmailInput(phone: string, text: string): Promise<void> {
  const email = text.trim().toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    await evolution.sendText(
      phone,
      '❌ E-mail inválido. Por favor, informe um e-mail no formato usuario@empresa.com:',
    );
    return;
  }

  await evolution.sendText(phone, '🔍 Verificando seu cadastro...');

  const user = await glpi.findUserByEmail(email);

  if (user) {
    const firstName = user.firstname?.trim();
    const fullName = [user.firstname, user.realname].filter(Boolean).join(' ').trim() || user.name;
    const greeting = firstName || fullName;

    await sessionStore.updateUser(phone, {
      glpiUserId: user.id,
      name: fullName,
      email,
      isAnonymous: false,
    });
    await sessionStore.updateState(phone, 'MENU');

    await evolution.sendText(
      phone,
      `✅ Olá, *${greeting}*! Identidade confirmada.`,
    );

    const { sendMenu } = await import('./menu.flow');
    await sendMenu(phone);
    return;
  }

  // Email não encontrado — modo anônimo
  await sessionStore.updateUser(phone, { email, isAnonymous: true });
  await sessionStore.updateState(phone, 'WAITING_ANON_CONFIRM');

  await evolution.sendText(
    phone,
    [
      `⚠️ Não encontrei o e-mail *${email}* no sistema.`,
      '',
      'Você pode continuar como visitante, mas precisarei de mais algumas informações.',
      '',
      'Responda com o número da opção desejada:',
      '',
      '1️⃣ - Corrigir e-mail informado',
      '2️⃣ - Abrir como visitante',
      '3️⃣ - Sair',
    ].join('\n'),
  );
}

export async function handleAnonConfirm(phone: string, text: string): Promise<void> {
  const choice = text.trim();

  if (choice === '1') {
    await sessionStore.updateState(phone, 'WAITING_EMAIL');
    await evolution.sendText(phone, '📧 Informe novamente seu *e-mail corporativo*:');
    return;
  }

  if (choice === '2') {
    await sessionStore.updateState(phone, 'WAITING_ANON_NAME');
    await evolution.sendText(phone, '📝 Qual é o seu *nome completo*?');
    return;
  }

  if (choice === '3') {
    await sessionStore.deleteSession(phone);
    await evolution.sendText(phone, 'Ok! Se precisar de ajuda, é só mandar mensagem. Até logo! 👋');
    return;
  }

  await evolution.sendText(phone, 'Por favor, responda *1*, *2* ou *3*:');
}

export async function handleAnonName(phone: string, text: string): Promise<void> {
  const name = text.trim();
  if (name.length < 3) {
    await evolution.sendText(phone, '❌ Nome muito curto. Informe seu nome completo:');
    return;
  }

  await sessionStore.updateUser(phone, { name });
  await sessionStore.updateState(phone, 'WAITING_ANON_PERSONAL_EMAIL');
  await evolution.sendText(phone, '📧 Qual é o seu *e-mail pessoal* (para contato)?');
}

export async function handleAnonPersonalEmail(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const email = text.trim().toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    await evolution.sendText(
      phone,
      '❌ E-mail inválido. Informe um e-mail válido para contato:',
    );
    return;
  }

  await sessionStore.updateUser(phone, {
    email,
    isAnonymous: true,
  });
  await sessionStore.updateState(phone, 'MENU');

  await evolution.sendText(
    phone,
    `✅ Olá, *${session.user.name}*! Tudo certo.\n\nComo posso te ajudar?`,
  );

  const { sendMenu } = await import('./menu.flow');
  await sendMenu(phone);
}
