'use strict';

const { buildWallLink } = require('./moonetix');

// Handles one Telegram update and returns the Bot API call to send back in
// the webhook response, or null. Telegram runs that call for us, so no
// outgoing request is needed.
function handleUpdate(update, { config, store }) {
  const msg = update && update.message;
  if (!msg || typeof msg.text !== 'string' || !msg.from || msg.from.is_bot) return null;

  const command = msg.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();
  if (command !== '/earn' && command !== '/start') return null;

  // Signed links are personal. They are only ever sent in the private chat.
  if (!msg.chat || msg.chat.type !== 'private') {
    return command === '/earn'
      ? reply(msg, 'Send /earn to me in a private chat to get your own link.')
      : null;
  }

  const openApp = config.publicUrl
    ? [[{ text: 'Open the app', web_app: { url: `${config.publicUrl}/` } }]]
    : undefined;

  if (command === '/start') {
    return reply(msg, `Earn ${config.currencyName} by completing offers. Tap Open the app, or send /earn for your personal offerwall link.`, openApp);
  }

  const account = store.findOrCreateByTelegramId(msg.from.id);
  if (!account.age_confirmed_at) {
    return reply(msg, 'Offers are for users aged 16 or older. Open the app once to confirm your age, then send /earn again.', openApp);
  }

  const url = buildWallLink({
    appId: config.appId,
    linkSalt: config.linkSalt,
    userId: String(account.id),
    subs: { sub1: 'telegram_bot' },
  });
  return reply(msg, 'Here is your personal offerwall link. It is only for you, so do not share it. Turn off any VPN before you open it.', [[{ text: 'Open the offerwall', url }]]);
}

function reply(msg, text, keyboard) {
  const call = { method: 'sendMessage', chat_id: msg.chat.id, text };
  if (keyboard) call.reply_markup = { inline_keyboard: keyboard };
  return call;
}

module.exports = { handleUpdate };
