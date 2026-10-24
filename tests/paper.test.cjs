const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('../paper.js');
const sample = JSON.parse(fs.readFileSync(__dirname + '/../paper-data.json', 'utf8'));
const clone = () => structuredClone(sample);
const now = Date.parse(sample.generated_at);
test('synthetic fixture is explicitly research-only', () => {
  assert.equal(api.validate(clone()).synthetic, true);
  assert.match(api.health(sample, now).label, /SYNTHETISCHER/);
});
test('reject live mode, leverage and non-boolean flags', () => {
  for (const [key,value] of [['mode','live'],['live_trading',true],['live_trading',0],['leverage',2],['leverage','1'],['synthetic','false']]) {
    const s = clone(); s[key] = value; assert.throws(() => api.validate(s));
  }
});
test('reject NaN, strings, impossible metrics and inconsistent accounting', () => {
  for (const [key,value] of [['initial',NaN],['initial',0],['final_equity','500'],['net_return_pct',10],['max_drawdown_pct',101],['executions',1.2],['halted','false']]) {
    const s = clone(); s.branches[0].metrics[key] = value; assert.throws(() => api.validate(s));
  }
});
test('reject duplicate branches and malformed folds', () => {
  const duplicate = clone(); duplicate.branches.push(duplicate.branches[0]); assert.throws(() => api.validate(duplicate));
  const futureTrain = clone(); futureTrain.walk_forward.folds[0].train_end_ms = futureTrain.walk_forward.folds[0].test_start_ms; assert.throws(() => api.validate(futureTrain));
  const risk = clone(); risk.walk_forward.folds[0].scenarios[0].policy.daily_loss = .5; assert.throws(() => api.validate(risk));
});
test('timestamps and provenance are required', () => {
  for (const [key,value] of [['market_end_ms',NaN],['generated_at','2026-10-24'],['source',''],['bars_sha256','nope'],['bars',2.5]]) {
    const s = clone(); s[key] = value; assert.throws(() => api.validate(s));
  }
});
function session() { const s = clone(); s.synthetic=false; s.run_kind='paper_session'; s.status='PAPER_ACTIVE'; s.walk_forward.folds=[]; s.market_end_ms=now-3600000; return s; }
test('session freshness uses market data age independently of generation', () => {
  const s=session(); assert.equal(api.health(s,now).level,'');
  s.market_end_ms=now-4*3600000; assert.match(api.health(s,now).label,/VERALTET/);
});
test('future candles and generation timestamps do not look healthy', () => {
  const s=session(); s.market_end_ms=now; assert.equal(api.health(s,now).level,'error');
  const future=session(); future.generated_at=new Date(now+600000).toISOString(); assert.match(api.health(future,now).label,/ZEITFEHLER/);
});
test('risk stop and historical replay remain distinct', () => {
  const s=session(); s.status='HALTED'; assert.match(api.health(s,now).label,/RISIKOSTOPP/);
  const historical=clone(); historical.synthetic=false; assert.match(api.health(historical,now).label,/HISTORISCHER/);
});
class Element {
  constructor() { this.children=[]; this.textContent=''; this.className=''; this.hidden=false; }
  append(x) { this.children.push(x); }
  replaceChildren() { this.children=[]; }
  set innerHTML(value) { throw Error('HTML injection sink used'); }
}
function dom() { const ids=new Map(); return {getElementById(id) { if(!ids.has(id))ids.set(id,new Element()); return ids.get(id); },createElement() {return new Element();}}; }
test('render uses literal textContent for untrusted source and symbol', () => {
  const s=clone(); const payload='<img src=x onerror=alert(1)>'; s.source=payload; s.symbol=payload;
  const doc=dom(); api.render(s,doc,now);
  assert.equal(doc.getElementById('dataset-source').textContent,payload);
  assert.equal(doc.getElementById('symbol').textContent,payload);
  assert.equal(doc.getElementById('branch-rows').children.length,4);
  assert.equal(doc.getElementById('fold-rows').children.length,12);
});
test('render rejects unsafe snapshots before altering the display', () => {
  const s=clone(); s.mode='live'; const doc=dom(); assert.throws(()=>api.render(s,doc,now));
  assert.equal(doc.getElementById('branch-rows').children.length,0);
});
test('failure branches expose no fabricated metrics', () => {
  const s=clone(); s.branches[0]={strategy:'flat',status:'FAILED',metrics:null}; s.status='DEGRADED';
  const doc=dom(); api.render(s,doc,now); assert.equal(doc.getElementById('branch-rows').children[0].children[2].textContent,'—');
});
test('failed branch never receives healthy forward status', () => {
  const s=session(); s.branches[0]={strategy:'flat',status:'FAILED',metrics:null};
  assert.equal(api.health(s,now).level,'error');
});
test('passive and risk-managed comparisons are distinct required metrics', () => {
  for (const field of ['passive_matched_return_pct','risk_managed_long_return_pct']) {
    const s=clone(); delete s.walk_forward.folds[0].scenarios[0][field];
    assert.throws(()=>api.validate(s));
  }
  const doc=dom(); api.render(clone(),doc,now);
  assert.equal(doc.getElementById('branch-rows').children[1].children[0].textContent,'Always-long mit Risikolimits');
  assert.equal(doc.getElementById('fold-rows').children[0].children.length,9);
});
