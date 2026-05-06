import * as evolution from '../services/evolution.service';
import * as glpi from '../services/glpi.service';
import * as chatwoot from '../services/chatwoot.service';
import * as claudeService from '../services/claude.service';
import * as sessionStore from '../session/redis';
import type { Session } from '../types';

export async function handleTitle(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const title = text.trim();
  if (title.length < 5) {
    await evolution.sendText(
      phone,
      '❌ Título muito curto. Descreva em poucas palavras o problema:',
    );
    return;
  }

  session.ticketDraft.title = title;
  session.state = 'TICKET_DESCRIPTION';
  await sessionStore.saveSession(phone, session);

  await evolution.sendText(
    phone,
    '📄 Agora descreva o problema com mais detalhes (o que acontece, desde quando, mensagens de erro, etc.):',
  );
}

export async function handleDescription(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const description = text.trim();
  if (description.length < 10) {
    await evolution.sendText(
      phone,
      '❌ Descrição muito curta. Por favor, forneça mais detalhes:',
    );
    return;
  }

  session.ticketDraft.description = description;
  session.state = 'KB_RESULT';
  await sessionStore.saveSession(phone, session);

  await evolution.sendText(phone, '🔍 Buscando na base de conhecimento...');

  const fullQuery = `${session.ticketDraft.title} ${description}`;

  try {
    const keywords = await claudeService.extractKeywords(fullQuery);
    const articles = await glpi.searchKnowledgeBase(keywords);
    const kbResult = await claudeService.searchKnowledgeBase(fullQuery, articles);

    if (kbResult.found && kbResult.summary) {
      const articleLink = kbResult.articleId ? glpi.kbArticleUrl(kbResult.articleId) : null;
      await evolution.sendText(
        phone,
        [
          `💡 *Encontrei um artigo que pode resolver seu problema!*`,
          '',
          `📌 *${kbResult.articleTitle}*`,
          '',
          kbResult.summary,
          '',
          ...(articleLink ? [`🔗 Artigo completo: ${articleLink}`, ''] : []),
          '─'.repeat(30),
          '',
          'Isso resolveu sua dúvida?',
          '✅ *1* - Sim, resolvido!',
          '❌ *2* - Não, preciso abrir chamado',
        ].join('\n'),
      );
      return;
    }
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: unknown; status?: number } };
    console.error('[KB Search] erro status:', axiosErr?.response?.status, 'body:', JSON.stringify(axiosErr?.response?.data));
    // Prossegue para abertura de chamado em caso de erro na busca
  }

  // KB não resolveu — abre chamado diretamente
  await openTicketAndHandoff(phone, session);
}

export async function handleKbResult(
  phone: string,
  text: string,
  session: Session,
): Promise<void> {
  const choice = text.trim();

  if (choice === '1') {
    await sessionStore.updateState(phone, 'MENU');
    await evolution.sendText(
      phone,
      '✅ Ótimo! Fico feliz em ter ajudado.\n\nSe precisar de mais alguma coisa, é só chamar! 😊',
    );
    return;
  }

  if (choice === '2') {
    await evolution.sendText(phone, '📋 Entendido! Vou abrir um chamado para você...');
    await openTicketAndHandoff(phone, session);
    return;
  }

  await evolution.sendText(phone, 'Por favor, responda *1* (resolvido) ou *2* (abrir chamado):');
}

async function openTicketAndHandoff(phone: string, session: Session): Promise<void> {
  try {
    const ticket = await glpi.createTicket({
      title: session.ticketDraft.title!,
      description: session.ticketDraft.description!,
      glpiUserId: session.user.glpiUserId,
      requesterName: session.user.isAnonymous ? session.user.name : undefined,
      requesterEmail: session.user.isAnonymous ? session.user.email : undefined,
    });

    session.ticketDraft.glpiTicketId = ticket.id;
    await sessionStore.saveSession(phone, session);

    await evolution.sendText(
      phone,
      [
        `✅ *Chamado #${ticket.id} aberto com sucesso!*`,
        '',
        `📌 *${session.ticketDraft.title}*`,
        '',
        `🔗 Acompanhe: ${glpi.ticketUrl(ticket.id)}`,
        '',
        '⏳ Aguarde, vou transferir você para um técnico...',
      ].join('\n'),
    );

    await performHandoff(phone, session, ticket.id);
  } catch (err) {
    console.error('[New Ticket] erro ao abrir chamado:', err);
    await evolution.sendText(
      phone,
      '❌ Ocorreu um erro ao abrir o chamado. Por favor, tente novamente ou entre em contato diretamente com o suporte.',
    );
    await sessionStore.updateState(phone, 'MENU');
  }
}

export async function performHandoff(
  phone: string,
  session: Session,
  ticketId: number,
): Promise<void> {
  try {
    const contact = await chatwoot.findOrCreateContact(
      phone,
      session.user.name,
      session.user.isAnonymous ? session.user.email : undefined,
    );

    const conversation = await chatwoot.createConversation({
      contactId: contact.id,
      additionalAttributes: {
        glpi_ticket_id: ticketId,
        glpi_ticket_url: glpi.ticketUrl(ticketId),
      },
    });

    // Nota de contexto para o técnico
    const contextNote = [
      `🎫 *Chamado GLPI #${ticketId}* vinculado a esta conversa`,
      `🔗 ${glpi.ticketUrl(ticketId)}`,
      `👤 Usuário: ${session.user.name} (${session.user.email})`,
      `${session.user.isAnonymous ? '⚠️ Usuário não cadastrado no GLPI' : '✅ Usuário identificado no GLPI'}`,
      '',
      `📋 *Assunto:* ${session.ticketDraft.title}`,
      `📝 *Descrição:* ${session.ticketDraft.description}`,
    ].join('\n');

    await chatwoot.addNote(conversation.id, contextNote);

    session.state = 'HUMAN_HANDOFF';
    session.ticketDraft.chatwootConversationId = conversation.id;
    session.chatwootContactId = contact.id;
    await sessionStore.saveSession(phone, session);
    await sessionStore.saveConversationPhone(conversation.id, phone);

    await evolution.sendText(
      phone,
      '🤝 Tudo certo! Você foi transferido para um de nossos analistas.\n\nPode continuar enviando mensagens e detalhes sobre o seu caso por aqui. Logo, logo um analista do nosso time de TI vai assumir o seu atendimento para resolver isso com você! 🚀',
    );
  } catch (err) {
    console.error('[Handoff] erro ao criar conversa no ChatWoot:', err);
    // Mesmo com erro no ChatWoot, o chamado no GLPI já foi aberto
    await evolution.sendText(
      phone,
      '✅ Chamado registrado! Nossa equipe entrará em contato em breve.',
    );
    await sessionStore.updateState(phone, 'MENU');
  }
}
