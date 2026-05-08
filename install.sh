#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
#  GLPI WhatsApp Bot — Instalador Interativo
# ══════════════════════════════════════════════════════════════════════════════

# ─── Cores ────────────────────────────────────────────────────────────────────
C_RED='\033[0;31m';    C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'
C_BLUE='\033[0;34m';   C_CYAN='\033[0;36m';  C_BOLD='\033[1m'
C_DIM='\033[2m';       C_RESET='\033[0m'

TOTAL_SECTIONS=9

# ─── Cabeçalho de seção ───────────────────────────────────────────────────────
section() {
  local num="$1" title="$2"
  clear
  echo
  echo -e "  ${C_BOLD}${C_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "  ${C_BOLD}  GLPI WhatsApp Bot${C_RESET}  ${C_DIM}•  Etapa ${num} de ${TOTAL_SECTIONS}${C_RESET}"
  echo -e "  ${C_BOLD}${C_CYAN}  ${title}${C_RESET}"
  echo -e "  ${C_BOLD}${C_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo
}

# ─── Utilitários de saída ─────────────────────────────────────────────────────
ok()   { echo -e "  ${C_GREEN}✓${C_RESET}  $*"; }
warn() { echo -e "  ${C_YELLOW}⚠${C_RESET}   $*"; }
info() { echo -e "  ${C_BLUE}ℹ${C_RESET}   $*"; }
err()  { echo -e "  ${C_RED}✗${C_RESET}  $*"; }

