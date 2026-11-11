'use strict';

const { DatabaseSync } = require('node:sqlite');

function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL UNIQUE,
      age_confirmed_at TEXT,
      balance_micro INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS moonetix_transactions (
      transaction_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      reward_micro INTEGER NOT NULL,
      status INTEGER NOT NULL CHECK (status IN (1, 2)),
      offer_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const q = {
    byTelegram: db.prepare('SELECT * FROM accounts WHERE telegram_id = ?'),
    byId: db.prepare('SELECT * FROM accounts WHERE id = ?'),
    insertAccount: db.prepare('INSERT INTO accounts (telegram_id) VALUES (?) ON CONFLICT (telegram_id) DO NOTHING'),
    confirmAge: db.prepare("UPDATE accounts SET age_confirmed_at = COALESCE(age_confirmed_at, CURRENT_TIMESTAMP) WHERE id = ?"),
    addBalance: db.prepare('UPDATE accounts SET balance_micro = balance_micro + ? WHERE id = ?'),
    getTx: db.prepare('SELECT * FROM moonetix_transactions WHERE transaction_id = ?'),
    insertTx: db.prepare(`INSERT INTO moonetix_transactions (transaction_id, account_id, reward_micro, status, offer_name)
      VALUES (?, ?, ?, 1, ?) ON CONFLICT (transaction_id) DO NOTHING`),
    reverseTx: db.prepare("UPDATE moonetix_transactions SET status = 2, updated_at = CURRENT_TIMESTAMP WHERE transaction_id = ? AND status = 1"),
  };

  function inTransaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return {
    // Telegram IDs can exceed 32 bits, so they are stored as text.
    findOrCreateByTelegramId(telegramId) {
      const key = String(telegramId);
      q.insertAccount.run(key);
      return q.byTelegram.get(key);
    },

    getAccount(id) {
      return q.byId.get(id) || null;
    },

    confirmAge(id) {
      q.confirmAge.run(id);
    },

    // Applies one verified postback. Returns what happened, as a short word.
    applyPostback({ transactionId, accountId, rewardMicro, status, offerName }) {
      return inTransaction(() => {
        const account = q.byId.get(accountId);
        if (status === 1) {
          if (q.getTx.get(transactionId)) return 'duplicate';
          if (!account) return 'unknown_user';
          const res = q.insertTx.run(transactionId, accountId, rewardMicro, offerName || null);
          if (res.changes !== 1) return 'duplicate';
          q.addBalance.run(rewardMicro, accountId);
          return 'credited';
        }
        const tx = q.getTx.get(transactionId);
        if (!tx) return 'not_credited';
        if (tx.status === 2) return 'duplicate';
        if (tx.account_id !== accountId) return 'user_mismatch';
        q.reverseTx.run(transactionId);
        // Take back exactly what was credited, never more.
        q.addBalance.run(-tx.reward_micro, tx.account_id);
        return 'reversed';
      });
    },

    close() {
      db.close();
    },
  };
}

module.exports = { openStore };
