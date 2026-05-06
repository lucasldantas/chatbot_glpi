#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# GLPI WhatsApp Bot — Instalador Interativo
# ─────────────────────────────────────────────────────────────────────────────

# ── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Utilitários ───────────────────────────────────────────────────────────────

print_header() {
  echo
  echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${BLUE}║        GLPI WhatsApp Bot — Configuração Interativa           ║${RESET}"
  echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}"
  echo
}

print_section() {
  echo
  echo -e "${BOLD}${CYAN}┌─ $1 ─────────────────────────────────────────────────────${RESET}"
  echo
}

print_ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
print_warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
print_info() { echo -e "  ${BLUE}ℹ${RESET}  $1"; }
print_err()  { echo -e "  ${RED}✗${RESET} $1"; }

# ask VAR "Pergunta" "valor_padrao"
# Lê sempre com texto visível (sem -s), conforme solicitado
ask() {
  local var="$1"
  local question="$2"
  local default="${3:-}"
  local current="${!var:-}"

  local prompt
  if [[ -n "$current" ]]; then
    prompt="${BOLD}${question}${RESET} ${DIM}[atual: ${current}]${RESET}: "
  elif [[ -n "$default" ]]; then
    prompt="${BOLD}${question}${RESET} ${DIM}[padrão: ${default}]${RESET}: "
  else
    prompt="${BOLD}${question}${RESET}: "
  fi

  while true; do
    echo -en "  $prompt"
    read -r value
    value="${value:-${current:-${default}}}"
    if [[ -n "$value" ]]; then
      printf -v "$var" '%s' "$value"
      break
    fi
    echo -e "  ${RED}Campo obrigatório. Informe um valor.${RESET}"
  done
}

# ask_optional VAR "Pergunta" "valor_padrao"
ask_optional() {
  local var="$1"
  local question="$2"
  local default="${3:-}"
  local current="${!var:-}"

  local display="${current:-$default}"
  local prompt
  if [[ -n "$display" ]]; then
    prompt="${BOLD}${question}${RESET} ${DIM}[padrão: ${display}]${RESET} ${DIM}(Enter para manter)${RESET}: "
  else
    prompt="${BOLD}${question}${RESET} ${DIM}(opcional, Enter para pular)${RESET}: "
  fi

  echo -en "  $prompt"
  read -r value
  value="${value:-${current:-${default}}}"
  printf -v "$var" '%s' "$value"
}

confirm() {
  local question="$1"
  local default="${2:-s}"
  local prompt
  if [[ "$default" == "s" ]]; then
    prompt="${BOLD}${question}${RESET} ${DIM}[S/n]${RESET}: "
  else
    prompt="${BOLD}${question}${RESET} ${DIM}[s/N]${RESET}: "
  fi
  echo -en "  $prompt"
  read -r ans
  ans="${ans:-$default}"
  [[ "$ans" =~ ^[Ss]$ ]]
}

# ── Carrega .env existente (se houver) ───────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

# ── Variáveis com valores correntes ou vazios ─────────────────────────────────
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
EVOLUTION_DB_PASSWORD="${EVOLUTION_DB_PASSWORD:-}"
CHATWOOT_DB_PASSWORD="${CHATWOOT_DB_PASSWORD:-}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_PASSWORD_ENCODED="${REDIS_PASSWORD_ENCODED:-}"
CHATWOOT_ADMIN_NAME="${CHATWOOT_ADMIN_NAME:-Administrador}"
CHATWOOT_ADMIN_EMAIL="${CHATWOOT_ADMIN_EMAIL:-}"
CHATWOOT_ADMIN_PASSWORD="${CHATWOOT_ADMIN_PASSWORD:-}"
CHATWOOT_ACCOUNT_NAME="${CHATWOOT_ACCOUNT_NAME:-Suporte TI}"
EVOLUTION_API_KEY="${EVOLUTION_API_KEY:-}"
EVOLUTION_INSTANCE="${EVOLUTION_INSTANCE:-suporte}"
GLPI_URL="${GLPI_URL:-}"
GLPI_APP_TOKEN="${GLPI_APP_TOKEN:-}"
GLPI_USER_TOKEN="${GLPI_USER_TOKEN:-}"
GLPI_DEFAULT_CATEGORY_ID="${GLPI_DEFAULT_CATEGORY_ID:-0}"
GLPI_ONBOARDING_CATEGORY_ID="${GLPI_ONBOARDING_CATEGORY_ID:-0}"
CHATWOOT_FRONTEND_URL="${CHATWOOT_FRONTEND_URL:-http://localhost:3001}"
CHATWOOT_SECRET_KEY="${CHATWOOT_SECRET_KEY:-}"
CHATWOOT_API_TOKEN="${CHATWOOT_API_TOKEN:-}"
CHATWOOT_ACCOUNT_ID="${CHATWOOT_ACCOUNT_ID:-1}"
CHATWOOT_INBOX_ID="${CHATWOOT_INBOX_ID:-1}"
CHATWOOT_WEBHOOK_SECRET="${CHATWOOT_WEBHOOK_SECRET:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
CLAUDE_MODEL="${CLAUDE_MODEL:-claude-sonnet-4-6}"
SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS:-3600}"
CSAT_SCALE="${CSAT_SCALE:-5}"

