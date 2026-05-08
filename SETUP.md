# Setup — GLPI WhatsApp Bot

## Instalação automática

```bash
bash install.sh
```

O instalador guia por 9 etapas e sobe todos os serviços automaticamente. Ao final, escaneie o QR Code em `http://localhost:8080/manager`.

---

## Fallbacks manuais

Use esta seção se alguma etapa do `install.sh` falhar ou para reconfigurar individualmente.

---

### F1. PostgreSQL — permissão de superuser para o Chatwoot

**Erro:** `permission denied to create extension "pg_stat_statements"`

```bash
docker compose exec postgres psql -U postgres \
  -c "ALTER USER chatwoot WITH SUPERUSER;"
docker compose run --rm chatwoot-web bundle exec rails db:migrate
docker compose restart chatwoot-web chatwoot-worker
```

---

### F2. Migrações do banco do Chatwoot

```bash
docker compose run --rm chatwoot-web bundle exec rails db:migrate
```

---

### F3. Criar administrador do Chatwoot manualmente

```bash
docker compose run --rm \
  -e CW_ACCOUNT_NAME="Nome da Empresa" \
  -e CW_ADMIN_NAME="Administrador" \
  -e CW_ADMIN_EMAIL="admin@empresa.com" \
  -e CW_ADMIN_PASSWORD="suasenha123" \
  chatwoot-web bundle exec rails runner '
    email = ENV["CW_ADMIN_EMAIL"]
    if User.exists?(email: email)
      puts "Usuário já existe."
    else
      account = Account.find_or_create_by!(name: ENV["CW_ACCOUNT_NAME"])
      user = User.new(
        name: ENV["CW_ADMIN_NAME"], email: email,
        password: ENV["CW_ADMIN_PASSWORD"],
        password_confirmation: ENV["CW_ADMIN_PASSWORD"]
      )
      user.skip_confirmation!; user.save!
      AccountUser.create!(account: account, user: user, role: :administrator)
      puts "Admin criado com sucesso!"
    end
  '
```

---

### F4. Obter token e Account ID do Chatwoot

```bash
curl -s "http://localhost:3001/auth/sign_in" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"suasenha"}' \
  | python3 -m json.tool
```

Anote `access_token` e `account_id`, atualize o `.env` e recrié o bot:

```bash
sed -i 's|CHATWOOT_API_TOKEN=.*|CHATWOOT_API_TOKEN="SEU_TOKEN"|' .env
sed -i 's|CHATWOOT_ACCOUNT_ID=.*|CHATWOOT_ACCOUNT_ID="1"|' .env
docker compose up -d --force-recreate bot
```

---

### F5. Criar inbox WhatsApp no Chatwoot

> A UI do Chatwoot rejeita URLs internas como `http://bot:...`. Crie via API:

```bash
source .env
curl -s -X POST "http://localhost:3001/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes" \
  -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"WhatsApp Bot","channel":{"type":"api"}}' \
  | python3 -m json.tool
```

Anote o `id` retornado e atualize:

```bash
sed -i 's|CHATWOOT_INBOX_ID=.*|CHATWOOT_INBOX_ID="ID_AQUI"|' .env
docker compose up -d --force-recreate bot
```

---

### F6. Registrar webhook do Chatwoot → Bot

```bash
source .env
curl -s -X POST "http://localhost:3001/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks" \
  -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://bot:3000/webhook/chatwoot",
    "subscriptions": ["conversation_status_changed", "message_created"]
  }' | python3 -m json.tool
```

Verificar webhooks existentes:

```bash
curl -s "http://localhost:3001/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks" \
  -H "api_access_token: ${CHATWOOT_API_TOKEN}" | python3 -m json.tool
```

---

### F7. Instância e QR Code da Evolution API

Criar instância manualmente:

```bash
source .env
curl -s -X POST "http://localhost:8080/instance/create" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"instanceName\": \"${EVOLUTION_INSTANCE}\",
    \"qrcode\": true,
    \"integration\": \"WHATSAPP-BAILEYS\"
  }" | python3 -m json.tool
```

Escanear QR Code: acesse `http://localhost:8080/manager`, selecione a instância e escaneie com o WhatsApp Business.

---

### F8. Desabilitar webhook de instância (evita mensagens duplicadas)

```bash
source .env
# Tenta remover
curl -s -o /dev/null -X DELETE "http://localhost:8080/webhook/${EVOLUTION_INSTANCE}" \
  -H "apikey: ${EVOLUTION_API_KEY}"

# Ou desabilitar
curl -s -X PUT "http://localhost:8080/webhook/${EVOLUTION_INSTANCE}" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":false}}'
```

---

### F9. Bot não inicia após mudança no .env

```bash
# Recriar sem rebuild (apenas relê variáveis)
docker compose up -d --force-recreate bot

# Ver logs de erro
docker compose logs bot --tail=50
```

---

### F10. Reinstalação limpa

```bash
docker compose down -v --remove-orphans
docker image rm -f chatbot-chatwoot:local
rm -f .env scripts/init-db.sql
bash install.sh
```

---

## Verificar saúde dos serviços

```bash
# Bot
curl -s http://localhost:3000/health
# → {"status":"ok","ts":"..."}

# Instância WhatsApp
source .env
curl -s "http://localhost:8080/instance/connectionState/${EVOLUTION_INSTANCE}" \
  -H "apikey: ${EVOLUTION_API_KEY}" | python3 -m json.tool
# → "connectionStatus": "open"

# Todos os containers
docker compose ps
```

---

## Referência rápida de variáveis

| Variável | Onde obter |
|---|---|
| `GLPI_APP_TOKEN` | GLPI → Configuração → Geral → API → Token da aplicação |
| `GLPI_USER_TOKEN` | GLPI → Administração → Usuários → (service account) → Token API |
| `CHATWOOT_API_TOKEN` | ChatWoot → Perfil → Access Tokens |
| `CHATWOOT_ACCOUNT_ID` | Número na URL `/app/accounts/1/` |
| `CHATWOOT_INBOX_ID` | Retornado ao criar a inbox (F5 acima) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `JUMPCLOUD_API_KEY` | JumpCloud → Admin → API Settings → API Key |
| `EVOLUTION_API_KEY` | Defina livremente (mín. 20 chars) |
| `REDIS_PASSWORD` | Defina livremente |
| `POSTGRES_PASSWORD` | Defina livremente |
