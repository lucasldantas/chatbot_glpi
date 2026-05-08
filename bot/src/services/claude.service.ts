import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { GLPIKBArticle, KBSearchResult } from '../types';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function searchKnowledgeBase(
  userQuestion: string,
  articles: GLPIKBArticle[],
): Promise<KBSearchResult> {
  if (articles.length === 0) {
    return { found: false };
  }

  const articlesText = articles
    .map(
      (a, i) =>
        `[Artigo ${i + 1} - ID ${a.id}]\nTítulo: ${a.name}\nConteúdo: ${a.answer.replace(/<[^>]*>/g, '').slice(0, 1000)}`,
    )
    .join('\n\n---\n\n');

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: `Você é um assistente de TI que avalia se artigos da base de conhecimento respondem às dúvidas dos usuários.
Responda SEMPRE em JSON válido com o formato:
{
  "found": boolean,
  "articleId": number | null,
  "articleTitle": string | null,
  "summary": string | null
}

Regras:
- "found" = true SOMENTE se um artigo responde DIRETAMENTE e de forma COMPLETA à dúvida
- "summary" deve listar os passos práticos do artigo de forma didática, numerada e em português simples (ex: "1. Pressione Command+K..."). Máx 8 itens. Não use parágrafos — use lista numerada.
- Se nenhum artigo for adequado, retorne found: false com os outros campos null`,
    messages: [
      {
        role: 'user',
        content: `Dúvida do usuário: "${userQuestion}"\n\nArtigos disponíveis na base de conhecimento:\n\n${articlesText}\n\nEsse usuário consegue resolver a dúvida com algum desses artigos?`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return { found: false };

  try {
    // Extrai JSON mesmo que venha com markdown (```json...```)
    const json = textBlock.text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { found: false };

    const result = JSON.parse(json) as {
      found: boolean;
      articleId: number | null;
      articleTitle: string | null;
      summary: string | null;
    };

    return {
      found: result.found,
      articleId: result.articleId ?? undefined,
      articleTitle: result.articleTitle ?? undefined,
      summary: result.summary ?? undefined,
    };
  } catch {
    return { found: false };
  }
}

export interface KBArticleDraft {
  shouldCreate: boolean;
  title?: string;
  content?: string; // HTML simples
}

export async function generateKBArticle(
  transcript: string,
): Promise<KBArticleDraft> {
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 2048,
    system: `Você é um especialista em TI responsável por criar artigos para uma base de conhecimento corporativa.
Analise a transcrição de um atendimento de suporte e decida se ela contém conhecimento genérico e reutilizável.

REGRAS DE PRIVACIDADE — OBRIGATÓRIAS:
- NUNCA inclua nomes de pessoas, e-mails, telefones, CPF, matrícula ou qualquer dado pessoal
- Substitua referências a pessoas por "o colaborador" ou "o usuário"
- Substitua nomes de departamentos específicos por "o setor" quando identificarem pessoas
- Remova qualquer informação que possa identificar um indivíduo

CRITÉRIOS PARA CRIAR ARTIGO:
- O problema é técnico e pode acontecer com outros colaboradores
- A solução é clara, objetiva e reproduzível
- Não é um caso isolado ou muito específico (ex: trocar senha de uma pessoa)

Responda SEMPRE em JSON válido:
{
  "shouldCreate": boolean,
  "title": "Título claro e objetivo" | null,
  "content": "Conteúdo em HTML simples com <h3>, <p>, <ol>, <li>. Máx 600 palavras." | null
}

Se shouldCreate=false, os outros campos devem ser null.`,
    messages: [
      {
        role: 'user',
        content: `Transcrição do atendimento:\n\n${transcript}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return { shouldCreate: false };

  try {
    const json = textBlock.text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { shouldCreate: false };

    const result = JSON.parse(json) as {
      shouldCreate: boolean;
      title: string | null;
      content: string | null;
    };

    if (!result.shouldCreate || !result.title || !result.content) {
      return { shouldCreate: false };
    }

    return {
      shouldCreate: true,
      title: result.title,
      content: result.content,
    };
  } catch {
    return { shouldCreate: false };
  }
}

export async function extractKeywords(text: string): Promise<string> {
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 100,
    system:
      'Extraia as 5 palavras-chave mais relevantes do texto para busca em base de conhecimento de TI. Retorne apenas as palavras separadas por espaço, sem pontuação, sem artigos ou preposições.',
    messages: [{ role: 'user', content: text }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text.trim() : text.split(' ').slice(0, 3).join(' ');
}
