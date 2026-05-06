import type { Request, Response } from 'express';

// GLPI webhook — CSAT desativado temporariamente.
// Para reativar: reimportar csatFlow e chamar sendCsatRequest ao fechar ticket.

export async function handleGlpiWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200);
  console.log('[GLPI Webhook]', req.body);
}
