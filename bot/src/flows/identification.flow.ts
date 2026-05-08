import * as evolution from '../services/evolution.service';
import * as glpi from '../services/glpi.service';
import * as jumpcloud from '../services/jumpcloud.service';
import * as sessionStore from '../session/redis';
import { config } from '../config';
import type { Session } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CPF_ATTEMPTS = 3;
const MSG_ACCESS_PROBLEM = '⚠️ Houve um problema com seu acesso, contate o seu gestor.';

export async function start(phone: string): Promise<void> {
  let session = await sessionStore.getSession(phone);
  if (!session) {
    session = sessionStore.createSession(phone);
    await sessionStore.saveSession(phone, session);
  }

  await evolution.sendText(
    phone,
    `👋 Olá! Eu sou o *${config.bot.botName}*, assistente virtual de ${config.bot.supportTeam} da *${config.bot.companyName}*!\n\nEstou aqui para garantir que a sua tecnologia funcione sem interrupções. Como posso te ajudar hoje?`,
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

  if (config.jumpcloud.enabled) {
    // ── Modo JumpCloud: valida JC (existe + ativo + CPF) → GLPI ────────────────
    await handleWithJumpCloud(phone, email);
  } else {
    // ── Modo GLPI: valida apenas no GLPI ───────────────────────────────────────
    await handleGlpiOnly(phone, email);
  }
}

// ─── Fluxo com JumpCloud ──────────────────────────────────────────────────────

async function handleWithJumpCloud(phone: string, email: string): Promise<void> {
  const jcResult = await jumpcloud.findActiveUserByEmail(email);

  if (!jcResult.exists) {
    await evolution.sendText(phone, `❌ E-mail *${email}* não encontrado no sistema.`);
    await sessionStore.deleteSession(phone);
    return;
  }

  if (!jcResult.active) {
    await evolution.sendText(phone, MSG_ACCESS_PROBLEM);
    await sessionStore.deleteSession(phone);
    return;
  }

  if (!jcResult.cpfLast4) {
    await evolution.sendText(phone, MSG_ACCESS_PROBLEM);
    await sessionStore.deleteSession(phone);
    return;
  }

  const user = await glpi.findUserByEmail(email);

  if (!user) {
    await evolution.sendText(phone, `❌ E-mail *${email}* não encontrado no sistema.`);
    await sessionStore.deleteSession(phone);
    return;
  }

  const fullName = [user.firstname, user.realname].filter(Boolean).join(' ').trim() || user.name;

  await sessionStore.updateUser(phone, {
    glpiUserId: user.id,
    name: fullName,
    email,
    isAnonymous: false,
  });

  const session = await sessionStore.getSession(phone);
  if (session) {
    session.cpfAttempts = 0;
    (session as Session & { _cpfLast4?: string })._cpfLast4 = jcResult.cpfLast4;
    await sessionStore.saveSession(phone, session);
  }

  await sessionStore.updateState(phone, 'WAITING_CPF');
  await evolution.sendText(
    phone,
    '🔑 Para confirmar sua identidade, informe os *4 últimos dígitos do seu CPF*:',
  );
}

// ─── Fluxo somente GLPI ───────────────────────────────────────────────────────

async function handleGlpiOnly(phone: string, email: string): Promise<void> {
  const user = await glpi.findUserByEmail(email);

  if (!user) {
    await evolution.sendText(phone, `❌ E-mail *${email}* não encontrado no sistema.`);
    await sessionStore.deleteSession(phone);
    return;
  }

  const fullName = [user.firstname, user.realname].filter(Boolean).join(' ').trim() || user.name;

  await sessionStore.updateUser(phone, {
    glpiUserId: user.id,
    name: fullName,
    email,
    isAnonymous: false,
  });

  await sessionStore.updateState(phone, 'MENU');

  const firstName = fullName.split(' ')[0];
  await evolution.sendText(
    phone,
    `✅ Olá, *${firstName}*! Identificado com sucesso.`,
  );

  const { sendMenu } = await import('./menu.flow');
  await sendMenu(phone);
}

// ─── Validação do CPF (somente modo JumpCloud) ────────────────────────────────

export async function handleCpfInput(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const input = text.trim().replace(/\D/g, '');

  if (input.length !== 4) {
    await evolution.sendText(phone, '❌ Informe exatamente *4 dígitos* do CPF:');
    return;
  }

  const expectedLast4 = (session as Session & { _cpfLast4?: string })._cpfLast4;

  if (input === expectedLast4) {
    const cleanSession = session as Session & { _cpfLast4?: string };
    delete cleanSession._cpfLast4;
    cleanSession.cpfAttempts = 0;
    await sessionStore.saveSession(phone, cleanSession);
    await sessionStore.updateState(phone, 'MENU');

    const firstName = session.user.name.split(' ')[0];
    await evolution.sendText(
      phone,
      `✅ Olá, *${firstName}*! Identidade confirmada.`,
    );

    const { sendMenu } = await import('./menu.flow');
    await sendMenu(phone);
    return;
  }

  const attempts = (session.cpfAttempts ?? 0) + 1;

  if (attempts >= MAX_CPF_ATTEMPTS) {
    await evolution.sendText(
      phone,
      `🔒 Número de tentativas excedido. ${MSG_ACCESS_PROBLEM}`,
    );
    await sessionStore.deleteSession(phone);
    return;
  }

  const remaining = MAX_CPF_ATTEMPTS - attempts;
  session.cpfAttempts = attempts;
  await sessionStore.saveSession(phone, session);

  await evolution.sendText(
    phone,
    `❌ CPF incorreto. Você tem mais *${remaining} tentativa${remaining > 1 ? 's' : ''}*.\n\nInforme os *4 últimos dígitos do seu CPF*:`,
  );
}