# ─── Step com spinner ─────────────────────────────────────────────────────────
step() {
  local label="$1"; shift

  # Constrói linha com pontos até 46 chars
  local vis="$label"
  while [[ ${#vis} -lt 46 ]]; do vis="${vis}."; done

  # Spinner em background
  (
    local f=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while true; do
      printf "\r  \033[1m%s\033[0m \033[33m%s\033[0m" "$vis" "${f[$i]}"
      i=$(( (i+1) % 10 ))
      sleep 0.08
    done
  ) &
  local spin=$!

  local log; log=$(mktemp)
  local rc=0
  "$@" >"$log" 2>&1 || rc=$?

  kill $spin 2>/dev/null; wait $spin 2>/dev/null || true

  if [[ $rc -eq 0 ]]; then
    printf "\r  \033[1m%s\033[0m [\033[32m OK \033[0m]\n" "$vis"
  else
    printf "\r  \033[1m%s\033[0m [\033[31mERRO\033[0m]\n" "$vis"
    echo
    grep -v '^[[:space:]]*$' "$log" | tail -8 | sed 's/^/    /'
    rm -f "$log"; echo; return 1
  fi
  rm -f "$log"
}

# ─── Entrada de dados ─────────────────────────────────────────────────────────
ask() {
  local var="$1" question="$2" default="${3:-}"
  local current="${!var:-}"
  local prompt

  if   [[ -n "$current" ]];  then prompt="${C_BOLD}${question}${C_RESET} ${C_DIM}[atual: ${current}]${C_RESET}: "
  elif [[ -n "$default" ]];  then prompt="${C_BOLD}${question}${C_RESET} ${C_DIM}[padrão: ${default}]${C_RESET}: "
  else                             prompt="${C_BOLD}${question}${C_RESET}: "
  fi

  while true; do
    echo -en "  $prompt"; read -r value
    value="${value:-${current:-${default}}}"
    if [[ -n "$value" ]]; then printf -v "$var" '%s' "$value"; break; fi
    err "Campo obrigatório."
  done
}

ask_opt() {
  local var="$1" question="$2" default="${3:-}"
  local current="${!var:-}"
  local display="${current:-$default}"
  local prompt

  if [[ -n "$display" ]]; then
    prompt="${C_BOLD}${question}${C_RESET} ${C_DIM}[padrão: ${display}]${C_RESET} ${C_DIM}(Enter para manter)${C_RESET}: "
  else
    prompt="${C_BOLD}${question}${C_RESET} ${C_DIM}(opcional)${C_RESET}: "
  fi

  echo -en "  $prompt"; read -r value
  value="${value:-${current:-${default}}}"
  printf -v "$var" '%s' "$value"
}

confirm() {
  local question="$1" default="${2:-s}"
  local hint; [[ "$default" == "s" ]] && hint="S/n" || hint="s/N"
  echo -en "  ${C_BOLD}${question}${C_RESET} ${C_DIM}[${hint}]${C_RESET}: "
  read -r ans; ans="${ans:-$default}"
  [[ "$ans" =~ ^[Ss]$ ]]
}

# ─── Carrega .env existente ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }

# ─── Valores padrão ───────────────────────────────────────────────────────────
BOT_COMPANY_NAME="${BOT_COMPANY_NAME:-}"
BOT_NAME="${BOT_NAME:-Assistente}"
BOT_SUPPORT_TEAM="${BOT_SUPPORT_TEAM:-Suporte TI}"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
EVOLUTION_DB_PASSWORD="${EVOLUTION_DB_PASSWORD:-}"
CHATWOOT_DB_PASSWORD="${CHATWOOT_DB_PASSWORD:-}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_PASSWORD_ENCODED="${REDIS_PASSWORD_ENCODED:-}"

EVOLUTION_API_KEY="${EVOLUTION_API_KEY:-}"
EVOLUTION_INSTANCE="${EVOLUTION_INSTANCE:-suporte}"

GLPI_URL="${GLPI_URL:-}"
GLPI_APP_TOKEN="${GLPI_APP_TOKEN:-}"
GLPI_USER_TOKEN="${GLPI_USER_TOKEN:-}"
GLPI_DEFAULT_CATEGORY_ID="${GLPI_DEFAULT_CATEGORY_ID:-0}"
GLPI_ONBOARDING_CATEGORY_ID="${GLPI_ONBOARDING_CATEGORY_ID:-0}"

CHATWOOT_FRONTEND_URL="${CHATWOOT_FRONTEND_URL:-http://localhost:3001}"
CHATWOOT_ACCOUNT_NAME="${CHATWOOT_ACCOUNT_NAME:-Suporte TI}"
CHATWOOT_ADMIN_NAME="${CHATWOOT_ADMIN_NAME:-Administrador}"
CHATWOOT_ADMIN_EMAIL="${CHATWOOT_ADMIN_EMAIL:-}"
CHATWOOT_ADMIN_PASSWORD="${CHATWOOT_ADMIN_PASSWORD:-}"
CHATWOOT_SECRET_KEY="${CHATWOOT_SECRET_KEY:-}"
CHATWOOT_API_TOKEN="${CHATWOOT_API_TOKEN:-}"
CHATWOOT_ACCOUNT_ID="${CHATWOOT_ACCOUNT_ID:-1}"
CHATWOOT_INBOX_ID="${CHATWOOT_INBOX_ID:-1}"
CHATWOOT_WEBHOOK_SECRET="${CHATWOOT_WEBHOOK_SECRET:-}"

ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
CLAUDE_MODEL="${CLAUDE_MODEL:-claude-sonnet-4-6}"

JUMPCLOUD_ENABLED="${JUMPCLOUD_ENABLED:-false}"
JUMPCLOUD_API_KEY="${JUMPCLOUD_API_KEY:-}"

SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS:-3600}"

# ══════════════════════════════════════════════════════════════════════════════
#  TELA DE BOAS-VINDAS
# ══════════════════════════════════════════════════════════════════════════════
clear
echo
echo -e "  ${C_BOLD}${C_BLUE}┌──────────────────────────────────────────────────────────┐${C_RESET}"
echo -e "  ${C_BOLD}${C_BLUE}│                                                          │${C_RESET}"
echo -e "  ${C_BOLD}${C_BLUE}│        GLPI  WhatsApp  Bot  —  Instalador                │${C_RESET}"
echo -e "  ${C_BOLD}${C_BLUE}│                                                          │${C_RESET}"
echo -e "  ${C_BOLD}${C_BLUE}└──────────────────────────────────────────────────────────┘${C_RESET}"
echo
echo -e "  Sistema de atendimento inteligente via WhatsApp integrado ao GLPI."
echo
echo -e "  ${C_DIM}• Campos com [atual: ...] já têm valor salvo — Enter mantém.${C_RESET}"
echo -e "  ${C_DIM}• Ao final, o arquivo .env será gerado e os serviços sobem.${C_RESET}"
echo
echo -en "  ${C_BOLD}Pressione Enter para iniciar...${C_RESET}"; read -r

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 1 — IDENTIDADE DA EMPRESA
# ══════════════════════════════════════════════════════════════════════════════
section 1 "Identidade da Empresa"

info "Essas informações aparecem nas mensagens enviadas pelo bot."
echo

ask BOT_COMPANY_NAME  "Nome da empresa"                    "Minha Empresa"
echo
ask BOT_NAME          "Nome do assistente virtual (bot)"   "Assistente"
echo
ask BOT_SUPPORT_TEAM  "Nome do time de suporte"            "Suporte TI"
echo
ask CHATWOOT_ACCOUNT_NAME "Nome da conta no ChatWoot"      "${BOT_COMPANY_NAME:-Suporte TI}"

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 2 — INFRAESTRUTURA
# ══════════════════════════════════════════════════════════════════════════════
section 2 "Infraestrutura (PostgreSQL + Redis)"

info "Senhas internas usadas pelo Docker — não precisam ser memorizadas."
echo
ask POSTGRES_PASSWORD     "Senha mestra do PostgreSQL"
echo
ask EVOLUTION_DB_PASSWORD "Senha do banco da Evolution API"
echo
ask CHATWOOT_DB_PASSWORD  "Senha do banco do ChatWoot"
echo
ask REDIS_PASSWORD        "Senha do Redis"

REDIS_PASSWORD_ENCODED=$(printf '%s' "$REDIS_PASSWORD" \
  | sed 's/%/%25/g; s/@/%40/g; s/#/%23/g; s|/|%2F|g; s/:/%3A/g')

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 3 — EVOLUTION API (WHATSAPP)
# ══════════════════════════════════════════════════════════════════════════════
section 3 "Evolution API (WhatsApp)"

info "Gateway que conecta o bot ao WhatsApp via QR Code."
echo
ask EVOLUTION_API_KEY  "API Key da Evolution API (mín. 20 chars)"
echo
info "Nome da instância WhatsApp — sem espaços (ex: suporte, helpdesk)."
ask EVOLUTION_INSTANCE "Nome da instância WhatsApp" "suporte"

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 4 — GLPI
# ══════════════════════════════════════════════════════════════════════════════
section 4 "GLPI"

info "Configure a API REST do GLPI para criação e consulta de chamados."
echo
info "URL base sem barra final. Ex: https://glpi.suaempresa.com.br"
ask GLPI_URL "URL do GLPI"
echo
info "App-Token: GLPI → Configuração → Geral → API → Token da aplicação."
ask GLPI_APP_TOKEN "App-Token do GLPI"
echo
info "User-Token de uma conta de serviço com perfil Técnico."
info "GLPI → Administração → Usuários → (service account) → Token API."
ask GLPI_USER_TOKEN "User-Token do GLPI (service account)"
echo
info "IDs de categoria de chamados (0 = sem categoria)."
info "GLPI → Assistência → Categorias → veja o ID na linha desejada."
ask GLPI_DEFAULT_CATEGORY_ID     "ID da categoria padrão de chamados"  "0"
echo
ask GLPI_ONBOARDING_CATEGORY_ID  "ID da categoria de Onboarding"       "0"

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 5 — CHATWOOT
# ══════════════════════════════════════════════════════════════════════════════
section 5 "ChatWoot"

info "Plataforma de atendimento humano integrada ao bot."
echo
info "URL de acesso externo. Ex: http://localhost:3001 ou https://chat.empresa.com"
ask CHATWOOT_FRONTEND_URL "URL externa do ChatWoot" "http://localhost:3001"
echo
ask CHATWOOT_ADMIN_NAME     "Nome completo do administrador"  "Administrador"
echo
ask CHATWOOT_ADMIN_EMAIL    "E-mail do administrador"
echo
ask CHATWOOT_ADMIN_PASSWORD "Senha do administrador (mín. 6 chars)"
echo
info "SECRET_KEY_BASE — string aleatória longa (mín. 64 chars)."
if [[ -z "$CHATWOOT_SECRET_KEY" ]] && command -v openssl &>/dev/null; then
  local_sug=$(openssl rand -hex 64)
  ok "Sugestão gerada automaticamente (Enter para usar):"
  echo -e "  ${C_DIM}${local_sug}${C_RESET}"
  ask_opt CHATWOOT_SECRET_KEY "SECRET_KEY_BASE do ChatWoot" "$local_sug"
else
  ask CHATWOOT_SECRET_KEY "SECRET_KEY_BASE do ChatWoot"
fi
echo
warn "Os campos abaixo só ficam disponíveis APÓS o ChatWoot subir pela 1ª vez."
warn "Se estiver reinstalando, eles serão preenchidos automaticamente."
echo
ask_opt CHATWOOT_API_TOKEN      "API Token do ChatWoot"   "${CHATWOOT_API_TOKEN:-placeholder}"
echo
ask_opt CHATWOOT_ACCOUNT_ID     "Account ID do ChatWoot"  "1"
echo
ask_opt CHATWOOT_INBOX_ID       "Inbox ID do ChatWoot"    "1"
echo
info "Webhook Secret — defina livremente. Configure o mesmo no painel do ChatWoot."
if [[ -z "$CHATWOOT_WEBHOOK_SECRET" ]] && command -v openssl &>/dev/null; then
  wh_sug=$(openssl rand -hex 20)
  ok "Sugestão: ${wh_sug}"
  ask_opt CHATWOOT_WEBHOOK_SECRET "Webhook Secret do ChatWoot" "$wh_sug"
else
  ask_opt CHATWOOT_WEBHOOK_SECRET "Webhook Secret do ChatWoot"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 6 — ANTHROPIC / CLAUDE
# ══════════════════════════════════════════════════════════════════════════════
section 6 "Anthropic / Claude (IA)"

info "Usada para busca inteligente na KB e geração automática de artigos."
info "Obtenha em: https://console.anthropic.com → API Keys"
echo
ask ANTHROPIC_API_KEY "API Key da Anthropic"
echo
ask_opt CLAUDE_MODEL "Modelo Claude" "claude-sonnet-4-6"

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 7 — JUMPCLOUD (AUTENTICAÇÃO)
# ══════════════════════════════════════════════════════════════════════════════
section 7 "JumpCloud (Autenticação)"

echo -e "  O bot pode validar usuários de duas formas:\n"
echo -e "  ${C_BOLD}  [S] Com JumpCloud${C_RESET}  — verifica e-mail, conta ativa e CPF (4 dígitos)"
echo -e "  ${C_BOLD}  [N] Sem JumpCloud${C_RESET}  — valida apenas pelo GLPI (somente e-mail)"
echo
warn "Modo visitante/anônimo está desabilitado em ambos os casos."
echo

_jc_default="n"
[[ "$JUMPCLOUD_ENABLED" == "true" ]] && _jc_default="s"

if confirm "Habilitar autenticação via JumpCloud?" "$_jc_default"; then
  JUMPCLOUD_ENABLED="true"
  echo
  info "Chave de API do JumpCloud."
  info "JumpCloud → Admin → API Settings → API Key"
  echo
  ask JUMPCLOUD_API_KEY "API Key do JumpCloud"
  ok "JumpCloud habilitado — autenticação com e-mail + CPF ativada."
else
  JUMPCLOUD_ENABLED="false"
  JUMPCLOUD_API_KEY=""
  ok "JumpCloud desabilitado — autenticação somente via GLPI."
fi

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 8 — CONFIGURAÇÕES DO BOT
# ══════════════════════════════════════════════════════════════════════════════
section 8 "Configurações do Bot"

info "Timeout de sessão: tempo (em segundos) sem interação para expirar a sessão."
info "3600 = 1 h  |  7200 = 2 h  |  86400 = 24 h"
echo
ask_opt SESSION_TTL_SECONDS "Timeout da sessão (segundos)" "3600"

# ══════════════════════════════════════════════════════════════════════════════
#  ETAPA 9 — RESUMO
# ══════════════════════════════════════════════════════════════════════════════
section 9 "Resumo da Configuração"

_jc_status="Desabilitado"
[[ "$JUMPCLOUD_ENABLED" == "true" ]] && _jc_status="Habilitado"

echo -e "  ${C_BOLD}Identidade${C_RESET}"
echo -e "    Empresa          : ${C_GREEN}${BOT_COMPANY_NAME}${C_RESET}"
echo -e "    Bot              : ${C_GREEN}${BOT_NAME}${C_RESET}"
echo -e "    Time             : ${C_GREEN}${BOT_SUPPORT_TEAM}${C_RESET}"
echo
echo -e "  ${C_BOLD}Infraestrutura${C_RESET}"
echo -e "    PostgreSQL senha : ${C_GREEN}${POSTGRES_PASSWORD}${C_RESET}"
echo -e "    Evolution DB     : ${C_GREEN}${EVOLUTION_DB_PASSWORD}${C_RESET}"
echo -e "    ChatWoot DB      : ${C_GREEN}${CHATWOOT_DB_PASSWORD}${C_RESET}"
echo -e "    Redis senha      : ${C_GREEN}${REDIS_PASSWORD}${C_RESET}"
echo
echo -e "  ${C_BOLD}Evolution API${C_RESET}"
echo -e "    API Key          : ${C_GREEN}${EVOLUTION_API_KEY}${C_RESET}"
echo -e "    Instância        : ${C_GREEN}${EVOLUTION_INSTANCE}${C_RESET}"
echo
echo -e "  ${C_BOLD}GLPI${C_RESET}"
echo -e "    URL              : ${C_GREEN}${GLPI_URL}${C_RESET}"
echo -e "    Categoria padrão : ${C_GREEN}${GLPI_DEFAULT_CATEGORY_ID}${C_RESET}"
echo -e "    Onboarding       : ${C_GREEN}${GLPI_ONBOARDING_CATEGORY_ID}${C_RESET}"
echo
echo -e "  ${C_BOLD}ChatWoot${C_RESET}"
echo -e "    URL              : ${C_GREEN}${CHATWOOT_FRONTEND_URL}${C_RESET}"
echo -e "    Admin e-mail     : ${C_GREEN}${CHATWOOT_ADMIN_EMAIL}${C_RESET}"
echo
echo -e "  ${C_BOLD}IA (Claude)${C_RESET}"
echo -e "    Modelo           : ${C_GREEN}${CLAUDE_MODEL}${C_RESET}"
echo
echo -e "  ${C_BOLD}JumpCloud${C_RESET}"
echo -e "    Autenticação     : ${C_GREEN}${_jc_status}${C_RESET}"
echo
echo -e "  ${C_BOLD}Bot${C_RESET}"
echo -e "    Timeout sessão   : ${C_GREEN}${SESSION_TTL_SECONDS}s${C_RESET}"
echo

if ! confirm "Confirmar e salvar o arquivo .env?"; then
  warn "Configuração cancelada. Nenhum arquivo foi alterado."
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
#  SALVA O .env
# ══════════════════════════════════════════════════════════════════════════════
cat > "$ENV_FILE" <<EOF
# Gerado pelo install.sh em $(date '+%Y-%m-%d %H:%M:%S')
# Para reconfigurar: ./install.sh

# ─── Identidade do Bot ────────────────────────────────────────────────────────
BOT_COMPANY_NAME="${BOT_COMPANY_NAME}"
BOT_NAME="${BOT_NAME}"
BOT_SUPPORT_TEAM="${BOT_SUPPORT_TEAM}"

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

# ─── JumpCloud ────────────────────────────────────────────────────────────────
JUMPCLOUD_ENABLED="${JUMPCLOUD_ENABLED}"
JUMPCLOUD_API_KEY="${JUMPCLOUD_API_KEY}"

# ─── Bot ──────────────────────────────────────────────────────────────────────
SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS}"
CSAT_SCALE="5"
EOF

# ─── init-db.sql ──────────────────────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/scripts"
cat > "$SCRIPT_DIR/scripts/init-db.sql" <<EOF
-- Gerado pelo install.sh em $(date '+%Y-%m-%d %H:%M:%S')
CREATE USER evolution WITH PASSWORD '${EVOLUTION_DB_PASSWORD}';
CREATE DATABASE evolutiondb OWNER evolution;
GRANT ALL PRIVILEGES ON DATABASE evolutiondb TO evolution;

CREATE USER chatwoot WITH PASSWORD '${CHATWOOT_DB_PASSWORD}';
CREATE DATABASE chatwoot_production OWNER chatwoot;
GRANT ALL PRIVILEGES ON DATABASE chatwoot_production TO chatwoot;
EOF

# ══════════════════════════════════════════════════════════════════════════════
#  EVOLUTION API — DOWNLOAD / VERIFICAÇÃO
# ══════════════════════════════════════════════════════════════════════════════
EVOLUTION_SRC="$SCRIPT_DIR/evolution-api-src"
EVOLUTION_URL="https://github.com/EvolutionAPI/evolution-api/archive/refs/tags/2.3.7.tar.gz"
EVOLUTION_TAR="$SCRIPT_DIR/evolution-api-2.3.7.tar.gz"

clear
echo
echo -e "  ${C_BOLD}${C_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
echo -e "  ${C_BOLD}  GLPI WhatsApp Bot${C_RESET}  ${C_DIM}•  Preparação${C_RESET}"
echo -e "  ${C_BOLD}${C_CYAN}  Salvando configurações e preparando fontes${C_RESET}"
echo -e "  ${C_BOLD}${C_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
echo

step "Salvando .env" bash -c "echo ok"
step "Gerando scripts/init-db.sql" bash -c "echo ok"

if [[ -d "$EVOLUTION_SRC" && -f "$EVOLUTION_SRC/Dockerfile" ]]; then
  ok "Evolution API já presente — pulando download."
else
  if command -v curl &>/dev/null; then
    step "Baixando Evolution API 2.3.7" \
      curl -fsSL "$EVOLUTION_URL" -o "$EVOLUTION_TAR"
  elif command -v wget &>/dev/null; then
    step "Baixando Evolution API 2.3.7" \
      wget -q "$EVOLUTION_URL" -O "$EVOLUTION_TAR"
  else
    err "curl ou wget não encontrado. Execute: sudo apt-get install curl"; exit 1
  fi

  step "Extraindo Evolution API" bash -c "
    mkdir -p '${EVOLUTION_SRC}'
    tar -xzf '${EVOLUTION_TAR}' --strip-components=1 -C '${EVOLUTION_SRC}'
    rm -f '${EVOLUTION_TAR}'
  "

  # Patch SSL para ambientes corporativos/WSL
  step "Aplicando patch SSL (Dockerfile)" bash -c "
    if ! grep -q 'NODE_TLS_REJECT_UNAUTHORIZED' '${EVOLUTION_SRC}/Dockerfile'; then
      sed -i 's|RUN ./Docker/scripts/generate_database.sh|ENV NODE_TLS_REJECT_UNAUTHORIZED=0\nRUN ./Docker/scripts/generate_database.sh|' \
        '${EVOLUTION_SRC}/Dockerfile' || \
      sed -i '/generate_database/i ENV NODE_TLS_REJECT_UNAUTHORIZED=0' \
        '${EVOLUTION_SRC}/Dockerfile'
    fi
  "
fi

# ══════════════════════════════════════════════════════════════════════════════
#  SUBIR SERVIÇOS?
# ══════════════════════════════════════════════════════════════════════════════
echo
if ! command -v docker &>/dev/null; then
  warn "Docker não encontrado no PATH."
  warn "Instale o Docker e execute: docker compose up -d"
  echo; exit 0
fi

echo
if ! confirm "Subir todos os serviços agora com Docker Compose?"; then
  echo
  info "Para subir manualmente:"
  echo -e "  ${C_DIM}docker compose up -d postgres redis${C_RESET}"
  echo -e "  ${C_DIM}docker compose build evolution-api && docker compose up -d evolution-api${C_RESET}"
  echo -e "  ${C_DIM}docker compose up -d chatwoot-web chatwoot-worker${C_RESET}"
  echo -e "  ${C_DIM}docker compose build bot && docker compose up -d bot${C_RESET}"
  echo
  info "Para reconfigurar: ${C_BOLD}./install.sh${C_RESET}"
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
#  EXECUÇÃO DOS SERVIÇOS
# ══════════════════════════════════════════════════════════════════════════════
clear
echo
echo -e "  ${C_BOLD}${C_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
echo -e "  ${C_BOLD}  GLPI WhatsApp Bot${C_RESET}  ${C_DIM}•  Instalação${C_RESET}"
echo -e "  ${C_BOLD}${C_CYAN}  Subindo serviços Docker${C_RESET}"
echo -e "  ${C_BOLD}${C_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
echo

cd "$SCRIPT_DIR"

step "PostgreSQL + Redis" bash -c "
  docker compose up -d postgres redis
  # Aguarda health check
  for i in \$(seq 1 30); do
    docker compose ps postgres | grep -q '(healthy)' && \
    docker compose ps redis   | grep -q '(healthy)' && break
    sleep 2
  done
"

step "Evolution API (build — pode demorar)" bash -c "
  docker compose build evolution-api
  docker compose up -d evolution-api
"

step "ChatWoot — build da imagem" bash -c "
  docker compose build chatwoot-web
"

step "ChatWoot — permissão superuser no DB" bash -c "
  docker compose exec postgres psql -U postgres \
    -c \"ALTER USER chatwoot WITH SUPERUSER;\" 2>/dev/null || true
"

step "ChatWoot — migrações do banco" bash -c "
  docker compose run --rm chatwoot-web bundle exec rails db:migrate
"

step "ChatWoot — criando conta admin" bash -c "
  docker compose run --rm \
    -e CW_ACCOUNT_NAME='${CHATWOOT_ACCOUNT_NAME}' \
    -e CW_ADMIN_NAME='${CHATWOOT_ADMIN_NAME}' \
    -e CW_ADMIN_EMAIL='${CHATWOOT_ADMIN_EMAIL}' \
    -e CW_ADMIN_PASSWORD='${CHATWOOT_ADMIN_PASSWORD}' \
    chatwoot-web bundle exec rails runner '
      email = ENV[\"CW_ADMIN_EMAIL\"]
      unless User.exists?(email: email)
        account = Account.find_or_create_by!(name: ENV[\"CW_ACCOUNT_NAME\"])
        user = User.new(
          name: ENV[\"CW_ADMIN_NAME\"], email: email,
          password: ENV[\"CW_ADMIN_PASSWORD\"],
          password_confirmation: ENV[\"CW_ADMIN_PASSWORD\"]
        )
        user.skip_confirmation!; user.save!
        AccountUser.create!(account: account, user: user, role: :administrator)
      end
    '
"

step "ChatWoot — iniciando serviços web + worker" bash -c "
  docker compose up -d chatwoot-web chatwoot-worker
"

step "ChatWoot — aguardando inicialização" bash -c "
  for i in \$(seq 1 40); do
    HTTP=\$(curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3001/auth/sign_in' \
      -H 'Content-Type: application/json' \
      -d '{\"email\":\"${CHATWOOT_ADMIN_EMAIL}\",\"password\":\"${CHATWOOT_ADMIN_PASSWORD}\"}' 2>/dev/null || echo 000)
    [[ \"\$HTTP\" == '200' ]] && exit 0
    sleep 3
  done
  exit 1
"

step "ChatWoot — obtendo token + criando inbox" bash -c "
  CW_LOGIN=\$(curl -s 'http://localhost:3001/auth/sign_in' \
    -H 'Content-Type: application/json' \
    -d '{\"email\":\"${CHATWOOT_ADMIN_EMAIL}\",\"password\":\"${CHATWOOT_ADMIN_PASSWORD}\"}' 2>/dev/null || echo '{}')

  TOKEN=\$(echo \"\$CW_LOGIN\" | python3 -c \"import sys,json; print(json.load(sys.stdin).get('data',{}).get('access_token',''))\" 2>/dev/null || echo '')
  ACCTID=\$(echo \"\$CW_LOGIN\" | python3 -c \"import sys,json; print(json.load(sys.stdin).get('data',{}).get('account_id',''))\" 2>/dev/null || echo '')

  [[ -z \"\$TOKEN\" ]] && exit 0

  # Cria inbox
  CW_INBOX=\$(curl -s -X POST \"http://localhost:3001/api/v1/accounts/\${ACCTID}/inboxes\" \
    -H \"api_access_token: \${TOKEN}\" \
    -H 'Content-Type: application/json' \
    -d '{\"name\":\"WhatsApp Bot\",\"channel\":{\"type\":\"api\"}}' 2>/dev/null || echo '{}')
  INBOX_ID=\$(echo \"\$CW_INBOX\" | python3 -c \"import sys,json; print(json.load(sys.stdin).get('id',''))\" 2>/dev/null || echo '')
  [[ -z \"\$INBOX_ID\" ]] && INBOX_ID=1

  # Registra webhook
  curl -s -o /dev/null -X POST \"http://localhost:3001/api/v1/accounts/\${ACCTID}/webhooks\" \
    -H \"api_access_token: \${TOKEN}\" \
    -H 'Content-Type: application/json' \
    -d '{\"url\":\"http://bot:3000/webhook/chatwoot\",\"subscriptions\":[\"conversation_status_changed\",\"message_created\"]}' 2>/dev/null || true

  # Atualiza .env
  sed -i \"s|CHATWOOT_API_TOKEN=.*|CHATWOOT_API_TOKEN=\\\"\${TOKEN}\\\"|\"     '${ENV_FILE}'
  sed -i \"s|CHATWOOT_ACCOUNT_ID=.*|CHATWOOT_ACCOUNT_ID=\\\"\${ACCTID}\\\"|\"  '${ENV_FILE}'
  sed -i \"s|CHATWOOT_INBOX_ID=.*|CHATWOOT_INBOX_ID=\\\"\${INBOX_ID}\\\"|\"    '${ENV_FILE}'
"

step "Bot — build + start" bash -c "
  docker compose build bot
  docker compose up -d bot
"

step "Evolution API — desabilitar webhook de instância" bash -c "
  sleep 3
  curl -s -o /dev/null -X DELETE 'http://localhost:8080/webhook/${EVOLUTION_INSTANCE}' \
    -H 'apikey: ${EVOLUTION_API_KEY}' 2>/dev/null || true
  curl -s -o /dev/null -X PUT 'http://localhost:8080/webhook/${EVOLUTION_INSTANCE}' \
    -H 'apikey: ${EVOLUTION_API_KEY}' \
    -H 'Content-Type: application/json' \
    -d '{\"webhook\":{\"enabled\":false}}' 2>/dev/null || true
"

# ══════════════════════════════════════════════════════════════════════════════
#  CONCLUÍDO
# ══════════════════════════════════════════════════════════════════════════════
echo
echo -e "  ${C_BOLD}${C_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
echo -e "  ${C_BOLD}${C_GREEN}  ✓  Instalação concluída!${C_RESET}"
echo -e "  ${C_BOLD}${C_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
echo
echo -e "  ${C_BOLD}Acesso:${C_RESET}"
echo -e "    ChatWoot      → ${C_CYAN}${CHATWOOT_FRONTEND_URL}${C_RESET}"
echo -e "    Evolution API → ${C_CYAN}http://localhost:8080/manager${C_RESET}"
echo
echo -e "  ${C_BOLD}${C_YELLOW}Próximo passo:${C_RESET}"
echo -e "  Escaneie o QR Code do WhatsApp em ${C_CYAN}http://localhost:8080/manager${C_RESET}"
echo
info "Para reconfigurar qualquer valor: ${C_BOLD}./install.sh${C_RESET}"
echo
