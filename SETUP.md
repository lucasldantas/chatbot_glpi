# Setup — GLPI WhatsApp Bot

## Pré-requisitos
- Docker + Docker Compose v2
- Número WhatsApp Business disponível para escanear QR code
- GLPI 11 com API REST habilitada
- Chave de API Anthropic (Claude)

---

## Instalação automática (caminho feliz)

```bash
./install.sh
```

O instalador faz tudo automaticamente:
1. Gera o `.env` com todas as variáveis
2. Inicializa os bancos (PostgreSQL + Redis)
3. Constrói a imagem do ChatWoot e executa migrações
4. Cria o usuário administrador do ChatWoot
5. Cria a inbox WhatsApp Bot e registra o webhook
6. Sobe todos os serviços incluindo o bot

Ao final, só é necessário **escanear o QR Code** em `http://localhost:8080/manager`.

---

## Fallback — passos manuais por etapa

Use esta seção se alguma etapa do `install.sh` falhar.

---

### F1. Banco de dados do ChatWoot

**Erro:** `permission denied to create extension "pg_stat_statements"`

```bash
docker compose exec postgres psql -U postgres -c "ALTER USER chatwoot WITH SUPERUSER;"
docker compose run --rm chatwoot-web bundle exec rails db:migrate
docker compose restart chatwoot-web chatwoot-worker
```

---

### F2. Administrador do ChatWoot

**Erro:** tela de login sem usuário cadastrado

```bash
docker compose run --rm \
  -e CW_ACCOUNT_NAME="Suporte TI" \
  -e CW_ADMIN_NAME="Administrador" \
  -e CW_ADMIN_EMAIL="seu@email.com" \
  -e CW_ADMIN_PASSWORD="suasenha" \
  chatwoot-web bundle exec rails runner '
    email = ENV["CW_ADMIN_EMAIL"]
    if User.exists?(email: email)
      puts "Usuário já existe."
    else
      account = Account.find_or_create_by!(name: ENV["CW_ACCOUNT_NAME"])
      user = User.new(name: ENV["CW_ADMIN_NAME"], email: email,
                      password: ENV["CW_ADMIN_PASSWORD"],
                      password_confirmation: ENV["CW_ADMIN_PASSWORD"])
      user.skip_confirmation!
      user.save!
      AccountUser.create!(account: account, user: user, role: :administrator)
      puts "Admin criado!"
    end
  '
```

---

### F3. Token e Account ID do ChatWoot

**Obter via API (sem abrir o navegador):**

```bash
curl -s "http://localhost:3001/auth/sign_in" \
  -H "Content-Type: application/json" \
  -d '{"email":"seu@email.com","password":"suasenha"}' | python3 -m json.tool
```

Anote `access_token` e `account_id` e atualize o `.env`:

```bash
sed -i 's|CHATWOOT_API_TOKEN=.*|CHATWOOT_API_TOKEN="SEU_TOKEN"|' .env
sed -i 's|CHATWOOT_ACCOUNT_ID=.*|CHATWOOT_ACCOUNT_ID="1"|' .env
```

Ou via UI: **ChatWoot → Perfil (canto inferior esquerdo) → Access Tokens → copiar token**

---

### F4. Inbox do ChatWoot

**Criar via API** (a UI rejeita URLs internas como `http://bot:...`):

```bash
source .env
curl -s -X POST "http://localhost:3001/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes" \
  -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"WhatsApp Bot","channel":{"type":"api","webhook_url":"http://bot:3000/webhook/chatwoot"}}' \
  | python3 -m json.tool
```

Anote o `id` retornado e atualize o `.env`:

```bash
sed -i 's|CHATWOOT_INBOX_ID=.*|CHATWOOT_INBOX_ID="ID_AQUI"|' .env
```

---

### F5. Webhook do ChatWoot → Bot

> **Atenção:** No ChatWoot v3.x o endpoint mudou — não use `integrations/webhooks`.

```bash
source .env
curl -s -X POST "http://localhost:3001/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks" \
  -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://bot:3000/webhook/chatwoot","subscriptions":["conversation_status_changed","message_created"]}' \
  | python3 -m json.tool
```

