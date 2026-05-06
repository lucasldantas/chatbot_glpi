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
- "summary" deve ser uma explicação concisa e clara em português (máx 3 parágrafos) baseada no artigo
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

export async function extractKeywords(text: string): Promise<string> {
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 100,
    system:
      'Extraia as 3 palavras-chave mais relevantes do texto para busca em base de conhecimento de TI. Retorne apenas as palavras separadas por espaço, sem pontuação.',
    messages: [{ role: 'user', content: text }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text.trim() : text.split(' ').slice(0, 3).join(' ');
}
