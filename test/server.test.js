'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { config, vectors, signInitData, launchFields, startServer } = require('./helpers');

const ANA = { id: 7012345678, first_name: 'Ana' };
const BEN = { id: 5550001, first_name: 'Ben' };

test('Mini App, bot and postbacks end to end', async (t) => {
  const app = await startServer();
  t.after(() => app.close());
  const anaInit = signInitData(launchFields(ANA));
  const benInit = signInitData(launchFields(BEN));
  const balance = async (initData) => (await (await app.post('/api/session', { initData })).json()).balance;

  await t.test('serves the Mini App page with telegram-web-app.js', async () => {
    const res = await fetch(app.base + '/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /https:\/\/telegram\.org\/js\/telegram-web-app\.js/);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self' https:\/\/telegram\.org/);
  });

  await t.test('session maps Telegram users to new account IDs', async () => {
    const res = await app.post('/api/session', { initData: anaInit });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { name: 'Ana', balance: '0', currency: 'Coins', ageConfirmed: false });
    await app.post('/api/session', { initData: benInit });
    assert.equal(app.store.findOrCreateByTelegramId(ANA.id).id, 1);
    assert.equal(app.store.findOrCreateByTelegramId(BEN.id).id, 2);
  });

  await t.test('tampered initData gets 403', async () => {
    const forged = new URLSearchParams(anaInit);
    forged.set('user', JSON.stringify(BEN));
    for (const initData of [forged.toString(), '', 'user=%7B%22id%22%3A1%7D']) {
      const res = await app.post('/api/offerwall-link', { initData });
      assert.equal(res.status, 403);
    }
  });

  await t.test('a user ID sent by the client is ignored', async () => {
    await app.post('/api/confirm-age', { initData: anaInit, confirm: true });
    const res = await app.post('/api/offerwall-link', { initData: anaInit, user_id: '2', userId: 2 });
    const { url } = await res.json();
    assert.ok(url.startsWith(vectors.walls['1']));
  });

  await t.test('no link before the age confirmation', async () => {
    const res = await app.post('/api/offerwall-link', { initData: benInit });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'age_not_confirmed' });
  });

  await t.test('link is signed for the account ID, never the Telegram ID', async () => {
    const res = await app.post('/api/offerwall-link', { initData: anaInit });
    assert.equal(res.status, 200);
    const { url } = await res.json();
    assert.equal(url, vectors.walls['1'] + '&sub1=telegram_miniapp');
    assert.ok(!url.includes(String(ANA.id)));
    assert.ok(!url.includes(config.linkSalt));
  });

  await t.test('real postbacks: credit once, reverse once', async () => {
    const pb = vectors.postbacks;
    let res = await app.postback(pb.credit_150);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'credited');
    assert.equal(await balance(anaInit), '150');

    res = await app.postback(pb.credit_150);
    assert.equal(await res.text(), 'duplicate');
    assert.equal(await balance(anaInit), '150');

    res = await app.postback(pb.credit_decimal);
    assert.equal(await res.text(), 'credited');
    res = await app.postback(pb.credit_five_decimals);
    assert.equal(await res.text(), 'credited');
    assert.equal(await balance(anaInit), '151.98456');

    res = await app.postback(pb.reverse_150);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'reversed');
    assert.equal(await balance(anaInit), '1.98456');

    res = await app.postback(pb.reverse_150);
    assert.equal(await res.text(), 'duplicate');
    res = await app.postback(pb.credit_150);
    assert.equal(await res.text(), 'duplicate', 'a credit after its reversal is not credited again');
    assert.equal(await balance(anaInit), '1.98456');

    res = await app.postback(pb.credit_user2);
    assert.equal(await res.text(), 'credited');
    assert.equal(await balance(benInit), '40');
  });

  await t.test('reversals of transactions never credited change nothing', async () => {
    let res = await app.postback(vectors.postbacks.reverse_never_credited);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'not_credited');
    res = await app.postback(vectors.postbacks.reverse_other_user);
    assert.equal(await res.text(), 'user_mismatch');
    assert.equal(await balance(anaInit), '1.98456');
    assert.equal(await balance(benInit), '40');
  });

  await t.test('unknown users are acknowledged but not credited', async () => {
    let res = await app.postback(vectors.postbacks.credit_test_user);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ignored: unknown user');
    res = await app.postback(vectors.postbacks.credit_missing_account);
    assert.equal(await res.text(), 'unknown_user');
  });

  await t.test('tampered and wrongly signed postbacks get 403', async () => {
    const base = new URL(vectors.postbacks.credit_user2);
    const cases = [
      ['reward', '4000'],
      ['user', '1'],
      ['tx', 'tx_other'],
      ['status', '2'],
      ['hash', ''],
      ['hash', base.searchParams.get('hash').toUpperCase()],
    ];
    for (const [key, value] of cases) {
      const u = new URL(base);
      u.searchParams.set(key, value);
      const res = await app.postback(u.toString());
      assert.equal(res.status, 403, `${key}=${value}`);
    }
    const res = await app.postback(vectors.postbacks.credit_wrong_key);
    assert.equal(res.status, 403);
    assert.equal(await balance(anaInit), '1.98456');
    assert.equal(await balance(benInit), '40');
  });

  await t.test('webhook needs the secret token', async () => {
    const update = { message: { text: '/earn', from: { id: ANA.id }, chat: { id: ANA.id, type: 'private' } } };
    let res = await app.post('/telegram/webhook', update);
    assert.equal(res.status, 401);
    res = await app.post('/telegram/webhook', update, { 'X-Telegram-Bot-Api-Secret-Token': 'wrong' });
    assert.equal(res.status, 401);
  });

  await t.test('/earn replies in the private chat with a URL button', async () => {
    const headers = { 'X-Telegram-Bot-Api-Secret-Token': config.webhookSecret };
    const update = { message: { text: '/earn@MyEarnBot', from: { id: ANA.id }, chat: { id: ANA.id, type: 'private' } } };
    const call = await (await app.post('/telegram/webhook', update, headers)).json();
    assert.equal(call.method, 'sendMessage');
    assert.equal(call.chat_id, ANA.id);
    const button = call.reply_markup.inline_keyboard[0][0];
    assert.equal(button.url, vectors.walls['1'] + '&sub1=telegram_bot');
  });

  await t.test('/earn never posts a link in a group', async () => {
    const headers = { 'X-Telegram-Bot-Api-Secret-Token': config.webhookSecret };
    const update = { message: { text: '/earn', from: { id: ANA.id }, chat: { id: -100123, type: 'supergroup' } } };
    const call = await (await app.post('/telegram/webhook', update, headers)).json();
    assert.equal(call.chat_id, -100123);
    assert.equal(call.reply_markup, undefined);
    assert.ok(!JSON.stringify(call).includes('wall.moonetix.com'));
  });

  await t.test('/earn asks unconfirmed users to open the app first', async () => {
    const headers = { 'X-Telegram-Bot-Api-Secret-Token': config.webhookSecret };
    const update = { message: { text: '/earn', from: { id: 999000111 }, chat: { id: 999000111, type: 'private' } } };
    const call = await (await app.post('/telegram/webhook', update, headers)).json();
    assert.equal(call.reply_markup.inline_keyboard[0][0].web_app.url, 'https://miniapp.example.com/');
    assert.ok(!JSON.stringify(call).includes('wall.moonetix.com'));
  });

  await t.test('other updates get an empty answer', async () => {
    const headers = { 'X-Telegram-Bot-Api-Secret-Token': config.webhookSecret };
    const res = await app.post('/telegram/webhook', { message: { text: 'hello', from: { id: 1 }, chat: { id: 1, type: 'private' } } }, headers);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {});
  });
});
