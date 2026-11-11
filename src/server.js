'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./config');
const { openStore } = require('./store');
const { validateInitData } = require('./telegram');
const { buildWallLink, safeEqual, formatAmount } = require('./moonetix');
const { handlePostback } = require('./postback');
const { handleUpdate } = require('./bot');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function createApp({ config, store, log = defaultLog }) {
  return http.createServer(async (req, res) => {
    try {
      await route(req, res, { config, store, log });
    } catch (err) {
      if (err && err.statusCode) return send(res, err.statusCode, { error: err.message });
      log('unhandled error', { error: err && err.message });
      send(res, 500, { error: 'server error' });
    }
  });
}

async function route(req, res, ctx) {
  const url = new URL(req.url, 'http://localhost');
  const { config, store, log } = ctx;

  if (req.method === 'GET' && url.pathname === '/moonetix/postback') {
    const { code, body } = handlePostback(url.searchParams, { postbackKey: config.postbackKey, store, log });
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(body);
  }

  if (req.method === 'POST' && url.pathname === '/telegram/webhook') {
    const given = req.headers['x-telegram-bot-api-secret-token'] || '';
    if (!safeEqual(given, config.webhookSecret)) return send(res, 401, { error: 'unauthorized' });
    const update = await readJson(req);
    const call = handleUpdate(update, { config, store });
    return call ? send(res, 200, call) : send(res, 200, {});
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const body = await readJson(req);
    const launch = validateInitData(body.initData, config.botToken, { maxAgeSeconds: config.initDataMaxAge });
    if (!launch) return send(res, 403, { error: 'invalid_init_data' });
    // The account comes only from validated initData, never from a field the client sends.
    const account = store.findOrCreateByTelegramId(launch.user.id);

    if (url.pathname === '/api/session') {
      return send(res, 200, sessionView(store.getAccount(account.id), launch.user, config));
    }
    if (url.pathname === '/api/confirm-age') {
      if (body.confirm !== true) return send(res, 400, { error: 'confirm_required' });
      store.confirmAge(account.id);
      return send(res, 200, sessionView(store.getAccount(account.id), launch.user, config));
    }
    if (url.pathname === '/api/offerwall-link') {
      if (!account.age_confirmed_at) return send(res, 403, { error: 'age_not_confirmed' });
      const link = buildWallLink({
        appId: config.appId,
        linkSalt: config.linkSalt,
        userId: String(account.id),
        subs: { sub1: 'telegram_miniapp' },
      });
      return send(res, 200, { url: link });
    }
    return send(res, 404, { error: 'not_found' });
  }

  if (req.method === 'GET' && STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname];
    const content = fs.readFileSync(path.join(PUBLIC_DIR, file));
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache',
    });
    return res.end(content);
  }

  send(res, 404, { error: 'not_found' });
}

function sessionView(account, tgUser, config) {
  return {
    name: String(tgUser.first_name || ''),
    balance: formatAmount(account.balance_micro),
    currency: config.currencyName,
    ageConfirmed: Boolean(account.age_confirmed_at),
  };
}

function send(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function readJson(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(data && typeof data === 'object' ? data : {});
      } catch {
        reject(Object.assign(new Error('invalid json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function defaultLog(message, data) {
  console.log(new Date().toISOString(), message, data ? JSON.stringify(data) : '');
}

if (require.main === module) {
  const config = loadConfig();
  const store = openStore(config.databasePath);
  createApp({ config, store }).listen(config.port, () => {
    console.log(`Listening on port ${config.port}`);
  });
}

module.exports = { createApp };