Para verificar se já existe:

```bash
curl -s "http://localhost:3001/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks" \
  -H "api_access_token: ${CHATWOOT_API_TOKEN}" | python3 -m json.tool
```

---

### F6. Instância e Webhook da Evolution API

**Criar instância via API:**

```bash
source .env
curl -s -X POST "http://localhost:8080/instance/create" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"instanceName\":\"${EVOLUTION_INSTANCE}\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\"}" \
  | python3 -m json.tool
```

**Configurar webhook manualmente no painel** (`http://localhost:8080/manager`):
- Selecione a instância → **Webhook**
- URL: `http://bot:3000/webhook/evolution`
- Eventos: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`

**Ou via API:**

```bash
curl -s -X POST "http://localhost:8080/webhook/set/${EVOLUTION_INSTANCE}" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://bot:3000/webhook/evolution",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE"]
  }' | python3 -m json.tool
```

**Escanear QR Code:**

Acesse `http://localhost:8080/manager`, selecione a instância e escaneie com o WhatsApp Business.

---

### F7. Bot não inicia / variáveis faltando

Após qualquer alteração no `.env`, reinicie o bot:

```bash
docker compose up -d --force-recreate bot
```

Verifique os logs:

```bash
docker compose logs bot -f
```

---

## 5. Configurar notificação de CSAT no GLPI

No GLPI: **Configuração → Notificações → Notificações → Nova notificação**

- Evento: **Chamado (Modificado)**
- Filtro: Status = Fechado
- Notificador: **Webhook HTTP**
- URL: `http://SEU_IP_SERVIDOR:3000/webhook/glpi`
- Método: POST
- Corpo JSON:

```json
{
  "ticket_id": "##ticket.id##",
  "user_phone": "##requester.mobile##",
  "status": "##ticket.status##"
}
```

> **Importante:** O campo `requester.mobile` deve conter o número WhatsApp do usuário. Verifique em: **Administração → Usuários → Telefone celular**.

---

## Fluxo de mensagens (resumo técnico)

```
WhatsApp → Evolution API → POST /webhook/evolution → Bot
                                                        │
                                             (estado no Redis)
                                                        │
                                        ┌───────────────┴────────────────┐
                                        │                                │
                                   Bot states                   HUMAN_HANDOFF
                                   (flows/*.ts)                       │
                                                           Forward → ChatWoot API
                                                           Agente responde
                                                           ChatWoot → POST /webhook/chatwoot
                                                           Bot → Evolution API → WhatsApp
                                                                        │
                                                           Conversa resolvida
                                                           → CSAT enviado ao usuário
```

---

## Variáveis de ambiente — referência rápida

| Variável | Onde obter |
|---|---|
| `POSTGRES_PASSWORD` | Defina livremente |
| `REDIS_PASSWORD` | Defina livremente |
| `EVOLUTION_API_KEY` | Defina livremente (mín. 20 chars) |
| `EVOLUTION_INSTANCE` | Nome escolhido ao criar a instância |
| `GLPI_APP_TOKEN` | GLPI → Configuração → Geral → API → Token da aplicação |
| `GLPI_USER_TOKEN` | GLPI → Administração → Usuários → (service account) → Token API |
| `CHATWOOT_API_TOKEN` | ChatWoot → Perfil → Access Tokens (ou fallback F3) |
| `CHATWOOT_ACCOUNT_ID` | Número na URL `/app/accounts/1/` (ou fallback F3) |
| `CHATWOOT_INBOX_ID` | Retornado ao criar a inbox (ou fallback F4) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

---

## Comandos úteis

```bash
# Ver status de todos os containers
docker compose ps

# Logs em tempo real
docker compose logs bot -f
docker compose logs chatwoot-web -f
docker compose logs evolution-api -f

# Reiniciar um serviço
docker compose restart bot

# Parar tudo (preserva dados)
docker compose down

# Apagar tudo incluindo volumes (reinstalação limpa)
docker compose down -v --remove-orphans
docker image rm -f chatbot-chatwoot:local
rm .env
./install.sh
```
