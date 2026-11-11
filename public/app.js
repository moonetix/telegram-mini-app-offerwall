(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp;
  var $ = function (id) { return document.getElementById(id); };
  var wallLink = null;

  function setStatus(text) { $('status').textContent = text || ''; }

  if (!tg || !tg.initData) {
    $('hello').textContent = 'Open this app from Telegram.';
    $('refresh').hidden = true;
    return;
  }

  tg.ready();
  tg.expand();

  function post(path, extra) {
    var body = Object.assign({ initData: tg.initData }, extra || {});
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function show(session) {
    $('hello').textContent = session.name ? 'Hi, ' + session.name : 'Hi';
    $('balance').textContent = session.balance;
    $('currency').textContent = session.currency;
    $('age').hidden = session.ageConfirmed;
    $('earn-box').hidden = !session.ageConfirmed;
    if (session.ageConfirmed && !wallLink) loadLink();
  }

  function loadSession() {
    setStatus('');
    return post('/api/session').then(function (r) {
      if (r.ok) return show(r.data);
      setStatus(r.status === 403 ? 'Your session expired. Close the app and open it again.' : 'Something went wrong. Try again.');
    }).catch(function () { setStatus('No connection. Try again.'); });
  }

  function loadLink() {
    $('earn').disabled = true;
    post('/api/offerwall-link').then(function (r) {
      if (r.ok && typeof r.data.url === 'string' && r.data.url.indexOf('https://wall.moonetix.com/') === 0) {
        wallLink = r.data.url;
        $('earn').disabled = false;
      } else {
        setStatus('The offerwall is not available right now.');
      }
    }).catch(function () { setStatus('No connection. Try again.'); });
  }

  // openLink only works inside a user action, so the link is fetched first and opened on tap.
  $('earn').addEventListener('click', function () {
    if (wallLink) tg.openLink(wallLink);
  });

  $('confirm-age').addEventListener('click', function () {
    post('/api/confirm-age', { confirm: true }).then(function (r) {
      if (r.ok) show(r.data);
    });
  });

  $('refresh').addEventListener('click', loadSession);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') loadSession();
  });
  if (typeof tg.onEvent === 'function') tg.onEvent('activated', loadSession);

  loadSession();
})();
