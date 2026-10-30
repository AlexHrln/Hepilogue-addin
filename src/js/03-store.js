/* Données en mémoire, listes de référence, écriture + journal + annulation. */
(function () {
  const U = Hepi.U, X = Hepi.X, C = Hepi.config;
  const S = {
    data: {},          // clé de table -> TableData
    dash: null,        // tableau de bord analysé
    ctx: { op: '', mois: '', follow: true },
    lastLoad: 0,
    lastOwnWrite: 0,
    undoAction: null
  };
  const listeners = {};
  S.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  S.emit = (ev, arg) => (listeners[ev] || []).forEach(fn => { try { fn(arg); } catch (e) { console.error(e); } });

  S.tableKeys = Object.keys(C.tables);
  S.cfg = key => C.tables[key];
  S.tableName = key => C.tables[key].name;
  const keyByName = {};
  S.tableKeys.forEach(k => { keyByName[C.tables[k].name] = k; });

  /* ---------- Chargement ---------- */
  S.load = async function () {
    const names = S.tableKeys.map(k => C.tables[k].name);
    const res = await X.readAll(names, { dashboard: true });
    S.data = {};
    for (const n in res.tables) S.data[keyByName[n]] = res.tables[n];
    S.dash = parseDashboard(res.dash);
    S.lastLoad = Date.now();
    buildCaches();
    if (S.ctx.follow || !S.ctx.op) syncCtxFromDashboard();
    S.emit('data');
    return S;
  };

  function parseDashboard(d) {
    if (!d || !d.exists) return d ? { exists: false, op: d.op, mois: d.mois, months: [], pairs: [], sts: [] } : null;
    const dc = C.dashboard;
    const hdr = (d.values[0] || []).map(x => String(x).trim());
    const col = {};
    for (const k in dc.cols) col[k] = hdr.indexOf(dc.cols[k]);
    const months = [], pairs = [], sts = [];
    let block = 'mand';
    for (let r = 1; r < d.values.length; r++) {
      const row = d.values[r], frm = d.formulas[r] || [];
      const excelRow = dc.headerRow + r;
      if (r <= dc.monthRows && col.mois >= 0 && !U.isBlank(row[col.mois])) {
        months.push({
          row: excelRow, mois: String(row[col.mois]),
          netDeclare: col.netDeclareMois >= 0 ? row[col.netDeclareMois] : '',
          netValide: col.netValide >= 0 ? row[col.netValide] : '',
          commentaire: col.commentaire >= 0 ? row[col.commentaire] : '',
          valideFormula: col.netValide >= 0 ? frm[col.netValide] : '',
          commentaireFormula: col.commentaire >= 0 ? frm[col.commentaire] : ''
        });
      }
      if (col.entreprise < 0) continue;
      const ent = row[col.entreprise];
      const empty = U.isBlank(ent) || U.isErr(ent);
      if (!empty && U.same(ent, dc.stHeader)) { block = 'st'; continue; }
      if (empty) { if (block === 'mand' && pairs.length) block = 'gap'; continue; }
      if (block === 'mand') {
        pairs.push({
          row: excelRow, entreprise: String(ent), lot: String(row[col.lot] || ''),
          netCalcule: col.netCalcule >= 0 ? row[col.netCalcule] : '',
          netDeclare: col.netDeclare >= 0 ? row[col.netDeclare] : ''
        });
      } else if (block === 'st') {
        sts.push({ row: excelRow, entreprise: String(ent), mandataire: String(row[col.lot] || '') });
      }
    }
    return { exists: true, op: d.op, mois: d.mois, col, months, pairs, sts };
  }

  function syncCtxFromDashboard() {
    if (!S.dash) return;
    if (!U.isBlank(S.dash.op)) S.ctx.op = String(S.dash.op);
    if (!U.isBlank(S.dash.mois)) S.ctx.mois = String(S.dash.mois);
    if (!S.ctx.op) S.ctx.op = S.operations()[0] || '';
  }
  S.syncCtxFromDashboard = syncCtxFromDashboard;

  /* ---------- Enregistrements ---------- */
  S.has = key => !!S.data[key];
  S.isCalc = (key, h) => { const t = S.data[key]; return !!t && t.calc[t.idx[h]] !== undefined; };
  S.inputHeaders = key => { const t = S.data[key]; return t ? t.headers.filter((h, j) => t.calc[j] === undefined) : (C.tables[key].headers || []); };
  S.calcHeaders = key => { const t = S.data[key]; return t ? t.headers.filter((h, j) => t.calc[j] !== undefined) : []; };

  const recCache = {};
  function buildCaches() {
    for (const k in recCache) delete recCache[k];
  }
  S.records = function (key) {
    if (recCache[key]) return recCache[key];
    const t = S.data[key];
    if (!t) return [];
    const recs = t.rows.map(row => {
      const r = { _key: key, _i: row.i, _f: {}, _base: {} };
      t.headers.forEach((h, j) => {
        r[h] = row.v[j];
        if (t.calc[j] === undefined) {
          r._base[h] = row.v[j];
          if (typeof row.f[j] === 'string' && row.f[j].startsWith('=')) r._f[h] = row.f[j];
        }
      });
      return r;
    });
    recCache[key] = recs;
    return recs;
  };
  S.findLike = function (key, values, hint) {
    const recs = S.records(key);
    const t = S.data[key];
    if (!t) return null;
    const fields = Object.keys(values).filter(h => !S.isCalc(key, h) && t.idx[h] !== undefined);
    const cands = recs.filter(r => fields.every(h => U.same(r[h], values[h])));
    if (!cands.length) return null;
    if (hint === undefined || hint === null) return cands[cands.length - 1];
    return cands.reduce((a, b) => Math.abs(b._i - hint) < Math.abs(a._i - hint) ? b : a);
  };

  S.fieldDef = function (key, h) {
    const f = C.tables[key].fields[h];
    if (f) return f;
    if (key === 'indices' && h !== 'Mois') return { label: h, type: 'coef' };
    return { label: h, type: 'text', extra: true };
  };
  S.textFields = key => {
    const t = S.data[key];
    const hs = t ? t.headers : (C.tables[key].headers || []);
    return hs.filter(h => ['text', 'select', 'month', 'textarea'].includes(S.fieldDef(key, h).type));
  };
  S.keyString = function (key, rec) {
    const cfg = C.tables[key];
    return (cfg.key || []).map(h => U.display(rec[h], S.fieldDef(key, h).type)).filter(x => x !== '').join(' | ');
  };

  /* ---------- Listes ---------- */
  const col = (key, h, filter) => S.records(key).filter(filter || (() => true)).map(r => r[h]);
  S.operations = function () {
    const ops = []
      .concat(col('marches', 'Operation'), col('entreprises', 'Operation'), col('paiements', 'Opération'), col('avancement', 'Opération'))
      .concat(S.dash && !U.isBlank(S.dash.op) ? [S.dash.op] : []);
    return U.sortFr(U.uniq(ops.map(String)));
  };
  S.lots = op => U.sortFr(U.uniq(col('marches', 'Denomination_Lot', r => U.same(r.Operation, op)).map(String)));
  S.lotsAndEG = op => U.sortFr(U.uniq([].concat(S.lots(op), col('entreprises', 'Denomination_Lot', r => U.same(r.Operation, op)).map(String), [C.lists.lotEntrepriseGenerale])));
  S.entreprises = op => U.sortFr(U.uniq(col('entreprises', 'Entreprise', r => U.same(r.Operation, op)).map(String)));
  S.mandataires = op => U.sortFr(U.uniq(col('entreprises', 'Entreprise', r => U.same(r.Operation, op) && r.Type === 'Mandataire').map(String)));
  S.indexNames = () => { const t = S.data.indices; return t ? t.headers.filter(h => h !== 'Mois') : []; };
  S.monthList = () => col('indices', 'Mois').map(String).filter(Boolean);
  S.monthsForOp = function (op) {
    const ms = [].concat(
      col('paiements', 'Mois', r => U.same(r['Opération'], op)),
      col('avancement', 'Mois', r => U.same(r['Opération'], op))
    ).map(String).filter(m => /^\d{4}_\d{2}/.test(m));
    if (S.dash && U.same(S.dash.op, op)) S.dash.months.forEach(m => { if (/^\d{4}_\d{2}/.test(m.mois)) ms.push(m.mois); });
    return U.uniq(ms).sort().reverse();
  };
  S.list = function (name, rec) {
    const op = rec ? (rec.Operation || rec['Opération'] || S.ctx.op) : S.ctx.op;
    switch (name) {
      case 'operations': return S.operations();
      case 'entreprises': return S.entreprises(op);
      case 'mandataires': case 'mandatairesOp': return S.mandataires(op);
      case 'lots': return S.lots(op);
      case 'lotsAndEG': return S.lotsAndEG(op);
      case 'indexNames': return [''].concat(S.indexNames());
      case 'months': return S.monthList();
      default: return C.lists[name] || [];
    }
  };
  S.stRef = (op, entreprise, lot) => S.records('entreprises').find(r => U.same(r.Operation, op) && U.same(r.Entreprise, entreprise) && (lot === undefined || U.same(r.Denomination_Lot, lot)));

  /* ---------- Utilisateur ---------- */
  S.getUser = () => { try { return localStorage.getItem('hepi.user') || ''; } catch (e) { return ''; } };
  S.setUser = v => { try { localStorage.setItem('hepi.user', v); } catch (e) { /* stockage indisponible */ } };
  S.getPref = (k, d) => { try { const v = localStorage.getItem('hepi.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  S.setPref = (k, v) => { try { localStorage.setItem('hepi.' + k, JSON.stringify(v)); } catch (e) { /* idem */ } };

  /* ---------- Journal ---------- */
  S.journal = async function (entries) {
    if (!entries.length) return;
    try {
      const def = C.tables.journal;
      await X.ensureTable(def);
      const user = S.getUser() || '?';
      const now = U.nowSerial();
      const rows = entries.map(e => ({
        'Horodatage': now, 'Utilisateur': user, 'Action': e.action, 'Table': e.table,
        'Clé': e.key || '', 'Champ': e.field || '',
        'Ancienne valeur': e.before === undefined ? '' : String(e.before),
        'Nouvelle valeur': e.after === undefined ? '' : String(e.after)
      }));
      await X.addRows(def.name, rows, {
        textFields: ['Utilisateur', 'Action', 'Table', 'Clé', 'Champ', 'Ancienne valeur', 'Nouvelle valeur'],
        formats: { 'Horodatage': 'dd/mm/yyyy hh:mm' }
      });
    } catch (e) {
      console.warn('Journal non écrit', e);
      S.emit('warn', 'La modification est enregistrée, mais le journal n’a pas pu être complété : ' + X.friendlyError(e));
    }
  };
  S.historyFor = function (key, rec) {
    const k = S.keyString(key, rec);
    const label = C.tables[key].label;
    return S.records('journal').filter(j => j.Table === label && j['Clé'] === k).reverse();
  };

  /* ---------- Écritures ---------- */
  function fmtForLog(key, h, v) { return U.display(v, S.fieldDef(key, h).type); }

  S.save = async function (key, rec, changes, opts) {
    opts = opts || {};
    const cfg = C.tables[key];
    S.lastOwnWrite = Date.now();
    const res = await X.updateRow(cfg.name, {
      hint: rec._i, base: rec._base, keyFields: cfg.key, changes,
      textFields: S.textFields(key), force: !!opts.force
    });
    if (res.status !== 'ok') return res;
    const keyStr = S.keyString(key, rec);
    await S.journal(Object.keys(changes).map(h => ({
      action: 'Modification', table: cfg.label, key: keyStr, field: h,
      before: fmtForLog(key, h, res.before[h]), after: fmtForLog(key, h, changes[h])
    })));
    await S.load();
    const fresh = S.findLike(key, pickInputs(key, res.after), res.rowIndex);
    if (!opts.noUndo) S.undoAction = {
      label: 'Modification annulée',
      run: async () => {
        if (!fresh) throw new Error('Ligne introuvable.');
        return S.save(key, fresh, res.before, { noUndo: true });
      }
    };
    return { status: 'ok', record: fresh, merged: res.merged };
  };

  /* Plusieurs lignes d'une même table en une fois (ex. grille des indices). items = [{ rec, changes }] */
  S.saveBatch = async function (key, items) {
    const cfg = C.tables[key];
    S.lastOwnWrite = Date.now();
    const res = await X.updateRows(cfg.name, items.map(it => ({ hint: it.rec._i, base: it.rec._base, changes: it.changes })),
      { keyFields: cfg.key, textFields: S.textFields(key) });
    const entries = [];
    res.forEach((r, n) => {
      if (r.status !== 'ok') return;
      const it = items[n];
      for (const h in it.changes) entries.push({ action: 'Modification', table: cfg.label, key: S.keyString(key, it.rec), field: h, before: fmtForLog(key, h, r.before[h]), after: fmtForLog(key, h, it.changes[h]) });
    });
    await S.journal(entries);
    await S.load();
    return { ok: res.filter(r => r.status === 'ok').length, failed: res.filter(r => r.status !== 'ok').length };
  };

  function pickInputs(key, obj) {
    const o = {};
    S.inputHeaders(key).forEach(h => { if (h in obj) o[h] = obj[h]; });
    return o;
  }

  S.create = async function (key, obj, opts) {
    opts = opts || {};
    const cfg = C.tables[key];
    S.lastOwnWrite = Date.now();
    const res = await X.addRows(cfg.name, [obj], { textFields: S.textFields(key), index: opts.index });
    if (!opts.noJournal) {
      await S.journal([{ action: 'Création', table: cfg.label, key: S.keyString(key, obj), field: '', before: '', after: summarize(key, obj) }]);
    }
    await S.load();
    const fresh = S.findLike(key, obj, res.indices[0]);
    if (!opts.noUndo) S.undoAction = {
      label: 'Création annulée',
      run: async () => { if (fresh) await S.remove(key, fresh, { noUndo: true }); }
    };
    return { status: 'ok', record: fresh, unknown: res.unknown };
  };

  S.createMany = async function (key, objs) {
    const cfg = C.tables[key];
    if (!objs.length) return;
    S.lastOwnWrite = Date.now();
    await X.addRows(cfg.name, objs, { textFields: S.textFields(key) });
    await S.journal(objs.map(o => ({ action: 'Création', table: cfg.label, key: S.keyString(key, o), after: summarize(key, o) })));
  };

  S.remove = async function (key, rec, opts) {
    opts = opts || {};
    const cfg = C.tables[key];
    S.lastOwnWrite = Date.now();
    const res = await X.deleteRow(cfg.name, { hint: rec._i, base: rec._base, keyFields: cfg.key });
    if (res.status !== 'ok') return res;
    await S.journal([{ action: 'Suppression', table: cfg.label, key: S.keyString(key, rec), field: '', before: JSON.stringify(res.values), after: '' }]);
    await S.load();
    S.undoAction = opts.noUndo ? null : {
      label: 'Suppression annulée',
      run: async () => S.create(key, res.values, { index: res.rowIndex, noUndo: true })
    };
    return { status: 'ok' };
  };

  function summarize(key, obj) {
    const parts = [];
    for (const h in obj) {
      const v = obj[h];
      if (U.isBlank(v) || v === 0 || v === false) continue;
      parts.push(`${h}=${fmtForLog(key, h, v)}`);
    }
    return parts.join(' ; ').slice(0, 1000);
  }

  /* Renommage d'un lot ou d'une entreprise dans toutes les tables d'une opération. */
  S.renamePlan = function (kind, op, from) {
    const plan = kind === 'lot' ? [
      { key: 'marches', filter: 'Operation', cols: ['Denomination_Lot'] },
      { key: 'entreprises', filter: 'Operation', cols: ['Denomination_Lot'] },
      { key: 'paiements', filter: 'Opération', cols: ['lot'] },
      { key: 'avancement', filter: 'Opération', cols: ['Lot'] }
    ] : [
      { key: 'entreprises', filter: 'Operation', cols: ['Entreprise', 'Mandataire'] },
      { key: 'paiements', filter: 'Opération', cols: ['entreprise', 'mandataire'] }
    ];
    return plan.map(p => {
      let n = 0;
      S.records(p.key).forEach(r => {
        if (!U.same(r[p.filter], op)) return;
        p.cols.forEach(c => { if (U.same(r[c], from)) n++; });
      });
      return Object.assign({}, p, { count: n });
    });
  };
  S.rename = async function (kind, op, from, to, skipKey) {
    const plan = S.renamePlan(kind, op, from).filter(p => p.count > 0 && p.key !== skipKey);
    S.lastOwnWrite = Date.now();
    const counts = await X.replaceValues(plan.map(p => ({
      table: C.tables[p.key].name, filter: { col: p.filter, val: op }, cols: p.cols, from, to
    })));
    await S.journal(plan.map(p => ({
      action: 'Renommage', table: C.tables[p.key].label, key: op, field: p.cols.join(', '),
      before: from, after: `${to} (${counts[C.tables[p.key].name] || 0} cellule(s))`
    })));
    return counts;
  };

  /* Écrit l'opération / le mois dans le tableau de bord. */
  S.pushCtxToDashboard = async function () {
    const pairs = {};
    pairs[C.dashboard.nameOperation] = S.ctx.op;
    if (S.ctx.mois && S.ctx.mois !== '*') pairs[C.dashboard.nameMois] = S.ctx.mois;
    await X.writeNamed(pairs);
  };

  Hepi.S = S;
})();
