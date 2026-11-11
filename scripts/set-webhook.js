'use strict';

// Points your bot's webhook at this server and sets the bot commands and menu button.
// Run once after deploy: node --env-file=.env scripts/set-webhook.js
// Needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_URL (https).

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

if (!token || !secret || !publicUrl.startsWith('https://')) {
  console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and an https PUBLIC_URL first.');
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} failed: ${data.description}`);
  console.log(`${method}: ok`);
}

(async () => {
  await call('setWebhook', {
    url: `${publicUrl}/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  await call('setMyCommands', {
    commands: [{ command: 'earn', description: 'Get your personal offerwall link' }],
    scope: { type: 'all_private_chats' },
  });
  await call('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Earn', web_app: { url: `${publicUrl}/` } },
  });
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
