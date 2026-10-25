/* Paper-only presentation adapter. No credentials, trading calls or mode switches. */
(function (root) {
  'use strict';
  const HOUR = 3600000;
  const names = ['flat', 'buy_hold', 'momentum', 'sma'];
  const strategyLabel = name => name === 'buy_hold' ? 'Always-long mit Risikolimits' : name;
  const statuses = ['COMPLETED', 'FAILED', 'QUARANTINE', 'INTERRUPTED', 'RUNNING'];
  const finite = (x, min = -Infinity, max = Infinity) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  const text = (x, max = 1000) => typeof x === 'string' && x.length > 0 && x.length <= max;
  const stamp = x => finite(x, 0, 8640000000000000) && Number.isInteger(x);
  function requireValue(ok, field) { if (!ok) throw new Error('Ungültiger Paper-Snapshot: ' + field); }
  function validate(s) {
    requireValue(s && s.schema === 1 && s.mode === 'paper' && s.live_trading === false && s.leverage === 1, 'Modus');
    requireValue(['historical_replay', 'paper_session'].includes(s.run_kind) && typeof s.synthetic === 'boolean', 'Datentyp');
    requireValue(!(s.run_kind === 'paper_session' && s.synthetic), 'synthetische Forward-Sitzung');
    requireValue(text(s.generated_at, 60) && /(Z|[+-]\d\d:\d\d)$/.test(s.generated_at) && finite(Date.parse(s.generated_at)), 'Erstellzeit');
    requireValue(stamp(s.market_end_ms) && Number.isInteger(s.bars) && s.bars >= 2 && s.bars <= 100000, 'Marktzeit');
    requireValue(text(s.source) && text(s.symbol, 80) && /^[a-f0-9]{64}$/.test(s.bars_sha256), 'Provenienz');
    const allowed = s.run_kind === 'paper_session' ? ['PAPER_ACTIVE', 'HALTED'] : ['REPLAY_COMPLETE', 'DEGRADED'];
    requireValue(allowed.includes(s.status), 'Status');
    requireValue(Array.isArray(s.branches) && s.branches.length > 0 && s.branches.length <= 16, 'Äste');
    const unique = new Set();
    for (const b of s.branches) {
      requireValue(b && names.includes(b.strategy) && !unique.has(b.strategy) && statuses.includes(b.status), 'Ast');
      unique.add(b.strategy);
      if (b.status !== 'COMPLETED') { requireValue(b.metrics === null, 'Fehlerkennzahlen'); continue; }
      const m = b.metrics;
      requireValue(m && finite(m.initial, .01) && finite(m.final_equity, 0) && finite(m.net_return_pct, -100) && finite(m.max_drawdown_pct, 0, 100), 'Kennzahlen');
      requireValue(Number.isInteger(m.executions) && m.executions >= 0 && typeof m.halted === 'boolean', 'Ausführungen');
      requireValue(Math.abs(m.net_return_pct - 100 * (m.final_equity / m.initial - 1)) < 1e-6, 'Buchhaltung');
    }
    requireValue(s.walk_forward && Array.isArray(s.walk_forward.folds) && s.walk_forward.folds.length <= 1000, 'Walk-Forward');
    let previousEnd = -1;
    for (const f of s.walk_forward.folds) {
      requireValue(f && names.includes(f.selected) && stamp(f.train_end_ms) && stamp(f.test_start_ms) && stamp(f.test_end_ms), 'Testfenster');
      requireValue(f.train_end_ms < f.test_start_ms && f.test_start_ms <= f.test_end_ms && previousEnd < f.test_start_ms, 'Fensterreihenfolge');
      previousEnd = f.test_end_ms;
      requireValue(Array.isArray(f.scenarios) && f.scenarios.length > 0 && f.scenarios.length <= 12, 'Kostenszenarien');
      for (const x of f.scenarios) {
        requireValue(x && finite(x.net_return_pct, -100) && finite(x.passive_matched_return_pct, -100) && finite(x.risk_managed_long_return_pct, -100) && finite(x.max_drawdown_pct, 0, 100), 'Stressergebnis');
        requireValue(Number.isInteger(x.executions) && x.executions >= 0 && typeof x.halted === 'boolean', 'Stressteststatus');
        const p = x.policy;
        requireValue(p && finite(p.fee, 0, .05) && finite(p.slippage, 0, .1) && finite(p.allocation, .001, 1) && finite(p.daily_loss, .001, .02) && finite(p.max_drawdown, .001, .05) && finite(p.stop_loss, .001, .2), 'Risikoregeln');
      }
    }
    requireValue(s.run_kind !== 'paper_session' || s.walk_forward.folds.length === 0, 'Forward-Fenster');
    return s;
  }
  function health(s, now = Date.now()) {
    validate(s);
    if (Date.parse(s.generated_at) > now + 5 * 60000) return {level: 'error', label: 'ZEITFEHLER · Snapshot liegt in der Zukunft'};
    if (s.synthetic) return {level: 'warning', label: 'SYNTHETISCHER TEST · Kein Nachweis von Marktperformance'};
    if (s.run_kind === 'historical_replay') return {level: 'warning', label: 'HISTORISCHER REPLAY · Kein aktueller Paper-Betrieb'};
    if (s.status === 'HALTED' || s.branches.some(b => b.metrics?.halted)) return {level: 'error', label: 'RISIKOSTOPP · Keine neue Paper-Aktivierung'};
    if (s.branches.some(b => b.status !== 'COMPLETED')) return {level: 'error', label: 'ASTFEHLER · Paper-Status nicht vollständig bestätigt'};
    const age = now - (s.market_end_ms + HOUR);
    if (age < 0 || age > 2 * HOUR || now - Date.parse(s.generated_at) > 2 * HOUR) return {level: 'error', label: 'VERALTET ODER UNVOLLSTÄNDIG · Paper-Status nicht aktuell bestätigt'};
    return {level: '', label: 'PAPER-SNAPSHOT AKTUELL · Keine Echtgeld-Orders'};
  }
  const format = x => x.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const date = x => new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short'}).format(new Date(x)) + ' TR';
  function render(s, doc, now = Date.now()) {
    validate(s);
    const put = (id, value) => { doc.getElementById(id).textContent = String(value); };
    const status = health(s, now);
    doc.getElementById('paper-status').className = 'status ' + status.level;
    put('paper-status', status.label);
    put('dataset-kind', s.synthetic ? 'Synthetischer Funktionstest' : s.run_kind === 'paper_session' ? 'Fortlaufende Paper-Sitzung' : 'Historische Marktdaten');
    put('symbol', s.symbol);
    put('market-time', date(s.market_end_ms));
    put('generated-time', date(s.generated_at));
    put('bar-count', s.bars.toLocaleString('de-DE'));
    put('dataset-source', s.source);
    put('dataset-hash', s.bars_sha256);
    put('run-status', s.status);
    put('fold-count', s.walk_forward.folds.length);
    const body = doc.getElementById('branch-rows'); body.replaceChildren();
    for (const b of s.branches) {
      const m = b.metrics;
      const values = [strategyLabel(b.strategy), b.status, m ? format(m.initial) : '—', m ? format(m.final_equity) : '—', m ? format(m.net_return_pct) + ' %' : '—', m ? format(m.max_drawdown_pct) + ' %' : '—', m ? m.executions : '—', m ? (m.halted ? 'HALT' : 'Kein Halt') : 'Nicht bestätigt'];
      const row = doc.createElement('tr');
      for (const value of values) { const cell = doc.createElement('td'); cell.textContent = String(value); row.append(cell); }
      body.append(row);
    }
    const folds = doc.getElementById('fold-rows'); folds.replaceChildren();
    for (const [i, f] of s.walk_forward.folds.entries()) {
      for (const x of f.scenarios) {
        const row = doc.createElement('tr');
        for (const value of [i + 1, date(f.test_start_ms) + ' – ' + date(f.test_end_ms), strategyLabel(f.selected), format(x.policy.fee * 100) + ' % / ' + format(x.policy.slippage * 100) + ' %', format(x.net_return_pct) + ' %', format(x.passive_matched_return_pct) + ' %', format(x.risk_managed_long_return_pct) + ' %', format(x.max_drawdown_pct) + ' %', x.halted ? 'HALT' : 'Kein Halt']) {
          const cell = doc.createElement('td'); cell.textContent = String(value); row.append(cell);
        }
        folds.append(row);
      }
    }
    doc.getElementById('fold-empty').hidden = s.walk_forward.folds.length > 0;
  }
  function mount(doc) {
    let saved = null, local = false, busy = false, version = 0, displayError = false;
    const showError = message => { displayError = true; const el = doc.getElementById('paper-status'); el.className = 'status error'; el.textContent = message; };
    const accept = s => { validate(s); render(s, doc); saved = s; displayError = false; };
    async function refresh() {
      if (busy) return;
      busy = true;
      const requestVersion = ++version;
      try {
        const response = await fetch('./paper-data.json?t=' + Date.now(), {cache: 'no-store'});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const raw = await response.text();
        if (raw.length > 5000000) throw new Error('Datei zu groß');
        if (requestVersion !== version) return;
        accept(JSON.parse(raw)); local = false;
        doc.getElementById('loaded-from').textContent = 'Quelle: veröffentlichte paper-data.json';
      } catch (error) { if (requestVersion !== version) return; showError('Laden fehlgeschlagen. ' + (saved ? 'Letzte Werte bleiben sichtbar, sind nicht erneut bestätigt. ' : '') + error.message); }
      finally { busy = false; }
    }
    doc.getElementById('paper-refresh').addEventListener('click', refresh);
    doc.getElementById('paper-file').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      const importVersion = ++version;
      try {
        if (file.size > 5000000) throw new Error('Datei zu groß');
        const raw = await file.text();
        if (importVersion !== version) return;
        accept(JSON.parse(raw)); local = true;
        doc.getElementById('loaded-from').textContent = 'Lokal geladen: ' + file.name + ' · Keine Übertragung an einen Server';
      } catch (error) { if (importVersion !== version) return; showError(error.message + ' · Vorherige Anzeige nicht erneut bestätigt.'); }
    });
    refresh();
    setInterval(() => { if (local && saved) { if (!displayError) render(saved, doc); } else refresh(); }, 60000);
  }
  const api = {validate, health, render, mount};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.YggdrasilPaper = api; if (root.document) mount(root.document); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
