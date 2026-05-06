# 🐸 Kermit — Bot WhatsApp de Suporte TI integrado ao GLPI

Bot de atendimento no WhatsApp que integra **GLPI**, **Evolution API**, **Chatwoot** e **Claude (Anthropic)** em um único stack Docker. Permite que usuários abram chamados, consultem tickets e sejam transferidos para analistas humanos diretamente pelo WhatsApp.

## Como funciona

```
Usuário no WhatsApp
        │
        ▼
  Evolution API  ──────►  Bot (Node.js/Express)  ──────►  GLPI
  (WhatsApp)                      │                    (abre chamados,
                                  │                     busca KB)
                                  ▼
                              Chatwoot               Claude AI
                          (atendimento humano)   (busca na KB,
                           agente responde        extrai keywords)
                           e resolve conversa
                                  │
                                  ▼
                           CSAT enviado ao usuário
```

**Fluxo completo:**
1. Usuário manda mensagem → bot identifica pelo e-mail corporativo
2. Bot apresenta menu: abrir chamado, consultar tickets, onboarding
3. Ao abrir chamado, bot busca na base de conhecimento do GLPI com IA
4. Se a KB não resolver, abre o chamado no GLPI e transfere para o Chatwoot
5. Analista responde no Chatwoot → bot encaminha para o WhatsApp (bidirecional, com mídia)
6. Ao resolver a conversa no Chatwoot → bot envia pesquisa de satisfação (CSAT)

## Pré-requisitos

| Requisito | Versão mínima |
|---|---|
| Docker + Docker Compose v2 | 24+ |
| GLPI com API REST habilitada | 10+ |
| Número WhatsApp disponível para QR Code | — |
| Chave de API Anthropic | — |

> O servidor precisa ter acesso à internet para baixar as imagens Docker e o código da Evolution API no primeiro `install.sh`.

## Instalação — one liner

```bash
git clone https://github.com/lucasldantas/chatbot_glpi && cd chatbot_glpi && bash install.sh
```

O instalador interativo faz **tudo automaticamente**:
- Gera senhas seguras e cria o `.env`
- Inicializa PostgreSQL e Redis
- Faz build e migra o banco do Chatwoot
- Cria o admin do Chatwoot
- Cria a inbox WhatsApp e registra os webhooks
- Faz build e sobe o bot

Ao final só é preciso **escanear o QR Code** em `http://localhost:8080/manager`.

## Serviços e portas

| Serviço | Porta | Descrição |
|---|---|---|
| Evolution API | `8080` | Gateway WhatsApp — painel em `/manager` |
| Chatwoot | `3001` | Atendimento humano |
| Bot | `3000` | Webhooks e lógica do chatbot |
| PostgreSQL | interno | Banco de dados |
| Redis | interno | Sessões e cache |

## Documentação completa

Veja o **[MANUAL.md](MANUAL.md)** para:
- Referência de todas as variáveis de ambiente
- Mapeamento completo de mensagens personalizáveis
- Descrição de todos os flows do bot
- Comandos de manutenção e troubleshooting
- Como configurar o webhook de CSAT no GLPI