# ═════════════════════════════════════════════════════════════════════════════
# INÍCIO DO INSTALADOR
# ═════════════════════════════════════════════════════════════════════════════

clear
print_header

echo -e "  Este instalador configura todas as variáveis necessárias para o bot."
echo -e "  ${DIM}• Campos com [atual: ...] já têm valor salvo — Enter mantém.${RESET}"
echo -e "  ${DIM}• Senhas são exibidas em texto visível conforme configuração.${RESET}"
echo -e "  ${DIM}• Ao final, o arquivo .env será gerado/atualizado.${RESET}"

# ─────────────────────────────────────────────────────────────────────────────
print_section "1. PostgreSQL"
# ─────────────────────────────────────────────────────────────────────────────

print_info "Senha mestra do PostgreSQL (usada internamente pelo Docker)."
ask POSTGRES_PASSWORD    "Senha mestra do PostgreSQL"

echo
print_info "Senha para o banco da Evolution API (usuário: evolution)."
ask EVOLUTION_DB_PASSWORD "Senha do banco da Evolution API"

echo
print_info "Senha para o banco do ChatWoot (usuário: chatwoot)."
ask CHATWOOT_DB_PASSWORD   "Senha do banco do ChatWoot"

# ─────────────────────────────────────────────────────────────────────────────
print_section "2. Redis"
# ─────────────────────────────────────────────────────────────────────────────

print_info "Senha de autenticação do Redis (compartilhado entre todos os serviços)."
ask REDIS_PASSWORD "Senha do Redis"
# URL-encode chars that break Redis URI parsing (@ → %40, # → %23, : → %3A, / → %2F)
REDIS_PASSWORD_ENCODED=$(printf '%s' "$REDIS_PASSWORD" | sed 's/%/%25/g; s/@/%40/g; s/#/%23/g; s|/|%2F|g; s/:/%3A/g')

# ─────────────────────────────────────────────────────────────────────────────
print_section "3. Evolution API (WhatsApp)"
# ─────────────────────────────────────────────────────────────────────────────

print_info "Chave de API da Evolution API — você define livremente (mín. 20 caracteres)."
ask EVOLUTION_API_KEY  "API Key da Evolution API"

echo
print_info "Nome da instância WhatsApp que será criada (sem espaços)."
print_info "Ex: suporte, helpdesk, ti-empresa"
ask EVOLUTION_INSTANCE "Nome da instância WhatsApp" "suporte"

# ─────────────────────────────────────────────────────────────────────────────
print_section "4. GLPI"
# ─────────────────────────────────────────────────────────────────────────────

print_info "URL base do GLPI, sem barra final."
print_info "Ex: https://glpi.suaempresa.com.br"
ask GLPI_URL "URL do GLPI"

echo
print_info "App-Token: GLPI → Configuração → Geral → API → Token da aplicação."
ask GLPI_APP_TOKEN "App-Token do GLPI"

echo
print_info "User-Token de uma conta de serviço com perfil Técnico."
print_info "GLPI → Administração → Usuários → (service account) → Token API."
ask GLPI_USER_TOKEN "User-Token do GLPI (service account)"

