import axios from 'axios';
import { config } from '../config';

const http = axios.create({
  baseURL: config.evolution.url,
  headers: {
    apikey: config.evolution.apiKey,
    'Content-Type': 'application/json',
  },
  timeout: 15_000,
});

const { instance } = config.evolution;

export async function sendText(to: string, text: string): Promise<void> {
  await http.post(`/message/sendText/${instance}`, {
    number: to,
    text,
  });
}

export async function sendList(
  to: string,
  title: string,
  description: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ rowId: string; title: string; description?: string }>;
  }>,
): Promise<void> {
  await http.post(`/message/sendList/${instance}`, {
    number: to,
    title,
    description,
    buttonText,
    sections,
  });
}

export async function sendButtons(
  to: string,
  title: string,
  description: string,
  buttons: Array<{ buttonId: string; buttonText: { displayText: string } }>,
): Promise<void> {
  await http.post(`/message/sendButtons/${instance}`, {
    number: to,
    title,
    description,
    buttons,
  });
}

export async function sendMedia(
  to: string,
  mediatype: 'image' | 'video' | 'document',
  base64: string,
  mimetype: string,
  caption?: string,
  fileName?: string,
): Promise<void> {
  await http.post(`/message/sendMedia/${instance}`, {
    number: to,
    mediatype,
    mimetype,
    media: base64,
    caption: caption ?? '',
    fileName: fileName ?? '',
  });
}

export async function sendAudio(to: string, base64: string): Promise<void> {
  await http.post(`/message/sendWhatsAppAudio/${instance}`, {
    number: to,
    audio: base64,
    encoding: true,
  });
}

export async function markAsRead(remoteJid: string, messageId: string): Promise<void> {
  await http.post(`/chat/markMessageAsRead/${instance}`, {
    readMessages: [{ remoteJid, id: messageId, fromMe: false }],
  }).catch(() => {
    // não-crítico
  });
}

export async function downloadMedia(
  key: { remoteJid: string; fromMe: boolean; id: string },
  message: Record<string, unknown>,
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const { data } = await http.post<{ base64: string; mimetype: string }>(
      `/chat/getBase64FromMediaMessage/${instance}`,
      { message: { key, message } },
    );
    if (!data?.base64) return null;
    const base64 = data.base64.replace(/^data:[^;]+;base64,/, '');
    return { base64, mimetype: data.mimetype };
  } catch (err) {
    console.error('[Evolution] downloadMedia erro:', err);
    return null;
  }
}

export function extractPhone(remoteJid: string): string {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

export function toJid(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
}
