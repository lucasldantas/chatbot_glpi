import * as evolution from '../services/evolution.service';
import * as glpi from '../services/glpi.service';
import * as sessionStore from '../session/redis';
import { TICKET_STATUS_LABEL } from '../types';
import type { GLPITicket, Session } from '../types';

// Pendentes: Novo (1) + Pendente (4)
// Em atendimento: Em andamento atribuído (2) + Em andamento planejado (3)
// Concluídos: Resolvido (5) + Fechado (6)
const GROUPS: { label: string; icon: string; statuses: number[] }[] = [
  { label: 'Pendentes',       icon: '⏳', statuses: [1, 4] },
  { label: 'Em atendimento',  icon: '🔧', statuses: [2, 3] },
  { label: 'Concluídos',      icon: '✅', statuses: [5, 6] },
];

export async function showTicketList(phone: string): Promise<void> {
  const session = await sessionStore.getSession(phone);
  if (!session) return;

  if (!session.user.glpiUserId) {
    await evolution.sendText(
      phone,
      '⚠️ Para consultar chamados, você precisa ter uma conta cadastrada no sistema.\n\nVoltando ao menu...',
    );
    await sessionStore.updateState(phone, 'MENU');
    const { sendMenu } = await import('./menu.flow');
    await sendMenu(phone);
    return;
  }

  await evolution.sendText(phone, '🔍 Buscando seus chamados...');

  const tickets = await glpi.getTicketsByUser(session.user.glpiUserId);

  if (tickets.length === 0) {
    await evolution.sendText(
      phone,
      '✅ Você não possui chamados registrados no momento!\n\nDigite *0* para voltar ao menu principal.',
    );
    return;
  }

  const orderedTickets: GLPITicket[] = [];
  const lines: string[] = [`📋 *Seus chamados (${tickets.length} no total):*`];

  for (const group of GROUPS) {
    const grouped = tickets.filter((t) => group.statuses.includes(t.status));
    if (grouped.length === 0) continue;

    lines.push('', `${group.icon} *${group.label}* (${grouped.length})`);

    for (const t of grouped) {
      const idx = orderedTickets.length + 1;
      orderedTickets.push(t);
      const date = t.date_creation
        ? new Date(t.date_creation).toLocaleDateString('pt-BR')
        : '';
      lines.push(`  *${idx}.* [#${t.id}] ${t.name}  📅 ${date}`);
    }
  }

  lines.push('', 'Digite o *número* do chamado para ver detalhes, ou *0* para voltar ao menu:');

  await evolution.sendText(phone, lines.join('\n'));

  (session as unknown as Record<string, unknown>)['_ticketList'] = orderedTickets.map((t) => t.id);
  await sessionStore.saveSession(phone, session);
}

export async function handleTicketSelection(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const choice = text.trim();

  if (choice === '0') {
    await sessionStore.updateState(phone, 'MENU');
    const { sendMenu } = await import('./menu.flow');
    await sendMenu(phone);
    return;
  }

  const ticketList = (session as unknown as Record<string, unknown>)['_ticketList'] as
    | number[]
    | undefined;

  const index = parseInt(choice, 10) - 1;

  if (!ticketList || index < 0 || index >= ticketList.length || isNaN(index)) {
    await evolution.sendText(
      phone,
      `❌ Opção inválida. Digite um número de 1 a ${ticketList?.length ?? '?'} ou *0* para voltar:`,
    );
    return;
  }

  const ticketId = ticketList[index];
  const ticket = await glpi.getTicketById(ticketId);

  if (!ticket) {
    await evolution.sendText(phone, '❌ Chamado não encontrado. Tente novamente:');
    return;
  }

  const status = TICKET_STATUS_LABEL[ticket.status] ?? 'Desconhecido';
  const dateCreated = ticket.date_creation
    ? new Date(ticket.date_creation).toLocaleDateString('pt-BR')
    : '';
  const dateUpdated = ticket.date_mod
    ? new Date(ticket.date_mod).toLocaleDateString('pt-BR')
    : '';
  const cleanContent = ticket.content?.replace(/<[^>]*>/g, '').slice(0, 300) ?? '';

  await evolution.sendText(
    phone,
    [
      `🎫 *Chamado #${ticket.id}*`,
      '',
      `📌 *${ticket.name}*`,
      `📊 Status: *${status}*`,
      `📅 Aberto em: ${dateCreated}`,
      `🔄 Última atualização: ${dateUpdated}`,
      '',
      `📝 *Descrição:*\n${cleanContent}`,
      '',
      `🔗 ${glpi.ticketUrl(ticket.id)}`,
      '',
      'Digite *0* para voltar ao menu:',
    ].join('\n'),
  );

  await sessionStore.updateState(phone, 'CONSULTING_TICKETS');
}
