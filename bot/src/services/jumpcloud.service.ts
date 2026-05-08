import axios from 'axios';
import { config } from '../config';

interface JumpCloudUser {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  suspended: boolean;
  activated: boolean;
  attributes?: Array<{ name: string; value: string; _id?: string }>;
}

interface JumpCloudSearchResponse {
  results: JumpCloudUser[];
  totalCount: number;
}

const http = axios.create({
  baseURL: 'https://console.jumpcloud.com/api',
  headers: {
    'x-api-key': config.jumpcloud.apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 10_000,
});

export async function findActiveUserByEmail(email: string): Promise<{
  exists: boolean;
  active: boolean;
  name?: string;
  cpfLast4?: string;  // últimos 4 dígitos do CPF (custom attribute)
}> {
  if (!config.jumpcloud.apiKey) {
    console.error('[JumpCloud] JUMPCLOUD_API_KEY não configurado — autenticação bloqueada');
    return { exists: false, active: false };
  }

  try {
    const { data } = await http.get<JumpCloudSearchResponse>('/systemusers', {
      params: {
        filter: `email:$eq:${email}`,
        limit: 1,
      },
    });

    if (!data.results || data.results.length === 0) {
      return { exists: false, active: false };
    }

    const user = data.results[0];
    const name = [user.firstname, user.lastname].filter(Boolean).join(' ').trim();

    const cpfAttr = user.attributes?.find(
      (a) => a.name.toLowerCase() === 'cpf',
    );
    const cpfDigits = cpfAttr?.value?.replace(/\D/g, '') ?? '';
    const cpfLast4 = cpfDigits.length >= 4 ? cpfDigits.slice(-4) : undefined;

    return {
      exists: true,
      active: !user.suspended && user.activated,
      name: name || undefined,
      cpfLast4,
    };
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    console.error('[JumpCloud] erro ao consultar usuário:', status, (err as Error).message);
    // Erro na API → bloqueia autenticação (não pode validar sem JumpCloud)
    return { exists: false, active: false };
  }
}
