'use strict';

const crypto = require('node:crypto');

// Validates Telegram Mini App initData as documented in
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Returns { user, authDate, startParam } or null.
function validateInitData(initData, botToken, { maxAgeSeconds = 3600, now = Date.now() } = {}) {
  if (typeof initData !== 'string' || initData === '' || initData.length > 8192) return null;
  if (typeof botToken !== 'string' || botToken === '') return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // The constant "WebAppData" is the key and the bot token is the message.
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return null;
  const age = Math.floor(now / 1000) - authDate;
  if (age > maxAgeSeconds || age < -60) return null;

  let user;
  try {
    user = JSON.parse(params.get('user'));
  } catch {
    return null;
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;

  return { user, authDate, startParam: params.get('start_param') };
}

module.exports = { validateInitData };