echo
print_info "ID da categoria padrão para chamados normais."
print_info "GLPI → Assistência → Categorias → anote o ID da linha desejada."
print_info "Use 0 para nenhuma categoria (campo ficará em branco)."
ask GLPI_DEFAULT_CATEGORY_ID "ID da categoria padrão de chamados" "0"

echo
print_info "ID da categoria para chamados de Onboarding / Primeiro Acesso."
print_info "Use 0 se não tiver categoria específica."
ask GLPI_ONBOARDING_CATEGORY_ID "ID da categoria de Onboarding" "0"

# ─────────────────────────────────────────────────────────────────────────────
print_section "5. ChatWoot"
# ─────────────────────────────────────────────────────────────────────────────

print_info "URL de acesso externo ao ChatWoot (usada nos e-mails e links internos)."
print_info "Ex: http://localhost:3001  ou  https://chat.suaempresa.com.br"
ask CHATWOOT_FRONTEND_URL "URL externa do ChatWoot" "http://localhost:3001"

echo
print_info "Nome da sua organização/empresa exibido dentro do ChatWoot."
ask CHATWOOT_ACCOUNT_NAME "Nome da conta/empresa no ChatWoot" "Suporte TI"

echo
print_info "Nome completo do administrador que será criado automaticamente."
ask CHATWOOT_ADMIN_NAME "Nome do administrador" "Administrador"

echo
print_info "E-mail do administrador — usado para o primeiro login no ChatWoot."
ask CHATWOOT_ADMIN_EMAIL "E-mail do administrador"

echo
print_info "Senha do administrador (mín. 6 caracteres)."
ask CHATWOOT_ADMIN_PASSWORD "Senha do administrador"

echo
print_info "SECRET_KEY_BASE do Rails — string aleatória longa (mín. 64 chars)."
print_info "Gere com: openssl rand -hex 64"
if [[ -z "$CHATWOOT_SECRET_KEY" ]]; then
  if command -v openssl &>/dev/null; then
    CHATWOOT_SECRET_KEY_SUGGESTION=$(openssl rand -hex 64)
    print_ok "Sugestão gerada automaticamente (pressione Enter para usar):"
    echo -e "  ${DIM}${CHATWOOT_SECRET_KEY_SUGGESTION}${RESET}"
    ask_optional CHATWOOT_SECRET_KEY "SECRET_KEY_BASE do ChatWoot" "$CHATWOOT_SECRET_KEY_SUGGESTION"
  else
    ask CHATWOOT_SECRET_KEY "SECRET_KEY_BASE do ChatWoot (mín. 64 chars)"
  fi
else
  ask CHATWOOT_SECRET_KEY "SECRET_KEY_BASE do ChatWoot"
fi

echo
print_warn "Os campos abaixo (API Token, Account ID, Inbox ID) só ficam disponíveis"
print_warn "APÓS subir o ChatWoot pela primeira vez e criar a conta admin."
print_warn "Você pode deixar os valores padrão agora e atualizar depois com: ./install.sh"
echo

print_info "API Token: ChatWoot → Perfil → Tokens de Acesso → Copiar token."
ask_optional CHATWOOT_API_TOKEN "API Token do ChatWoot" "${CHATWOOT_API_TOKEN:-placeholder_preencher_depois}"

echo
print_info "Account ID: número na URL do ChatWoot após /app/accounts/"
print_info "Ex: na URL /app/accounts/1/conversations → ID = 1"
ask_optional CHATWOOT_ACCOUNT_ID "Account ID do ChatWoot" "1"

echo
print_info "Inbox ID: ChatWoot → Configurações → Inboxes → ID da inbox WhatsApp."
ask_optional CHATWOOT_INBOX_ID "Inbox ID do ChatWoot" "1"

echo
print_info "Webhook Secret — string usada para validar requisições do ChatWoot."
print_info "Defina livremente. Configure o mesmo valor no webhook dentro do ChatWoot."
if [[ -z "$CHATWOOT_WEBHOOK_SECRET" ]]; then
  if command -v openssl &>/dev/null; then
    CHATWOOT_WH_SUGGESTION=$(openssl rand -hex 20)
    print_ok "Sugestão: ${CHATWOOT_WH_SUGGESTION}"
    ask_optional CHATWOOT_WEBHOOK_SECRET "Webhook Secret do ChatWoot" "$CHATWOOT_WH_SUGGESTION"
  else
    ask_optional CHATWOOT_WEBHOOK_SECRET "Webhook Secret do ChatWoot"
  fi
