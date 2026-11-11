'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInitData } = require('../src/telegram');
const { BOT_TOKEN, signInitData, launchFields } = require('./helpers');

const USER = { id: 7012345678, first_name: 'Ana', language_code: 'en' };

test('accepts initData signed with the bot token', () => {
  const result = validateInitData(signInitData(launchFields(USER)), BOT_TOKEN);
  assert.ok(result);
  assert.equal(result.user.id, USER.id);
});

test('field order does not matter', () => {
  const signed = new URLSearchParams(signInitData(launchFields(USER)));
  const reversed = new URLSearchParams([...signed.entries()].reverse()).toString();
  assert.ok(validateInitData(reversed, BOT_TOKEN));
});

test('rejects a changed user', () => {
  const signed = new URLSearchParams(signInitData(launchFields(USER)));
  signed.set('user', JSON.stringify({ ...USER, id: 1 }));
  assert.equal(validateInitData(signed.toString(), BOT_TOKEN), null);
});

test('rejects a changed signature field', () => {
  const signed = new URLSearchParams(signInitData(launchFields(USER)));
  signed.set('signature', 'changed');
  assert.equal(validateInitData(signed.toString(), BOT_TOKEN), null);
});

test('rejects a changed hash, a missing hash and a malformed hash', () => {
  const signed = new URLSearchParams(signInitData(launchFields(USER)));
  const hash = signed.get('hash');
  signed.set('hash', (hash[0] === 'a' ? 'b' : 'a') + hash.slice(1));
  assert.equal(validateInitData(signed.toString(), BOT_TOKEN), null);
  signed.delete('hash');
  assert.equal(validateInitData(signed.toString(), BOT_TOKEN), null);
  signed.set('hash', hash.toUpperCase());
  assert.equal(validateInitData(signed.toString(), BOT_TOKEN), null);
  signed.set('hash', hash.slice(0, 63));
  assert.equal(validateInitData(signed.toString(), BOT_TOKEN), null);
});

test('rejects data signed with another bot token', () => {
  const initData = signInitData(launchFields(USER), '999999:another-bot');
  assert.equal(validateInitData(initData, BOT_TOKEN), null);
});

test('rejects old auth_date and auth_date in the future', () => {
  const now = Math.floor(Date.now() / 1000);
  const old = signInitData(launchFields(USER, { auth_date: String(now - 3601) }));
  assert.equal(validateInitData(old, BOT_TOKEN), null);
  assert.ok(validateInitData(old, BOT_TOKEN, { maxAgeSeconds: 7200 }));
  const future = signInitData(launchFields(USER, { auth_date: String(now + 600) }));
  assert.equal(validateInitData(future, BOT_TOKEN), null);
});

test('rejects signed data without a valid user', () => {
  assert.equal(validateInitData(signInitData(launchFields(USER, { user: 'not json' })), BOT_TOKEN), null);
  assert.equal(validateInitData(signInitData(launchFields({ first_name: 'x' })), BOT_TOKEN), null);
  assert.equal(validateInitData('', BOT_TOKEN), null);
  assert.equal(validateInitData(undefined, BOT_TOKEN), null);
});
