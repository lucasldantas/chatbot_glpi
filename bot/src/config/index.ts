function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),

  redis: {
    url: required('REDIS_URL'),
    sessionTtlSeconds: parseInt(optional('SESSION_TTL_SECONDS', '3600'), 10),
  },

  evolution: {
    url: required('EVOLUTION_URL'),
    apiKey: required('EVOLUTION_API_KEY'),
    instance: required('EVOLUTION_INSTANCE'),
  },

  glpi: {
    url: required('GLPI_URL'),
    appToken: required('GLPI_APP_TOKEN'),
    userToken: required('GLPI_USER_TOKEN'),
    onboardingCategoryId: parseInt(optional('GLPI_ONBOARDING_CATEGORY_ID', '0'), 10),
    defaultCategoryId: parseInt(optional('GLPI_DEFAULT_CATEGORY_ID', '0'), 10),
  },

  chatwoot: {
    url: required('CHATWOOT_URL'),
    apiToken: required('CHATWOOT_API_TOKEN'),
    accountId: parseInt(required('CHATWOOT_ACCOUNT_ID'), 10),
    inboxId: parseInt(required('CHATWOOT_INBOX_ID'), 10),
    webhookSecret: optional('CHATWOOT_WEBHOOK_SECRET', ''),
  },

  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: optional('CLAUDE_MODEL', 'claude-sonnet-4-6'),
  },

} as const;