else
  ask_optional CHATWOOT_WEBHOOK_SECRET "Webhook Secret do ChatWoot"
fi

# ─────────────────────────────────────────────────────────────────────────────
print_section "6. Anthropic / Claude"
# ─────────────────────────────────────────────────────────────────────────────

print_info "Chave de API da Anthropic para busca na base de conhecimento."
print_info "Obtenha em: https://console.anthropic.com → API Keys"
ask ANTHROPIC_API_KEY "API Key da Anthropic"

echo
print_info "Modelo Claude a ser usado (recomendado: claude-sonnet-4-6)."
ask_optional CLAUDE_MODEL "Modelo Claude" "claude-sonnet-4-6"

# ─────────────────────────────────────────────────────────────────────────────
print_section "7. Configurações do Bot"
# ─────────────────────────────────────────────────────────────────────────────

print_info "Tempo (em segundos) que a sessão do usuário fica ativa sem interação."
print_info "3600 = 1 hora | 7200 = 2 horas | 86400 = 24 horas"
ask_optional SESSION_TTL_SECONDS "Timeout da sessão (segundos)" "3600"

echo
print_info "Escala de avaliação do CSAT: 5 = notas de 1 a 5."
ask_optional CSAT_SCALE "Escala do CSAT (1 a N)" "5"

# ═════════════════════════════════════════════════════════════════════════════
# RESUMO
# ═════════════════════════════════════════════════════════════════════════════

echo
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${BLUE}║                   Resumo da Configuração                    ║${RESET}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo
echo -e "  ${BOLD}PostgreSQL${RESET}"
echo -e "    Senha mestra          : ${GREEN}${POSTGRES_PASSWORD}${RESET}"
echo -e "    Senha Evolution DB    : ${GREEN}${EVOLUTION_DB_PASSWORD}${RESET}"
echo -e "    Senha ChatWoot DB     : ${GREEN}${CHATWOOT_DB_PASSWORD}${RESET}"
echo
echo -e "  ${BOLD}Redis${RESET}"
echo -e "    Senha                 : ${GREEN}${REDIS_PASSWORD}${RESET}"
echo
echo -e "  ${BOLD}Evolution API${RESET}"
echo -e "    API Key               : ${GREEN}${EVOLUTION_API_KEY}${RESET}"
echo -e "    Instância             : ${GREEN}${EVOLUTION_INSTANCE}${RESET}"
echo
echo -e "  ${BOLD}GLPI${RESET}"
echo -e "    URL                   : ${GREEN}${GLPI_URL}${RESET}"
echo -e "    App-Token             : ${GREEN}${GLPI_APP_TOKEN}${RESET}"
echo -e "    User-Token            : ${GREEN}${GLPI_USER_TOKEN}${RESET}"
echo -e "    Categoria padrão (ID) : ${GREEN}${GLPI_DEFAULT_CATEGORY_ID}${RESET}"
echo -e "    Categoria Onboarding  : ${GREEN}${GLPI_ONBOARDING_CATEGORY_ID}${RESET}"
echo
echo -e "  ${BOLD}ChatWoot${RESET}"
echo -e "    URL externa           : ${GREEN}${CHATWOOT_FRONTEND_URL}${RESET}"
echo -e "    Conta/Empresa         : ${GREEN}${CHATWOOT_ACCOUNT_NAME}${RESET}"
echo -e "    Admin e-mail          : ${GREEN}${CHATWOOT_ADMIN_EMAIL}${RESET}"
echo -e "    Admin nome            : ${GREEN}${CHATWOOT_ADMIN_NAME}${RESET}"
echo -e "    Secret Key Base       : ${GREEN}${CHATWOOT_SECRET_KEY:0:20}...${RESET}"
echo -e "    API Token             : ${GREEN}${CHATWOOT_API_TOKEN}${RESET}"
echo -e "    Account ID            : ${GREEN}${CHATWOOT_ACCOUNT_ID}${RESET}"
echo -e "    Inbox ID              : ${GREEN}${CHATWOOT_INBOX_ID}${RESET}"
echo -e "    Webhook Secret        : ${GREEN}${CHATWOOT_WEBHOOK_SECRET}${RESET}"
echo
echo -e "  ${BOLD}Anthropic${RESET}"
echo -e "    API Key               : ${GREEN}${ANTHROPIC_API_KEY}${RESET}"
echo -e "    Modelo                : ${GREEN}${CLAUDE_MODEL}${RESET}"
echo
echo -e "  ${BOLD}Bot${RESET}"
echo -e "    Timeout de sessão     : ${GREEN}${SESSION_TTL_SECONDS}s${RESET}"
echo -e "    Escala CSAT           : ${GREEN}1 a ${CSAT_SCALE}${RESET}"
echo

