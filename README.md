# 🤖 GLPI WhatsApp Bot

Bot de atendimento inteligente via WhatsApp integrado ao **GLPI**, com transferência para analistas humanos via **Chatwoot** e IA generativa via **Claude (Anthropic)**.

Desenvolvido para ser instalado em qualquer empresa — todo texto de marca é configurável pelo instalador.

## Visão geral

```
Usuário (WhatsApp)
        │
        ▼
  Evolution API ──► Bot (Node.js) ──► GLPI (chamados, KB, usuários)
                         │
                         ├──► Chatwoot (atendimento humano bidirecional)
                         │
                         └──► Claude AI (busca semântica, geração de artigos)
```

### O que o bot faz

| Funcionalidade | Descrição |
|---|---|
| **Identificação** | Valida usuário por e-mail no GLPI + (opcional) JumpCloud com CPF |
| **Menu principal** | Abrir chamado · Consultar chamados · Onboarding · Sair |
| **Base de conhecimento** | Busca automática com IA antes de abrir chamado |
| **Abertura de chamado** | Cria no GLPI com categoria, título e descrição |
| **Handoff humano** | Transfere para Chatwoot; proxy bidirecional de mensagens e mídia |
| **CSAT** | Pesquisa de satisfação 1–10 via WhatsApp ao resolver conversa |
| **Auto KB** | IA gera artigo na base de conhecimento a partir de atendimentos resolvidos |
| **Imagens na KB** | Imagens enviadas pelo analista são anexadas ao artigo gerado |

## Pré-requisitos

| Requisito | Versão mínima |
|---|---|
| Docker + Docker Compose v2 | 24+ |
| GLPI com API REST habilitada | 10+ |
| Número WhatsApp disponível (QR Code) | — |
| Chave Anthropic API | — |
| (Opcional) JumpCloud API Key | — |

## Instalação

```bash
git clone https://github.com/lucasldantas/chatbot_glpi
cd chatbot_glpi
bash install.sh
```

O instalador interativo guia por **9 etapas** com tela limpa e indicadores de progresso:

1. **Identidade da empresa** — nome da empresa, nome do bot, time de suporte
2. **Infraestrutura** — senhas de PostgreSQL e Redis
3. **Evolution API** — gateway WhatsApp
4. **GLPI** — URL, tokens, categorias
5. **ChatWoot** — atendimento humano
6. **Anthropic / Claude** — IA
7. **JumpCloud** — autenticação opcional com CPF
8. **Configurações do bot** — timeout de sessão
9. **Resumo + confirmação**

Ao final, o instalador sobe todos os serviços automaticamente. Basta **escanear o QR Code** em `http://localhost:8080/manager`.

## Autenticação de usuários

O bot suporta dois modos de identificação, configurados no `install.sh`:

### Modo GLPI (padrão)
Valida apenas o e-mail corporativo no GLPI. Simples e sem dependências externas.

### Modo JumpCloud
Validação em duas etapas com segurança reforçada:
1. E-mail verificado no JumpCloud (conta existe e está ativa)
2. Confirmação dos **4 últimos dígitos do CPF** (custom attribute do JumpCloud)
3. E-mail verificado no GLPI (correspondência exata)

> Modo visitante/anônimo não está disponível em nenhum dos modos por questões de segurança.

## IA integrada

### Busca na base de conhecimento
Ao descrever um problema, o bot:
1. Extrai palavras-chave com Claude
2. Busca artigos no GLPI (`/search/KnowbaseItem`)
3. Claude analisa e resume os resultados
4. Apresenta solução passo a passo + link para o artigo completo

### Geração automática de artigos
Ao resolver uma conversa no Chatwoot, o bot:
1. Busca o histórico de mensagens públicas
2. Claude analisa se contém conhecimento genérico e reutilizável
3. Gera artigo em HTML sem nenhum dado pessoal (PII)
4. Publica diretamente no GLPI — sem necessidade de aprovação de admin
5. Anexa imagens enviadas pelo analista ao artigo
6. Adiciona nota privada na conversa com o link do artigo

## Serviços e portas

| Serviço | Porta | Descrição |
|---|---|---|
| Evolution API | `8080` | Gateway WhatsApp — painel em `/manager` |
| Chatwoot | `3001` | Atendimento humano |
| Bot | `3000` | Webhooks e lógica |
| PostgreSQL | interno | Banco de dados |
| Redis | interno | Sessões e cache |

## Comandos rápidos

```bash
# Logs do bot em tempo real
docker compose logs bot -f

# Rebuild após mudança no código
docker compose build bot && docker compose up -d bot

# Reconfigurar variáveis de ambiente
bash install.sh

# Status de todos os serviços
docker compose ps

# Reinicialização limpa
docker compose down -v --remove-orphans && bash install.sh
```

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [SETUP.md](SETUP.md) | Fallbacks manuais para cada etapa da instalação |
| [MANUAL.md](MANUAL.md) | Referência completa: variáveis, estados, mensagens, troubleshooting |

## Stack técnica

| Componente | Tecnologia |
|---|---|
| Bot | Node.js 20, TypeScript, Express |
| Gateway WhatsApp | Evolution API v2.3.7 (Baileys) |
| Atendimento humano | Chatwoot |
| IA | Claude (claude-sonnet-4-6) |
| Sessões | Redis 7 |
| Banco de dados | PostgreSQL 15 |
| Containerização | Docker Compose |
