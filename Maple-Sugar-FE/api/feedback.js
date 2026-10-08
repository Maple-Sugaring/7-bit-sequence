const CATEGORIES = new Set(['Idea', 'Bug', 'Other']);

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host || (origin !== `https://${host}` && origin !== `http://${host}`)) {
    return response.status(403).json({ error: 'Invalid origin' });
  }

  const { category, message } = request.body ?? {};
  if (!CATEGORIES.has(category) || typeof message !== 'string' || !message.trim() || message.length > 1500) {
    return response.status(400).json({ error: 'Invalid feedback' });
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return response.status(503).json({ error: 'Feedback is unavailable' });

  try {
    const discord = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**Mock app feedback - ${category}**\n${message.trim()}`,
        allowed_mentions: { parse: [] },
      }),
    });
    if (!discord.ok) return response.status(502).json({ error: 'Delivery failed' });
    return response.status(204).end();
  } catch {
    return response.status(502).json({ error: 'Delivery failed' });
  }
}