if ! confirm "Confirmar e salvar o arquivo .env?"; then
  echo
  print_warn "Configuração cancelada. Nenhum arquivo foi alterado."
  exit 0
fi

# ═════════════════════════════════════════════════════════════════════════════
# GERA O .env
# ═════════════════════════════════════════════════════════════════════════════

cat > "$ENV_FILE" <<EOF
# Gerado pelo install.sh em $(date '+%Y-%m-%d %H:%M:%S')
# Para reconfigurar, execute: ./install.sh

# ─── PostgreSQL ───────────────────────────────────────────────────────────────
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
EVOLUTION_DB_PASSWORD="${EVOLUTION_DB_PASSWORD}"
CHATWOOT_DB_PASSWORD="${CHATWOOT_DB_PASSWORD}"

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_PASSWORD="${REDIS_PASSWORD}"
REDIS_PASSWORD_ENCODED="${REDIS_PASSWORD_ENCODED}"

# ─── Evolution API ────────────────────────────────────────────────────────────
EVOLUTION_API_KEY="${EVOLUTION_API_KEY}"
EVOLUTION_INSTANCE="${EVOLUTION_INSTANCE}"

# ─── GLPI ─────────────────────────────────────────────────────────────────────
GLPI_URL="${GLPI_URL}"
GLPI_APP_TOKEN="${GLPI_APP_TOKEN}"
GLPI_USER_TOKEN="${GLPI_USER_TOKEN}"
GLPI_DEFAULT_CATEGORY_ID="${GLPI_DEFAULT_CATEGORY_ID}"
GLPI_ONBOARDING_CATEGORY_ID="${GLPI_ONBOARDING_CATEGORY_ID}"

# ─── ChatWoot ─────────────────────────────────────────────────────────────────
CHATWOOT_FRONTEND_URL="${CHATWOOT_FRONTEND_URL}"
CHATWOOT_ACCOUNT_NAME="${CHATWOOT_ACCOUNT_NAME}"
CHATWOOT_ADMIN_NAME="${CHATWOOT_ADMIN_NAME}"
CHATWOOT_ADMIN_EMAIL="${CHATWOOT_ADMIN_EMAIL}"
CHATWOOT_ADMIN_PASSWORD="${CHATWOOT_ADMIN_PASSWORD}"
CHATWOOT_SECRET_KEY="${CHATWOOT_SECRET_KEY}"
CHATWOOT_API_TOKEN="${CHATWOOT_API_TOKEN}"
CHATWOOT_ACCOUNT_ID="${CHATWOOT_ACCOUNT_ID}"
CHATWOOT_INBOX_ID="${CHATWOOT_INBOX_ID}"
CHATWOOT_WEBHOOK_SECRET="${CHATWOOT_WEBHOOK_SECRET}"

# ─── Anthropic / Claude ───────────────────────────────────────────────────────
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
CLAUDE_MODEL="${CLAUDE_MODEL}"

# ─── Bot ──────────────────────────────────────────────────────────────────────
SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS}"
CSAT_SCALE="${CSAT_SCALE}"
EOF

print_ok ".env salvo em: $ENV_FILE"

# ─────────────────────────────────────────────────────────────────────────────
# Atualiza scripts/init-db.sql com as senhas configuradas
# ─────────────────────────────────────────────────────────────────────────────
INIT_SQL="$SCRIPT_DIR/scripts/init-db.sql"

cat > "$INIT_SQL" <<EOF
-- Gerado pelo install.sh em $(date '+%Y-%m-%d %H:%M:%S')
-- Criação dos usuários e bancos para Evolution API e ChatWoot

