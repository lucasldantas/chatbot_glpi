# Manual Completo — GLPI WhatsApp Bot

## Índice

1. [Arquitetura](#1-arquitetura)
2. [Variáveis de ambiente](#2-variáveis-de-ambiente)
3. [Flows do bot — estados e lógica](#3-flows-do-bot--estados-e-lógica)
4. [Mapeamento de mensagens](#4-mapeamento-de-mensagens)
5. [Autenticação de usuários](#5-autenticação-de-usuários)
6. [IA — Base de conhecimento e geração de artigos](#6-ia--base-de-conhecimento-e-geração-de-artigos)
7. [Mídia bidirecional](#7-mídia-bidirecional)
8. [CSAT via WhatsApp](#8-csat-via-whatsapp)
9. [Estrutura de arquivos](#9-estrutura-de-arquivos)
10. [Comandos de manutenção](#10-comandos-de-manutenção)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Arquitetura

```
┌────────────────────────────────────────────────────────────────────┐
│                          Docker Compose                            │
│                                                                    │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐  │
│  │ Evolution API│   │  Bot (Node.js)   │   │     Chatwoot      │  │
│  │    :8080     │◄─►│      :3000       │◄─►│      :3001        │  │
│  └──────────────┘   └────────┬─────────┘   └───────────────────┘  │
│                               │                                    │
│                    ┌──────────┴──────────┐                         │
│                    │  Redis   │PostgreSQL │                         │
│                    │ sessões  │ Chatwoot  │                         │
│                    └─────────────────────┘                         │
└────────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         GLPI (externo)  Anthropic API    JumpCloud API
         chamados, KB    (IA / Claude)    (autenticação
         usuários                          opcional)
```

### Componentes

| Componente | Tecnologia | Função |
|---|---|---|
| **Bot** | Node.js 20, TypeScript, Express | Lógica central, state machine, roteamento |
| **Evolution API** | v2.3.7, Baileys | Gateway WhatsApp — recebe/envia mensagens |
| **Chatwoot** | Rails, Sidekiq | Atendimento humano, proxy bidirecional |
| **GLPI** | PHP (externo) | Sistema de chamados — não containerizado |
| **Claude AI** | claude-sonnet-4-6 | Busca KB, extração de keywords, geração de artigos |
| **Redis** | v7 | Sessões do bot (TTL configurável), deduplicação |
| **PostgreSQL** | v15 | Banco do Chatwoot e Evolution API |

---

## 2. Variáveis de ambiente

Arquivo: `.env` na raiz do projeto. **Nunca suba este arquivo para o git.**

### Identidade do Bot

| Variável | Descrição | Padrão |
|---|---|---|
| `BOT_COMPANY_NAME` | Nome da empresa exibido nas mensagens | `nossa empresa` |
| `BOT_NAME` | Nome do assistente virtual | `Assistente` |
| `BOT_SUPPORT_TEAM` | Nome do time de suporte | `Suporte TI` |

### Infraestrutura

| Variável | Descrição |
|---|---|
| `POSTGRES_PASSWORD` | Senha master do PostgreSQL |
| `EVOLUTION_DB_PASSWORD` | Senha do banco da Evolution API |
| `CHATWOOT_DB_PASSWORD` | Senha do banco do Chatwoot |
| `REDIS_PASSWORD` | Senha do Redis |
| `REDIS_PASSWORD_ENCODED` | Mesma senha com caracteres especiais codificados (gerado automaticamente) |
| `CHATWOOT_SECRET_KEY` | SECRET_KEY_BASE do Rails (mín. 64 chars) |

### Evolution API

| Variável | Descrição | Como obter |
|---|---|---|
| `EVOLUTION_API_KEY` | Chave de autenticação | Defina livremente (mín. 20 chars) |
| `EVOLUTION_INSTANCE` | Nome da instância WhatsApp | Nome escolhido na criação |

### GLPI

| Variável | Descrição | Como obter |
|---|---|---|
| `GLPI_URL` | URL base do GLPI (sem barra final) | Ex: `https://glpi.empresa.com.br` |
| `GLPI_APP_TOKEN` | Token da aplicação | GLPI → Configuração → Geral → API |
| `GLPI_USER_TOKEN` | Token do usuário de serviço | GLPI → Admin → Usuários → Token API |
| `GLPI_DEFAULT_CATEGORY_ID` | ID da categoria padrão de chamados | GLPI → Assistência → Categorias |
| `GLPI_ONBOARDING_CATEGORY_ID` | ID da categoria de onboarding | GLPI → Assistência → Categorias |

### ChatWoot

| Variável | Descrição | Como obter |
|---|---|---|
| `CHATWOOT_FRONTEND_URL` | URL externa do Chatwoot | Ex: `http://localhost:3001` |
| `CHATWOOT_ACCOUNT_NAME` | Nome da conta/empresa | Configurado no instalador |
| `CHATWOOT_ADMIN_EMAIL` | E-mail do administrador | Configurado no instalador |
| `CHATWOOT_API_TOKEN` | Token de acesso | Chatwoot → Perfil → Access Tokens |
| `CHATWOOT_ACCOUNT_ID` | ID da conta | Número na URL `/app/accounts/1/` |
| `CHATWOOT_INBOX_ID` | ID da inbox WhatsApp | Retornado ao criar a inbox |
| `CHATWOOT_WEBHOOK_SECRET` | Secret para validar webhooks | Defina livremente |
| `CHATWOOT_DB_HOST/USER/PASSWORD/NAME` | Conexão direta ao banco (CSAT) | Preenchidos automaticamente |

### Anthropic / Claude

| Variável | Descrição | Padrão |
|---|---|---|
| `ANTHROPIC_API_KEY` | Chave da API Anthropic | — |
| `CLAUDE_MODEL` | Modelo Claude usado | `claude-sonnet-4-6` |

### JumpCloud (opcional)

| Variável | Descrição | Padrão |
|---|---|---|
| `JUMPCLOUD_ENABLED` | Habilitar autenticação via JumpCloud | `false` |
| `JUMPCLOUD_API_KEY` | Chave de API do JumpCloud | vazio |

### Bot

| Variável | Descrição | Padrão |
|---|---|---|
| `SESSION_TTL_SECONDS` | Tempo de sessão sem interação | `3600` (1 hora) |
| `CSAT_SCALE` | Escala máxima da CSAT | `5` (mapeado de 1–10) |

---

## 3. Flows do bot — estados e lógica

O bot é uma **máquina de estados** armazenada no Redis. Cada número de telefone possui uma sessão com um `state` ativo.

### Diagrama de estados

```
(nova mensagem / primeiro contato)
           │
           ▼
    WAITING_EMAIL
           │
           ├─── [JumpCloud habilitado] ──► WAITING_CPF ──► MENU
           │
           └─── [somente GLPI] ──────────────────────────► MENU
                                                              │
                         ┌────────────────────────────────────┤
                         │                                    │
                         ▼                                    ▼
               TICKET_TITLE                        CONSULTING_TICKETS
                    │                                         │
               TICKET_DESCRIPTION                   TICKET_DETAIL
                    │
               KB_RESULT
                    │
               HUMAN_HANDOFF ◄── ONBOARDING_DESCRIPTION
                    │
           (conversa resolvida no Chatwoot)
                    │
               WAITING_CSAT
                    │
                   MENU
```

### Descrição de cada estado

| Estado | Arquivo | O que espera |
|---|---|---|
| `WAITING_EMAIL` | `identification.flow.ts` | E-mail corporativo |
| `WAITING_CPF` | `identification.flow.ts` | 4 últimos dígitos do CPF (somente modo JumpCloud) |
| `MENU` | `menu.flow.ts` | Opção 0, 1, 2 ou 3 |
| `TICKET_TITLE` | `new-ticket.flow.ts` | Título resumido do problema |
| `TICKET_DESCRIPTION` | `new-ticket.flow.ts` | Descrição detalhada |
| `KB_RESULT` | `new-ticket.flow.ts` | 1 (resolvido) ou 2 (abrir chamado) |
| `HUMAN_HANDOFF` | `evolution.webhook.ts` | Qualquer mensagem → proxy para Chatwoot |
| `CONSULTING_TICKETS` | `consult-tickets.flow.ts` | Número do chamado ou 0 para voltar |
| `TICKET_DETAIL` | `consult-tickets.flow.ts` | 0 para voltar ao menu |
| `ONBOARDING_DESCRIPTION` | `onboarding.flow.ts` | Descrição do que precisa configurar |
| `WAITING_CSAT` | `csat.flow.ts` | Nota de 1 a 10 |

---

## 4. Mapeamento de mensagens

Todas as mensagens estão nos arquivos de flow em `bot/src/flows/`. Para personalizar, edite o arquivo e faça rebuild:

```bash
docker compose build bot && docker compose up -d bot
```

### `identification.flow.ts`

```
Boas-vindas:
"👋 Olá! Eu sou o *{BOT_NAME}*, assistente virtual de {BOT_SUPPORT_TEAM} da *{BOT_COMPANY_NAME}*!"

Solicita e-mail:
"🔐 Para começar, preciso te identificar. Informe seu *e-mail corporativo*:"

E-mail não encontrado:
"❌ E-mail *{email}* não encontrado no sistema."

Conta inativa (JumpCloud):
"⚠️ Houve um problema com seu acesso, contate o seu gestor."

Solicita CPF (modo JumpCloud):
"🔑 Para confirmar sua identidade, informe os *4 últimos dígitos do seu CPF*:"

CPF incorreto:
"❌ CPF incorreto. Você tem mais *{N} tentativas*."

Tentativas excedidas:
"🔒 Número de tentativas excedido. ⚠️ Houve um problema com seu acesso, contate o seu gestor."

Autenticado:
"✅ Olá, *{firstName}*! Identidade confirmada."
```

### `menu.flow.ts`

```
Menu principal:
"📋 *Menu Principal*
0️⃣ - Sair
1️⃣ - Abrir Novo Chamado
2️⃣ - Consultar Meus Chamados
3️⃣ - Onboarding / Primeiro Acesso"

Opção 0 — Sair:
"👋 Até logo! Se precisar de ajuda, é só chamar."
(sessão deletada completamente)
```

### `new-ticket.flow.ts`

```
Solicita título:
"📝 Vamos abrir um chamado! Informe um *título resumido*:"

Solicita descrição:
"📄 Agora descreva o problema com mais detalhes:"

Buscando KB:
"🔍 Buscando na base de conhecimento..."

KB encontrada (com resumo + link):
"💡 *Encontrei um artigo que pode resolver seu problema!*
📌 *{título}*
{passos numerados}
🔗 Artigo completo: {link}
Isso resolveu sua dúvida? 1 = Sim | 2 = Abrir chamado"

Chamado aberto:
"✅ *Chamado #{id} aberto com sucesso!*
📌 *{título}*
🔗 Acompanhe: {link GLPI}"

Transferência para analista:
"🤝 Você foi transferido para um analista. Pode continuar enviando mensagens aqui."
```

### `csat.flow.ts`

```
Solicitação:
"⭐ Como você avalia o atendimento? Responda com um número de *1* a *10*:
(1 = Péssimo · 10 = Excelente)"

Agradecimento nota alta (8-10):
"🎉 Que ótimo! Fico muito feliz em ter ajudado!"

Agradecimento nota média (5-7):
"💪 Obrigado pelo feedback! Vamos continuar melhorando."

Agradecimento nota baixa (1-4):
"🙏 Que pena! Vamos trabalhar para melhorar nosso atendimento."
```

### `chatwoot.webhook.ts`

```
Conversa resolvida pelo analista:
"✅ Seu atendimento foi concluído pelo nosso analista.
Espero que tudo tenha sido resolvido da melhor forma! 😊"
→ CSAT é disparado na sequência
```

---

## 5. Autenticação de usuários

### Modo GLPI (padrão — `JUMPCLOUD_ENABLED=false`)

1. Usuário informa e-mail
2. Bot faz `GET /search/User` no GLPI com `contains` + validação exata no Node.js
3. Se encontrado → autenticado, vai ao menu
4. Se não encontrado → sessão encerrada

### Modo JumpCloud (`JUMPCLOUD_ENABLED=true`)

1. Usuário informa e-mail
2. Bot consulta `GET /api/systemusers?filter=email:$eq:{email}` no JumpCloud
   - Não existe → sessão encerrada
   - Conta suspensa/inativa → "problema com seu acesso"
   - CPF (custom attribute) não configurado → "problema com seu acesso"
3. Bot consulta GLPI (mesma lógica)
4. Bot pede os 4 últimos dígitos do CPF (máx. 3 tentativas)
5. CPF confere → autenticado, vai ao menu
6. 3 tentativas esgotadas → sessão encerrada

**Configuração do CPF no JumpCloud:**
- Cada usuário deve ter um custom attribute `CPF` com o número (somente dígitos ou formatado)
- O bot valida os **4 últimos dígitos** do número armazenado

---

## 6. IA — Base de conhecimento e geração de artigos

### Busca na KB

Fluxo ao descrever um problema:

1. `claudeService.extractKeywords(description)` — extrai 5 palavras-chave
2. `glpiService.searchKnowledgeBase(keywords)` — busca por palavra individual com OR, campos assunto (1) e conteúdo (7)
3. `claudeService.searchKnowledgeBase(question, articles)` — Claude avalia quais artigos respondem diretamente
4. Se encontrou: apresenta resumo numerado + link direto ao artigo no GLPI
5. Se não encontrou: segue para abertura de chamado

### Geração automática de artigos

Disparado ao resolver uma conversa no Chatwoot:

1. `chatwootService.getConversationMessages(conversationId)` — busca histórico
2. Filtra mensagens públicas (exclui notas privadas), ignora conversas com menos de 3 mensagens
3. Monta transcrição `Usuário: ... / Analista: ...`
4. `claudeService.generateKBArticle(transcript)` — Claude decide se é conhecimento genérico e reutilizável, gera título + HTML sem PII
5. `glpiService.createKBArticle(title, content)` — publica em `POST /KnowbaseItem` (sem aprovação de admin)
6. Busca imagens dos analistas (mensagens `message_type=1`, `file_type=image`, máx. 5)
7. `glpiService.attachImageToKBArticle(articleId, ...)` — upload via `POST /Document` + link via `POST /Document_Item`
8. Adiciona nota privada na conversa do Chatwoot com título e link do artigo

**Proteções de privacidade (hardcoded no prompt do Claude):**
- Nunca inclui nomes, e-mails, CPF, matrícula ou dados identificáveis
- Substitui referências a pessoas por "o colaborador" ou "o usuário"
- Rejeita casos muito específicos (ex: troca de senha de uma pessoa)

---

## 7. Mídia bidirecional

| Tipo | WhatsApp → Chatwoot | Chatwoot → WhatsApp |
|---|---|---|
| Imagem (JPG, PNG, etc.) | ✅ | ✅ |
| Vídeo | ✅ | ✅ |
| Documento (PDF, etc.) | ✅ | ✅ |
| Áudio (nota de voz) | ✅ | ✅ |

**WhatsApp → Chatwoot:** bot baixa a mídia da Evolution API via base64 e faz upload para a conversa no Chatwoot via `multipart/form-data`.

**Chatwoot → WhatsApp:** bot baixa o anexo do Chatwoot via URL interna Docker (`chatwoot-web:3000`) e envia via Evolution API em base64.

---

## 8. CSAT via WhatsApp

A pesquisa de satisfação é disparada automaticamente quando o analista **resolve** a conversa no Chatwoot.

**Fluxo:**
1. Bot envia escala de 1 a 10 diretamente no WhatsApp
2. Usuário responde com um número
3. Bot salva como nota privada na conversa do Chatwoot
4. Bot insere diretamente na tabela `csat_survey_responses` do PostgreSQL do Chatwoot
5. Resultado aparece no relatório nativo de CSAT do Chatwoot

**Mapeamento de rating (1–10 → 1–5):**

| Resposta | Rating CSAT |
|---|---|
| 1–2 | 1 (Awful) |
| 3–4 | 2 (Bad) |
| 5–6 | 3 (Neutral) |
| 7–8 | 4 (Good) |
| 9–10 | 5 (Excellent) |

---

## 9. Estrutura de arquivos

```
chatbot_glpi/
├── install.sh                    # Instalador interativo (9 etapas)
├── docker-compose.yml            # Orquestração dos serviços
├── .env                          # Variáveis reais — NÃO commitar
├── .env.example                  # Modelo de variáveis
├── .gitignore
├── README.md
├── MANUAL.md                     # Este arquivo
├── SETUP.md                      # Fallbacks e troubleshooting
├── scripts/
│   └── init-db.sql               # Criação dos bancos (gerado pelo install.sh)
├── chatwoot/
│   └── Dockerfile                # Imagem customizada do Chatwoot
├── evolution-api-src/            # Código-fonte baixado pelo install.sh (ignorado pelo git)
└── bot/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts              # Entry point — Express + rotas
        ├── config/
        │   └── index.ts          # Variáveis de ambiente com validação
        ├── session/
        │   └── redis.ts          # Store de sessões + deduplicação
        ├── types/
        │   └── index.ts          # Tipos TypeScript + TICKET_STATUS_LABEL
        ├── flows/
        │   ├── identification.flow.ts  # E-mail, JumpCloud, CPF
        │   ├── menu.flow.ts            # Menu principal (0-3)
        │   ├── new-ticket.flow.ts      # Título, descrição, KB, handoff
        │   ├── consult-tickets.flow.ts # Listagem e detalhe de chamados
        │   ├── onboarding.flow.ts      # Onboarding / primeiro acesso
        │   └── csat.flow.ts            # Pesquisa de satisfação
        ├── webhooks/
        │   ├── evolution.webhook.ts    # Recebe mensagens do WhatsApp
        │   └── chatwoot.webhook.ts     # Recebe eventos do Chatwoot + KB auto
        └── services/
            ├── evolution.service.ts    # Envio de mensagens/mídia
            ├── chatwoot.service.ts     # Conversas, notas, histórico
            ├── chatwoot-db.service.ts  # INSERT direto na tabela CSAT
            ├── glpi.service.ts         # Chamados, KB, usuários, documentos
            ├── claude.service.ts       # Busca KB, geração de artigos, keywords
            └── jumpcloud.service.ts    # Validação de usuário + CPF
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

# Rebuild e restart do bot (após mudança no código)
docker compose build bot && docker compose up -d bot

# Forçar recriação sem rebuild (após mudança no .env)
docker compose up -d --force-recreate bot

# Reiniciar serviço específico
docker compose restart bot
docker compose restart chatwoot-web chatwoot-worker

# Ver sessão de um usuário
source .env
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" GET "bot:session:5511999990000"

# Limpar sessão de um usuário (equivale à opção 0 do menu)
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" DEL "bot:session:5511999990000"

# Listar todas as sessões ativas
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "bot:session:*"

# Parar tudo (preserva dados)
docker compose down

# Reinstalação limpa (apaga volumes)
docker compose down -v --remove-orphans
docker image rm -f chatbot-chatwoot:local
rm -f .env scripts/init-db.sql
bash install.sh

# Health check do bot
curl -s http://localhost:3000/health
# Resposta: {"status":"ok","ts":"..."}
```

---

## 11. Troubleshooting

### Bot não recebe mensagens

```bash
# Verificar se a instância está conectada
source .env
curl -s http://localhost:8080/instance/fetchInstances \
  -H "apikey: $EVOLUTION_API_KEY" | python3 -m json.tool
# "connectionStatus" deve ser "open"

# Verificar webhook global
docker compose logs evolution-api | grep -i webhook
```

### Mensagens duplicadas

O bot deduplica via Redis (chave `dedup:{messageId}`, TTL 60s). Verifique se o webhook de instância está desabilitado:

```bash
source .env
curl -s "http://localhost:8080/webhook/$EVOLUTION_INSTANCE" \
  -H "apikey: $EVOLUTION_API_KEY" | python3 -m json.tool
# "enabled" deve ser false
```

### Usuário não identificado no GLPI

A busca usa `contains` + validação exata em Node.js. Verifique se:
- O e-mail está cadastrado exatamente no GLPI (sem espaços extras)
- O User-Token tem permissão de leitura em usuários

```bash
docker compose logs bot | grep -i "findUserByEmail\|GLPI"
```

### JumpCloud não encontra o CPF

O atributo custom deve se chamar exatamente `CPF` (qualquer capitalização). Verifique:

```bash
docker compose logs bot | grep -i "jumpcloud\|cpf"
```

Se o log mostrar `cpfLast4: undefined`, o atributo não está sendo retornado. Confirme o nome do atributo no painel do JumpCloud.

### Handoff não abre conversa no Chatwoot

```bash
docker compose logs bot | grep -i "chatwoot\|handoff\|erro"
# Verificar se tokens estão corretos
source .env && echo "Token: $CHATWOOT_API_TOKEN | Account: $CHATWOOT_ACCOUNT_ID | Inbox: $CHATWOOT_INBOX_ID"
```

### Usuário preso em HUMAN_HANDOFF

O estado é limpo quando o Chatwoot dispara `conversation_status_changed` com `status: resolved`. Verifique o webhook:

```bash
source .env
curl -s "http://localhost:3001/api/v1/accounts/$CHATWOOT_ACCOUNT_ID/webhooks" \
  -H "api_access_token: $CHATWOOT_API_TOKEN" | python3 -m json.tool
# Deve existir URL "http://bot:3000/webhook/chatwoot" com subscriptions corretas
```

### KB não gera artigos automaticamente

```bash
docker compose logs bot | grep "KB Auto"
# Causas comuns:
# - conversa com menos de 3 mensagens
# - Claude decidiu que não é conhecimento genérico
# - erro de autenticação no GLPI
```

### Erro de build TypeScript

```bash
docker compose build bot --no-cache 2>&1 | tail -30
```

### CSAT não aparece no relatório do Chatwoot

```bash
docker compose logs bot | grep -i "csat"
# Verificar conexão com o banco
docker compose exec postgres psql -U chatwoot -d chatwoot_production \
  -c "SELECT COUNT(*) FROM csat_survey_responses;"
```
