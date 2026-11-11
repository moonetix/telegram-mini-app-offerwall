'use strict';

const REQUIRED = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'MOONETIX_APP_ID',
  'MOONETIX_LINK_SALT',
  'MOONETIX_POSTBACK_KEY',
];

function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET)) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET may only use A-Z a-z 0-9 _ - (Telegram rule).');
  }
  return {
    port: Number(env.PORT || 3000),
    databasePath: env.DATABASE_PATH || './data.sqlite',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
    botToken: env.TELEGRAM_BOT_TOKEN,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    initDataMaxAge: Number(env.INIT_DATA_MAX_AGE || 3600),
    currencyName: env.CURRENCY_NAME || 'Coins',
    appId: env.MOONETIX_APP_ID,
    linkSalt: env.MOONETIX_LINK_SALT,
    postbackKey: env.MOONETIX_POSTBACK_KEY,
  };
}

module.exports = { loadConfig };