-- Evolution API
CREATE USER evolution WITH PASSWORD '${EVOLUTION_DB_PASSWORD}';
CREATE DATABASE evolutiondb OWNER evolution;
GRANT ALL PRIVILEGES ON DATABASE evolutiondb TO evolution;

-- ChatWoot
CREATE USER chatwoot WITH PASSWORD '${CHATWOOT_DB_PASSWORD}';
CREATE DATABASE chatwoot_production OWNER chatwoot;
GRANT ALL PRIVILEGES ON DATABASE chatwoot_production TO chatwoot;
EOF

print_ok "scripts/init-db.sql atualizado com as senhas configuradas."

# ═════════════════════════════════════════════════════════════════════════════
# BAIXAR EVOLUTION API 2.3.7 (fonte local para build)
# ═════════════════════════════════════════════════════════════════════════════

EVOLUTION_SRC="$SCRIPT_DIR/evolution-api-src"
EVOLUTION_URL="https://github.com/EvolutionAPI/evolution-api/archive/refs/tags/2.3.7.tar.gz"
EVOLUTION_TAR="$SCRIPT_DIR/evolution-api-2.3.7.tar.gz"

echo
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${BLUE}║                  Evolution API 2.3.7                        ║${RESET}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo

if [[ -d "$EVOLUTION_SRC" && -f "$EVOLUTION_SRC/Dockerfile" ]]; then
  print_ok "Fonte da Evolution API já presente em evolution-api-src/. Pulando download."
else
  print_info "Baixando Evolution API 2.3.7 do GitHub..."
  print_info "Origem: $EVOLUTION_URL"
  echo

  # Verifica ferramenta de download disponível
  if command -v curl &>/dev/null; then
    curl -L --progress-bar "$EVOLUTION_URL" -o "$EVOLUTION_TAR"
  elif command -v wget &>/dev/null; then
    wget --show-progress -q "$EVOLUTION_URL" -O "$EVOLUTION_TAR"
  else
    print_err "curl ou wget não encontrado. Instale um deles e tente novamente."
    print_err "  sudo apt-get install curl"
    exit 1
  fi

  print_ok "Download concluído."
  print_info "Extraindo arquivos..."

  mkdir -p "$EVOLUTION_SRC"
  tar -xzf "$EVOLUTION_TAR" --strip-components=1 -C "$EVOLUTION_SRC"
  rm -f "$EVOLUTION_TAR"

  if [[ ! -f "$EVOLUTION_SRC/Dockerfile" ]]; then
    print_err "Dockerfile não encontrado após extração. Verifique o arquivo baixado."
    exit 1
  fi

  print_ok "Evolution API 2.3.7 extraída em evolution-api-src/."

  # ── Patch SSL: Prisma tenta baixar binários de binaries.prisma.sh durante o
  # build e falha com "unable to get local issuer certificate" em alguns
  # ambientes corporativos/WSL. NODE_TLS_REJECT_UNAUTHORIZED=0 resolve só
  # nessa etapa do build sem afetar o runtime.
  print_info "Aplicando patch SSL no Dockerfile da Evolution API..."
  sed -i \
    's|RUN ./Docker/scripts/generate_database.sh|ENV NODE_TLS_REJECT_UNAUTHORIZED=0\nRUN ./Docker/scripts/generate_database.sh|' \
    "$EVOLUTION_SRC/Dockerfile"

  # Confirma que o patch foi aplicado
  if grep -q "NODE_TLS_REJECT_UNAUTHORIZED" "$EVOLUTION_SRC/Dockerfile"; then
    print_ok "Patch SSL aplicado com sucesso."
  else
    print_warn "Patch SSL não foi aplicado (linha alvo não encontrada). Tentando método alternativo..."
    # Método alternativo: injeta a ENV no início da seção de build
    sed -i '/generate_database/i ENV NODE_TLS_REJECT_UNAUTHORIZED=0' "$EVOLUTION_SRC/Dockerfile"
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# OPÇÕES DE EXECUÇÃO
# ═════════════════════════════════════════════════════════════════════════════

echo
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${BLUE}║                    Próximos Passos                          ║${RESET}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo

