# Manual Completo — Kermit Bot

## Índice

1. [Arquitetura](#1-arquitetura)
2. [Instalação detalhada](#2-instalação-detalhada)
3. [Variáveis de ambiente](#3-variáveis-de-ambiente)
4. [Flows do bot — estados e lógica](#4-flows-do-bot--estados-e-lógica)
5. [Mapeamento completo de mensagens](#5-mapeamento-completo-de-mensagens)
6. [Como personalizar mensagens](#6-como-personalizar-mensagens)
7. [Mídia bidirecional](#7-mídia-bidirecional)
8. [Integração GLPI — Base de Conhecimento e CSAT](#8-integração-glpi--base-de-conhecimento-e-csat)
9. [Estrutura de arquivos](#9-estrutura-de-arquivos)
10. [Comandos de manutenção](#10-comandos-de-manutenção)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                           │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Evolution API│    │   Chatwoot   │    │   Bot (Node.js)  │  │
│  │   :8080      │◄──►│   :3001      │◄──►│     :3000        │  │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘  │
│         │                                          │            │
│         │                               ┌──────────┴──────────┐ │
│         │                               │  Redis  │ PostgreSQL│ │
│         │                               │ sessões │  Chatwoot │ │
│         │                               └─────────────────────┘ │
└─────────┼───────────────────────────────────────────────────────┘
          │
    ┌─────┴──────┐
    │  WhatsApp  │   Usuário final
    └────────────┘
                          ┌──────────────────┐
                Bot ─────►│  GLPI (externo)  │
                          │  API REST        │
                          └──────────────────┘
                          ┌──────────────────┐
                Bot ─────►│  Anthropic Claude│
                          │  (busca KB + AI) │
                          └──────────────────┘
```

### Componentes

| Componente | Tecnologia | Função |
|---|---|---|
| **Bot** | Node.js 20, TypeScript, Express | Lógica central, state machine, roteamento de mensagens |
| **Evolution API** | v2.3.7, baileys | Gateway WhatsApp — recebe e envia mensagens |
| **Chatwoot** | Rails, Sidekiq | Atendimento humano, transferência de conversas |
| **GLPI** | PHP (externo) | Sistema de chamados — não é containerizado aqui |
| **Claude AI** | claude-sonnet-4-6 | Busca semântica na base de conhecimento, extração de keywords |
| **Redis** | v7 | Sessões do bot (TTL configurável), deduplicação de mensagens |
| **PostgreSQL** | v15 | Banco de dados do Chatwoot e da Evolution API |

---

## 2. Instalação detalhada

### Passo 1 — Clonar e executar

```bash
git clone https://github.com/lucasldantas/chatbot_glpi
cd chatbot_glpi
bash install.sh
```

O instalador vai pedir:
1. **Senhas** para PostgreSQL, Redis (geradas automaticamente se confirmado)
2. **Evolution API Key** — defina livremente (mín. 20 caracteres, ex: `suporte_api_key_2025`)
3. **Nome da instância** — nome da instância WhatsApp (ex: `suporte`)
4. **URL do GLPI** — URL completa com protocolo (ex: `https://glpi.empresa.com.br`)
5. **GLPI App Token** — em GLPI: Configuração → Geral → API
6. **GLPI User Token** — token de uma conta de serviço técnico
7. **URL pública do Chatwoot** — ex: `http://192.168.1.100:3001` (usada em e-mails)
8. **Nome da empresa e admin** do Chatwoot
9. **Anthropic API Key** — em `console.anthropic.com`

Após a instalação, acesse `http://localhost:8080/manager`, entre na instância criada e escaneie o QR Code com o WhatsApp Business.

### Passo 2 — Configurar tokens do Chatwoot

O instalador tenta configurar o Chatwoot automaticamente. Se algum valor ficou com `"PENDING"` no `.env`, configure manualmente:

```bash
# 1. Obter token e account_id
curl -s http://localhost:3001/auth/sign_in \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"suasenha"}' | python3 -m json.tool

# 2. Atualizar .env
sed -i 's|CHATWOOT_API_TOKEN=.*|CHATWOOT_API_TOKEN="SEU_TOKEN"|' .env
sed -i 's|CHATWOOT_ACCOUNT_ID=.*|CHATWOOT_ACCOUNT_ID="1"|' .env

# 3. Recriar o bot com novos valores
docker compose up -d --force-recreate bot
```

### Reinstalação limpa

```bash
docker compose down -v --remove-orphans
docker image rm -f chatbot-chatwoot:local
rm -f .env scripts/init-db.sql
bash install.sh
```

---

## 3. Variáveis de ambiente

Arquivo: `.env` na raiz do projeto. Nunca suba este arquivo para o git.

### Banco de dados

| Variável | Descrição | Exemplo |
|---|---|---|
| `POSTGRES_PASSWORD` | Senha master do PostgreSQL | `senha_forte_aqui` |
| `EVOLUTION_DB_PASSWORD` | Senha do banco da Evolution API | `outra_senha` |
| `CHATWOOT_DB_PASSWORD` | Senha do banco do Chatwoot | `outra_senha` |
| `REDIS_PASSWORD` | Senha do Redis | `redis_senha` |
| `REDIS_PASSWORD_ENCODED` | Mesma senha com `@` codificado como `%40` | `redis_senha` |
| `CHATWOOT_SECRET_KEY` | Secret key do Rails (mín. 64 chars) | gerado automaticamente |

### Evolution API

| Variável | Descrição | Como obter |
|---|---|---|
| `EVOLUTION_API_KEY` | Chave de autenticação da API | Defina livremente (mín. 20 chars) |
| `EVOLUTION_INSTANCE` | Nome da instância WhatsApp | Nome que você escolheu ao criar |

### GLPI

| Variável | Descrição | Como obter |
|---|---|---|
| `GLPI_URL` | URL base do GLPI | Ex: `https://glpi.empresa.com.br` |
| `GLPI_APP_TOKEN` | Token da aplicação | GLPI → Configuração → Geral → API |
| `GLPI_USER_TOKEN` | Token do usuário de serviço | GLPI → Admin → Usuários → (service account) → Token API |
| `GLPI_DEFAULT_CATEGORY_ID` | ID da categoria padrão de chamados | GLPI → Helpdesk → Categorias |
| `GLPI_ONBOARDING_CATEGORY_ID` | ID da categoria de onboarding | GLPI → Helpdesk → Categorias |

### Chatwoot

| Variável | Descrição | Como obter |
|---|---|---|
| `CHATWOOT_FRONTEND_URL` | URL pública do Chatwoot | Ex: `http://192.168.1.100:3001` |
| `CHATWOOT_API_TOKEN` | Token de acesso | Chatwoot → Perfil → Access Tokens |
| `CHATWOOT_ACCOUNT_ID` | ID da conta | Número na URL `/app/accounts/1/` |
| `CHATWOOT_INBOX_ID` | ID da inbox WhatsApp | Retornado ao criar a inbox |
| `CHATWOOT_WEBHOOK_SECRET` | Secret para validar webhooks | Defina livremente |

### Bot

| Variável | Descrição | Padrão |
|---|---|---|
| `SESSION_TTL_SECONDS` | Tempo de vida da sessão sem interação | `3600` (1 hora) |
| `ANTHROPIC_API_KEY` | Chave da API Anthropic | `sk-ant-...` |
| `CLAUDE_MODEL` | Modelo Claude usado | `claude-sonnet-4-6` |
| `CSAT_SCALE` | Escala de avaliação CSAT | `5` (1 a 5 estrelas) |

---

## 4. Flows do bot — estados e lógica

O bot é uma máquina de estados armazenada no Redis. Cada usuário tem um estado (field `state` no objeto de sessão).

### Diagrama de estados

```
(nova mensagem)
      │
      ▼
WAITING_EMAIL ──► WAITING_ANON_CONFIRM ──► WAITING_ANON_NAME ──► WAITING_ANON_PERSONAL_EMAIL
      │                                                                         │
      ▼                                                                         │
    MENU ◄─────────────────────────────────────────────────────────────────────┘
      │
      ├──► TICKET_TITLE ──► TICKET_DESCRIPTION ──► KB_RESULT ──► HUMAN_HANDOFF
      │                                                                │
      ├──► CONSULTING_TICKETS ──► TICKET_DETAIL                       │
      │                                                    (conversa resolvida no Chatwoot)
      ├──► ONBOARDING_DESCRIPTION ──────────────────────────────────► MENU
      │
      └──► WAITING_CSAT ──► MENU
```

### Descrição de cada estado

| Estado | Arquivo | O que espera do usuário |
|---|---|---|
| `WAITING_EMAIL` | `identification.flow.ts` | E-mail corporativo |
| `WAITING_ANON_CONFIRM` | `identification.flow.ts` | Opção 1 (corrigir), 2 (visitante), 3 (sair) |
| `WAITING_ANON_NAME` | `identification.flow.ts` | Nome completo |
| `WAITING_ANON_PERSONAL_EMAIL` | `identification.flow.ts` | E-mail pessoal para contato |
| `MENU` | `menu.flow.ts` | Opção 1, 2 ou 3 |
| `TICKET_TITLE` | `new-ticket.flow.ts` | Título resumido do problema |
| `TICKET_DESCRIPTION` | `new-ticket.flow.ts` | Descrição detalhada |
| `KB_RESULT` | `new-ticket.flow.ts` | Opção 1 (resolvido) ou 2 (abrir chamado) |
| `HUMAN_HANDOFF` | `evolution.webhook.ts` | Qualquer mensagem ou mídia → proxy para Chatwoot |
| `CONSULTING_TICKETS` | `consult-tickets.flow.ts` | Número do chamado ou 0 para voltar |
| `TICKET_DETAIL` | `consult-tickets.flow.ts` | 0 para voltar |
| `ONBOARDING_DESCRIPTION` | `onboarding.flow.ts` | Descrição do que precisa configurar |
| `WAITING_CSAT` | `csat.flow.ts` | Nota de 1 a N (configurável) |

---

## 5. Mapeamento completo de mensagens

Todas as mensagens enviadas ao usuário estão em strings hardcoded nos arquivos de flow. Para alterar qualquer texto, edite o arquivo correspondente e faça rebuild do bot (`docker compose build bot && docker compose up -d bot`).

---

### `bot/src/flows/identification.flow.ts`

#### Função `start()` — primeira mensagem ao usuário

```typescript
// Mensagem 1 — boas-vindas
'🐸 Olá! Eu sou o *Kermit*, seu assistente virtual de TI da Arco!\n\nEstou aqui para garantir que a sua tecnologia funcione sem interrupções. Como posso te ajudar hoje?'

// Mensagem 2 — solicita e-mail
'🔐 Para começar, preciso te identificar.\n\nInforme seu *e-mail corporativo*:'
```

#### Função `handleEmailInput()` — validação e lookup do e-mail

```typescript
// E-mail inválido (formato)
'❌ E-mail inválido. Por favor, informe um e-mail no formato usuario@empresa.com:'

// Aguardando validação no GLPI
'🔍 Verificando seu cadastro...'

// Usuário encontrado no GLPI — {greeting} = primeiro nome ou nome completo
`✅ Olá, *${greeting}*! Identidade confirmada.`

// Usuário não encontrado — {email} = e-mail informado
// Menu com 3 opções:
`⚠️ Não encontrei o e-mail *${email}* no sistema.\n\n...`
// Opções: 1️⃣ Corrigir e-mail | 2️⃣ Abrir como visitante | 3️⃣ Sair
```

#### Função `handleAnonConfirm()` — menu do visitante

```typescript
// Opção 1 — pede e-mail novamente
'📧 Informe novamente seu *e-mail corporativo*:'

// Opção 2 — solicita nome
'📝 Qual é o seu *nome completo*?'

// Opção 3 — encerra sessão
'Ok! Se precisar de ajuda, é só mandar mensagem. Até logo! 👋'

// Opção inválida
'Por favor, responda *1*, *2* ou *3*:'
```

#### Função `handleAnonName()` — nome do visitante

```typescript
// Nome muito curto
'❌ Nome muito curto. Informe seu nome completo:'

// Nome aceito — solicita e-mail pessoal
'📧 Qual é o seu *e-mail pessoal* (para contato)?'
```

#### Função `handleAnonPersonalEmail()` — e-mail do visitante

```typescript
// E-mail inválido
'❌ E-mail inválido. Informe um e-mail válido para contato:'

// Cadastro completo — {name} = nome informado
`✅ Olá, *${session.user.name}*! Tudo certo.\n\nComo posso te ajudar?`
// → envia menu a seguir
```

---

### `bot/src/flows/menu.flow.ts`

#### Função `sendMenu()` — menu principal

```typescript
'📋 *Menu Principal*\n\n1️⃣ - Abrir Novo Chamado\n2️⃣ - Consultar Meus Chamados\n3️⃣ - Onboarding / Primeiro Acesso\n\nResponda com o número da opção desejada:'
```

#### Função `handleMenuChoice()` — respostas do menu

```typescript
// Opção 1 — iniciar abertura de chamado
'📝 Vamos abrir um chamado!\n\nInforme um *título resumido* para o seu problema:'

// Opção 3 — iniciar onboarding
'🆕 *Onboarding - Primeiro Acesso*\n\nDescreva brevemente o que você precisa para configurar seu acesso (ex: configurar e-mail, VPN, conta no sistema X...):'

// Opção inválida com usuário identificado — {firstName}, {greeting} = saudação por horário
`Olá, ${firstName}! ${greeting}! 😊 Tudo bem? Como posso te ajudar hoje?`
// greeting: "Bom dia" (5-12h) | "Boa tarde" (12-18h) | "Boa noite" (18-5h) — UTC-3
// → envia menu a seguir
```

---

### `bot/src/flows/new-ticket.flow.ts`

#### Função `handleTitle()` — título do chamado

```typescript
// Título muito curto (< 5 chars)
'❌ Título muito curto. Descreva em poucas palavras o problema:'

// Título aceito — solicita descrição
'📄 Agora descreva o problema com mais detalhes (o que acontece, desde quando, mensagens de erro, etc.):'
```

#### Função `handleDescription()` — descrição e busca na KB

```typescript
// Descrição muito curta (< 10 chars)
'❌ Descrição muito curta. Por favor, forneça mais detalhes:'

// Iniciando busca na base de conhecimento
'🔍 Buscando na base de conhecimento...'

// KB encontrou artigo relevante — {articleTitle}, {kbResult.summary} são substituídos dinamicamente
[
  `💡 *Encontrei um artigo que pode resolver seu problema!*`,
  `📌 *${kbResult.articleTitle}*`,
  kbResult.summary,
  '─'.repeat(30),
  'Isso resolveu sua dúvida?',
  '✅ *1* - Sim, resolvido!',
  '❌ *2* - Não, preciso abrir chamado',
].join('\n')
```

#### Função `handleKbResult()` — resposta sobre a KB

```typescript
// Opção 1 — problema resolvido pela KB
'✅ Ótimo! Fico feliz em ter ajudado.\n\nSe precisar de mais alguma coisa, é só chamar! 😊'

// Opção 2 — abrindo chamado
'📋 Entendido! Vou abrir um chamado para você...'

// Opção inválida
'Por favor, responda *1* (resolvido) ou *2* (abrir chamado):'
```

#### Função `openTicketAndHandoff()` — confirmação do chamado aberto

```typescript
// Chamado aberto — {ticket.id}, {title}, {ticketUrl} são substituídos dinamicamente
[
  `✅ *Chamado #${ticket.id} aberto com sucesso!*`,
  `📌 *${session.ticketDraft.title}*`,
  `🔗 Acompanhe: ${glpi.ticketUrl(ticket.id)}`,
  '⏳ Aguarde, vou transferir você para um técnico...',
].join('\n')

// Erro ao abrir chamado
'❌ Ocorreu um erro ao abrir o chamado. Por favor, tente novamente ou entre em contato diretamente com o suporte.'
```

#### Função `performHandoff()` — transferência para analista

```typescript
// Transferência bem-sucedida
'🤝 Tudo certo! Você foi transferido para um de nossos analistas.\n\nPode continuar enviando mensagens e detalhes sobre o seu caso por aqui. Logo, logo um analista do nosso time de TI vai assumir o seu atendimento para resolver isso com você! 🚀'

// Fallback — erro no Chatwoot (mas chamado GLPI já foi aberto)
'✅ Chamado registrado! Nossa equipe entrará em contato em breve.'
```

**Nota interna para o analista no Chatwoot** (não aparece no WhatsApp):

```typescript
[
  `🎫 *Chamado GLPI #${ticketId}* vinculado a esta conversa`,
  `🔗 ${glpi.ticketUrl(ticketId)}`,
  `👤 Usuário: ${session.user.name} (${session.user.email})`,
  `${isAnonymous ? '⚠️ Usuário não cadastrado no GLPI' : '✅ Usuário identificado no GLPI'}`,
  `📋 *Assunto:* ${session.ticketDraft.title}`,
  `📝 *Descrição:* ${session.ticketDraft.description}`,
].join('\n')
```

---

### `bot/src/flows/consult-tickets.flow.ts`

#### Função `showTicketList()` — listagem de chamados

```typescript
// Usuário sem conta GLPI (visitante)
'⚠️ Para consultar chamados, você precisa ter uma conta cadastrada no sistema.\n\nVoltando ao menu...'

// Aguardando busca
'🔍 Buscando seus chamados...'

// Nenhum chamado encontrado
'✅ Você não possui chamados registrados no momento!\n\nDigite *0* para voltar ao menu principal.'

// Cabeçalho da lista — {tickets.length} dinâmico
`📋 *Seus chamados (${tickets.length} no total):*`
// Grupos: ⏳ Pendentes | 🔧 Em atendimento | ✅ Concluídos
// Cada linha: *N.* [#ID] Título  📅 data

// Rodapé
'Digite o *número* do chamado para ver detalhes, ou *0* para voltar ao menu:'
```

#### Função `handleTicketSelection()` — detalhe do chamado

```typescript
// Seleção inválida — {ticketList.length} dinâmico
`❌ Opção inválida. Digite um número de 1 a ${ticketList?.length ?? '?'} ou *0* para voltar:`

// Chamado não encontrado
'❌ Chamado não encontrado. Tente novamente:'

// Detalhes do chamado — todos os campos são dinâmicos
[
  `🎫 *Chamado #${ticket.id}*`,
  `📌 *${ticket.name}*`,
  `📊 Status: *${status}*`,
  `📅 Aberto em: ${dateCreated}`,
  `🔄 Última atualização: ${dateUpdated}`,
  `📝 *Descrição:*\n${cleanContent}`,  // primeiros 300 chars, HTML removido
  `🔗 ${glpi.ticketUrl(ticket.id)}`,
  'Digite *0* para voltar ao menu:',
].join('\n')
```

**Labels de status** (em `bot/src/types/index.ts`):

```typescript
export const TICKET_STATUS_LABEL: Record<number, string> = {
  1: 'Novo',
  2: 'Em andamento (atribuído)',
  3: 'Em andamento (planejado)',
  4: 'Pendente',
  5: 'Resolvido',
  6: 'Fechado',
};
```

---

### `bot/src/flows/onboarding.flow.ts`

#### Função `handleOnboardingDescription()` — onboarding

```typescript
// Descrição muito curta
'❌ Por favor, forneça mais detalhes sobre o que você precisa configurar:'

// Abrindo chamado de onboarding
'⏳ Abrindo seu chamado de onboarding...'

// Chamado aberto — campos dinâmicos
[
  `✅ *Chamado de Onboarding #${ticket.id} aberto!*`,
  `👤 ${session.user.name}`,
  `📝 ${description.slice(0, 100)}...`,  // primeiros 100 chars
  `🔗 ${glpi.ticketUrl(ticket.id)}`,
  '⏳ Transferindo para um técnico que vai te ajudar com o setup...',
].join('\n')

// Erro
'❌ Ocorreu um erro. Por favor, entre em contato com o suporte diretamente.'
```

---

### `bot/src/flows/csat.flow.ts`

#### Função `sendCsatRequest()` — pesquisa de satisfação

Disparado pelo webhook do GLPI quando um chamado é fechado.

```typescript
// Solicitação de avaliação — {ticketId} e {SCALE} dinâmicos
[
  `✅ *Seu chamado #${ticketId} foi resolvido!*`,
  'Como você avalia o atendimento recebido?',
  stars,   // ex: "1⭐  2⭐  3⭐  4⭐  5⭐"
  `Responda com um número de *1* a *${SCALE}*:`,
  `(1 = Péssimo  |  ${SCALE} = Excelente)`,
].join('\n')
```

A escala padrão é **5**. Para alterar, edite `CSAT_SCALE` no `.env` e recrié o container.

#### Função `handleCsatResponse()` — processamento da nota

```typescript
// Nota inválida — {SCALE} dinâmico
`❌ Resposta inválida. Por favor, digite um número entre 1 e ${SCALE} (${stars}):`

// Agradecimento — nota máxima (= SCALE)
'Que ótimo! Fico muito feliz em ter ajudado! 🎉'

// Agradecimento — nota boa (≥ ceil(SCALE/2))
'Obrigado pelo feedback! Vamos continuar melhorando. 💪'

// Agradecimento — nota baixa (< ceil(SCALE/2))
'Que pena! Vamos trabalhar para melhorar nosso atendimento. 🙏'

// Resultado final — {score}, {SCALE}, {emoji}, {msg} dinâmicos
[
  `${emoji} Avaliação registrada: *${score}/${SCALE}*`,
  msg,
  'Se precisar de mais ajuda, é só chamar! 👋',
].join('\n')
```

---

### `bot/src/webhooks/chatwoot.webhook.ts`

#### Resolução de conversa pelo analista

```typescript
// Enviado ao usuário quando o analista resolve a conversa no Chatwoot
'✅ Seu atendimento foi concluído pelo nosso analista.\n\nEspero que tudo tenha sido resolvido da melhor forma! Se precisar de qualquer outra ajuda com a tecnologia no seu dia a dia, é só me chamar por aqui. Bom trabalho! 😊🚀'
// → a seguir, o menu principal é re-enviado automaticamente
```

---

### `bot/src/webhooks/evolution.webhook.ts`

#### Erro genérico de processamento

```typescript
// Erro inesperado em qualquer estado
'❌ Ocorreu um erro inesperado. Por favor, tente novamente.'
```

---

## 6. Como personalizar mensagens

### Passo a passo

1. Edite o arquivo `.ts` correspondente na tabela acima
2. Altere a string desejada — emojis podem ser colados diretamente
3. Faça rebuild e restart do bot:

```bash
docker compose build bot && docker compose up -d bot
```

### Dicas

- Use `*texto*` para negrito no WhatsApp
- Use `_texto_` para itálico
- Quebras de linha: `\n` no código ou array `.join('\n')`
- Emojis são suportados diretamente — cole do seu teclado ou de emojipedia.org
- Para ver as mudanças nos logs: `docker compose logs bot -f`

---

## 7. Mídia bidirecional

O bot encaminha **qualquer tipo de mídia** em ambas as direções:

| Tipo | WhatsApp → Chatwoot | Chatwoot → WhatsApp |
|---|---|---|
| Imagem (JPG, PNG) | ✅ | ✅ |
| Vídeo (MP4) | ✅ | ✅ |
| Documento (PDF, etc.) | ✅ | ✅ |
| Áudio gravado | ✅ | ✅ (nota de voz) |
| Sticker | ✅ (como imagem) | — |

**Como funciona:**
- WhatsApp → Chatwoot: bot baixa a mídia da Evolution API e faz upload para a conversa no Chatwoot via `multipart/form-data`
- Chatwoot → WhatsApp: bot baixa o anexo do Chatwoot usando a URL interna Docker (`chatwoot-web:3000`) e envia via Evolution API em base64

---

## 8. Integração GLPI — Base de Conhecimento e CSAT

### Base de Conhecimento

O bot busca automaticamente na KB do GLPI quando o usuário descreve um problema:

1. Claude extrai keywords da descrição
2. GLPI `/search` busca artigos relevantes  
3. Claude analisa os resultados e gera um resumo
4. Se encontrou solução → apresenta ao usuário com opção de resolver ou abrir chamado

**Configuração necessária no GLPI:**
- API REST habilitada: Configuração → Geral → API → `Habilitar API REST: Sim`
- App-Token gerado na mesma tela
- User-Token de uma conta com perfil de técnico

### CSAT

Configure uma notificação no GLPI para disparar o webhook quando um chamado for **fechado**:

**GLPI → Configuração → Notificações → Notificações → Nova notificação**

| Campo | Valor |
|---|---|
| Evento | Chamado (Modificado) |
| Filtro | Status = Fechado |
| Notificador | Webhook HTTP |
| URL | `http://SEU_IP:3000/webhook/glpi` |
| Método | POST |

**Corpo JSON:**
```json
{
  "ticket_id": "##ticket.id##",
  "user_phone": "##requester.mobile##",
  "status": "##ticket.status##"
}
```

> O campo `requester.mobile` deve ter o número WhatsApp no formato `5511999990000` (sem `+`, sem espaços). Configure em: GLPI → Administração → Usuários → Telefone celular.

---

## 9. Estrutura de arquivos

```
chatbot_glpi/
├── install.sh                    # Instalador interativo
├── docker-compose.yml            # Orquestração dos serviços
├── .env.example                  # Modelo de variáveis de ambiente
├── .env                          # Variáveis reais (não commitado)
├── README.md                     # Visão geral e quick start
├── MANUAL.md                     # Este arquivo
├── SETUP.md                      # Troubleshooting e fallbacks
├── scripts/
│   └── init-db.sql               # Criação dos bancos (gerado pelo install.sh)
├── chatwoot/
│   └── Dockerfile                # Imagem customizada do Chatwoot
├── evolution-api-src/            # Código-fonte da Evolution API (baixado pelo install.sh)
└── bot/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts              # Entry point — Express + rotas
        ├── config/
        │   └── index.ts          # Leitura e validação de variáveis de ambiente
        ├── session/
        │   └── redis.ts          # Store de sessões, deduplicação de mensagens
        ├── types/
        │   └── index.ts          # Tipos TypeScript + TICKET_STATUS_LABEL
        ├── flows/                # ← MENSAGENS DO BOT estão aqui
        │   ├── identification.flow.ts  # Boas-vindas, e-mail, visitante
        │   ├── menu.flow.ts            # Menu principal
        │   ├── new-ticket.flow.ts      # Abertura de chamado, KB, handoff
        │   ├── consult-tickets.flow.ts # Consulta de chamados
        │   ├── onboarding.flow.ts      # Onboarding / primeiro acesso
        │   └── csat.flow.ts            # Pesquisa de satisfação
        ├── webhooks/
        │   ├── evolution.webhook.ts    # Recebe mensagens do WhatsApp
        │   ├── chatwoot.webhook.ts     # Recebe eventos do Chatwoot
        │   └── glpi.webhook.ts         # Recebe notificações do GLPI (CSAT trigger)
        └── services/
            ├── evolution.service.ts    # Envio de mensagens/mídia via Evolution API
            ├── chatwoot.service.ts     # Criação de conversas, notas, mídia
            ├── glpi.service.ts         # Chamados, KB, usuários
            └── claude.service.ts       # Busca semântica na KB com IA
```

---

## 10. Comandos de manutenção

```bash
# Status de todos os containers
docker compose ps

# Logs em tempo real
docker compose logs bot -f
docker compose logs chatwoot-web -f
docker compose logs evolution-api -f

# Reiniciar um serviço
docker compose restart bot
docker compose restart chatwoot-web chatwoot-worker

# Aplicar mudanças no código do bot
docker compose build bot && docker compose up -d bot

# Forçar recriação sem rebuild (após mudança no .env)
docker compose up -d --force-recreate bot

# Sessão de um usuário específico (substituir 5511999990000)
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" GET "bot:session:5511999990000"

# Limpar sessão de um usuário
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" DEL "bot:session:5511999990000"

# Parar tudo preservando dados
docker compose down

# Reinstalação limpa (apaga tudo)
docker compose down -v --remove-orphans
docker image rm -f chatbot-chatwoot:local
rm -f .env scripts/init-db.sql
bash install.sh
```

---

## 11. Troubleshooting

### Bot não recebe mensagens

```bash
# Verificar se o webhook global está configurado
docker compose logs evolution-api | grep -i webhook

# Verificar se a instância está conectada
curl -s http://localhost:8080/instance/fetchInstances \
  -H "apikey: $EVOLUTION_API_KEY" | python3 -m json.tool
```

### Mensagens duplicadas

O bot usa deduplicação via Redis (chave `dedup:{messageId}`, TTL 60s). Se ainda estiver duplicando, verifique se o webhook de instância está desabilitado:

```bash
source .env
curl -s http://localhost:8080/webhook/$EVOLUTION_INSTANCE \
  -H "apikey: $EVOLUTION_API_KEY" | python3 -m json.tool
# "enabled" deve ser false ou o webhook deve estar ausente
```

### Chamado abre mas não vai para o Chatwoot

```bash
docker compose logs bot | grep -i "chatwoot\|handoff\|erro"
# Verificar se CHATWOOT_API_TOKEN, CHATWOOT_ACCOUNT_ID e CHATWOOT_INBOX_ID estão corretos
cat .env | grep CHATWOOT
```

### Usuário fica preso em HUMAN_HANDOFF após resolução

O bot limpa o estado quando o Chatwoot envia o evento `conversation_status_changed` com `status: resolved`. Verifique se o webhook do Chatwoot está registrado:

```bash
source .env
curl -s "http://localhost:3001/api/v1/accounts/$CHATWOOT_ACCOUNT_ID/webhooks" \
  -H "api_access_token: $CHATWOOT_API_TOKEN" | python3 -m json.tool
```

### Bot não encontra usuário no GLPI (retorna "undefined")

A API de busca do GLPI retorna campos com chaves numéricas. O bot faz automaticamente uma segunda chamada `GET /User/{id}` para obter nome, sobrenome e e-mail. Verifique se a conta de serviço tem permissão de leitura em usuários.

### Erro de build TypeScript

```bash
docker compose build bot --no-cache 2>&1 | tail -30
```

### Verificar saúde dos serviços

```bash
curl -s http://localhost:3000/health
# {"status":"ok","ts":"..."}
```
