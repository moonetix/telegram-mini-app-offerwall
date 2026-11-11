'use strict';

const crypto = require('node:crypto');
const { createApp } = require('../src/server');
const { openStore } = require('../src/store');
const vectors = require('./fixtures/moonetix-vectors.json');

const BOT_TOKEN = '110201543:TEST-token-for-local-tests-only';

// Signs launch data the way Telegram does, so tests need no real bot.
function signInitData(fields, botToken = BOT_TOKEN) {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}

function launchFields(user, extra = {}) {
  return {
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    signature: 'c2lnbmF0dXJlLWZpZWxkLWlzLWluY2x1ZGVkLWluLXRoZS1jaGVjaw',
    ...extra,
  };
}

const config = {
  port: 0,
  databasePath: ':memory:',
  publicUrl: 'https://miniapp.example.com',
  botToken: BOT_TOKEN,
  webhookSecret: 'test_webhook_secret',
  initDataMaxAge: 3600,
  currencyName: 'Coins',
  appId: vectors.app_id,
  linkSalt: vectors.link_salt,
  postbackKey: vectors.postback_key,
};

async function startServer() {
  const store = openStore(':memory:');
  const server = createApp({ config, store, log: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    store,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      store.close();
    },
    post(path, body, headers = {}) {
      return fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    },
    // Sends a postback URL from the fixtures to this server.
    postback(url) {
      const u = new URL(url);
      return fetch(base + u.pathname + u.search);
    },
  };
}

module.exports = { BOT_TOKEN, config, vectors, signInitData, launchFields, startServer };