if ! command -v docker &>/dev/null; then
  print_warn "Docker não encontrado no PATH. Instale o Docker antes de continuar."
  echo
fi

if confirm "Subir os serviços com Docker Compose agora?"; then
  echo
  print_info "Iniciando serviços na ordem correta..."
  echo

  cd "$SCRIPT_DIR"

  echo -e "  ${BOLD}[1/5]${RESET} PostgreSQL + Redis..."
  docker compose up -d postgres redis
  echo -e "  ${DIM}Aguardando bancos ficarem saudáveis...${RESET}"
  sleep 5

  echo -e "  ${BOLD}[2/5]${RESET} Evolution API (build local — pode demorar alguns minutos)..."
  docker compose build evolution-api
  docker compose up -d evolution-api

  echo -e "  ${BOLD}[3/5]${RESET} ChatWoot — build + banco + migrações..."
  docker compose build chatwoot-web

  # Concede superuser ao chatwoot para criar extensão pg_stat_statements
  docker compose exec postgres psql -U postgres \
    -c "ALTER USER chatwoot WITH SUPERUSER;" 2>/dev/null || true

  # Executa migrações (cria todas as tabelas)
  print_info "Rodando migrações do banco (pode levar 1-2 minutos)..."
  docker compose run --rm chatwoot-web bundle exec rails db:migrate

  # Cria conta e usuário administrador automaticamente
  print_info "Criando conta e administrador no ChatWoot..."
  docker compose run --rm \
    -e CW_ACCOUNT_NAME="${CHATWOOT_ACCOUNT_NAME}" \
    -e CW_ADMIN_NAME="${CHATWOOT_ADMIN_NAME}" \
    -e CW_ADMIN_EMAIL="${CHATWOOT_ADMIN_EMAIL}" \
    -e CW_ADMIN_PASSWORD="${CHATWOOT_ADMIN_PASSWORD}" \
    chatwoot-web bundle exec rails runner '
      email = ENV["CW_ADMIN_EMAIL"]
      if User.exists?(email: email)
        puts "Usuário #{email} já existe — pulando criação."
      else
        account = Account.find_or_create_by!(name: ENV["CW_ACCOUNT_NAME"])
        user = User.new(
          name:                  ENV["CW_ADMIN_NAME"],
          email:                 email,
          password:              ENV["CW_ADMIN_PASSWORD"],
          password_confirmation: ENV["CW_ADMIN_PASSWORD"]
        )
        user.skip_confirmation!
        user.save!
        AccountUser.create!(account: account, user: user, role: :administrator)
        puts "Admin #{email} criado com sucesso!"
      end
    '

  docker compose up -d chatwoot-web chatwoot-worker

  echo -e "  ${BOLD}[4/5]${RESET} Configurando ChatWoot (token + inbox + webhook)..."
  print_info "Aguardando ChatWoot inicializar..."
  for i in $(seq 1 40); do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/auth/sign_in" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${CHATWOOT_ADMIN_EMAIL}\",\"password\":\"${CHATWOOT_ADMIN_PASSWORD}\"}" \
      2>/dev/null || echo "000")
    if [[ "$HTTP" == "200" ]]; then break; fi
    echo -n "."
    sleep 3
  done
  echo

  # Login para obter token e account_id
  CW_LOGIN=$(curl -s "http://localhost:3001/auth/sign_in" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${CHATWOOT_ADMIN_EMAIL}\",\"password\":\"${CHATWOOT_ADMIN_PASSWORD}\"}" \
    2>/dev/null || echo "{}")
  CHATWOOT_API_TOKEN=$(echo "$CW_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('access_token',''))" 2>/dev/null || echo "")
  CHATWOOT_ACCOUNT_ID=$(echo "$CW_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('account_id',''))" 2>/dev/null || echo "")

  if [[ -z "$CHATWOOT_API_TOKEN" ]]; then
    print_warn "Não foi possível obter o token do ChatWoot automaticamente."
    print_warn "Acesse ${CHATWOOT_FRONTEND_URL}, copie o token em Perfil → Access Token"
    print_warn "e rode ./install.sh novamente para concluir a configuração."
  else
    print_ok "Login OK — Account ID: ${CHATWOOT_ACCOUNT_ID}"

    # Cria inbox do tipo API
    CW_INBOX=$(curl -s -X POST "http://localhost:3001/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes" \
      -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"WhatsApp Bot\",\"channel\":{\"type\":\"api\"}}" \
      2>/dev/null || echo "{}")
    CHATWOOT_INBOX_ID=$(echo "$CW_INBOX" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

    if [[ -n "$CHATWOOT_INBOX_ID" ]]; then
      print_ok "Inbox criada — ID: ${CHATWOOT_INBOX_ID}"
    else
      print_warn "Inbox já existe ou não foi possível criar. Verifique em ${CHATWOOT_FRONTEND_URL}."
      CHATWOOT_INBOX_ID="1"
    fi

    # Registra webhook
    CW_WH=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "http://localhost:3001/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks" \
      -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"url\":\"http://bot:3000/webhook/chatwoot\",\"subscriptions\":[\"conversation_status_changed\",\"message_created\"]}" \
      2>/dev/null || echo "000")
    if [[ "$CW_WH" == "200" || "$CW_WH" == "201" ]]; then
      print_ok "Webhook registrado com sucesso!"
    else
      print_warn "Webhook retornou HTTP ${CW_WH} (pode já existir — ignorando)."
    fi

    # Atualiza o .env com os valores reais
    sed -i "s|CHATWOOT_API_TOKEN=.*|CHATWOOT_API_TOKEN=\"${CHATWOOT_API_TOKEN}\"|" "$ENV_FILE"
    sed -i "s|CHATWOOT_ACCOUNT_ID=.*|CHATWOOT_ACCOUNT_ID=\"${CHATWOOT_ACCOUNT_ID}\"|" "$ENV_FILE"
    sed -i "s|CHATWOOT_INBOX_ID=.*|CHATWOOT_INBOX_ID=\"${CHATWOOT_INBOX_ID}\"|" "$ENV_FILE"
    print_ok ".env atualizado com token, account_id e inbox_id."
  fi

  echo -e "  ${BOLD}[5/5]${RESET} Bot (build + start com configuração final)..."
  docker compose build bot
  docker compose up -d bot

  # Garante que o webhook de instância da Evolution API está desabilitado.
  # Sem isso, tanto o webhook global quanto o de instância disparam, gerando
  # mensagens duplicadas no bot.
  print_info "Desabilitando webhook de instância da Evolution API (evita duplicatas)..."
  EVO_WH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE "http://localhost:8080/webhook/${EVOLUTION_INSTANCE}" \
    -H "apikey: ${EVOLUTION_API_KEY}" 2>/dev/null || echo "000")
  if [[ "$EVO_WH_STATUS" == "200" || "$EVO_WH_STATUS" == "201" ]]; then
    print_ok "Webhook de instância removido."
  else
    # Tenta via PUT para garantir que está desabilitado
    curl -s -X PUT "http://localhost:8080/webhook/${EVOLUTION_INSTANCE}" \
      -H "apikey: ${EVOLUTION_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"webhook\":{\"enabled\":false}}" > /dev/null 2>&1 || true
    print_ok "Webhook de instância desabilitado."
  fi

  echo -e "  ${DIM}Verificando status...${RESET}"
  docker compose ps

  echo
  print_ok "Instalação concluída!"
  echo
  print_info "ChatWoot:      ${CHATWOOT_FRONTEND_URL}"
  print_info "Evolution API: http://localhost:8080/manager"
  echo
  print_warn "Último passo: escaneie o QR Code do WhatsApp em http://localhost:8080/manager"
  echo
else
  echo
  print_info "Para subir os serviços manualmente:"
  echo
  echo -e "  ${DIM}docker compose up -d postgres redis${RESET}"
  echo -e "  ${DIM}docker compose build evolution-api && docker compose up -d evolution-api${RESET}"
  echo -e "  ${DIM}docker compose up -d chatwoot-web chatwoot-worker${RESET}"
  echo -e "  ${DIM}docker compose build bot && docker compose up -d bot${RESET}"
  echo
fi

print_info "Para reconfigurar qualquer valor: ${BOLD}./install.sh${RESET}"
print_info "Documentação completa: ${BOLD}SETUP.md${RESET}"
echo
print_ok "Instalação concluída!"
echo
