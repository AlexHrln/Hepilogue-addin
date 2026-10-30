/* Accès au classeur via Office.js.
 * Principes :
 *  - on relit toujours la table juste avant d'écrire (co-édition SharePoint) ;
 *  - la ligne à modifier est retrouvée par ses valeurs, pas seulement par son numéro ;
 *  - seules les cellules modifiées des colonnes de saisie sont écrites ;
 *  - les colonnes calculées (formule commune à la colonne) ne sont jamais écrites.
 */
(function () {
  const U = Hepi.U;
  const X = {};

  X.colLetter = function (j) {
    let s = ''; j += 1;
    while (j > 0) { const m = (j - 1) % 26; s = String.fromCharCode(65 + m) + s; j = Math.floor((j - 1) / 26); }
    return s;
  };
  X.colIndex = function (letters) {
    let n = 0; for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1;
  };
  /* "'BDD Paiments'!A2:AX75" -> { sheet, r1, c1, r2, c2 } (indices 0) */
  X.parseAddress = function (addr) {
    const m = /^(?:'?(.+?)'?!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(addr || '');
    if (!m) return null;
    const sheet = m[1] ? m[1].replace(/''/g, "'") : '';
    const c1 = X.colIndex(m[2]), r1 = +m[3] - 1;
    const c2 = m[4] ? X.colIndex(m[4]) : c1, r2 = m[5] ? +m[5] - 1 : r1;
    return { sheet, r1, c1, r2, c2 };
  };

  function indexOf(headers) { const o = {}; headers.forEach((h, j) => { o[h] = j; }); return o; }

  /* Colonne calculée = au moins 80 % des lignes non vides partagent la même formule R1C1. */
  function detectCalc(fR1C1, values) {
    const calc = {};
    if (!fR1C1 || !fR1C1.length) return calc;
    const ncol = fR1C1[0].length;
    for (let j = 0; j < ncol; j++) {
      const counts = {}; let n = 0;
      for (let i = 0; i < fR1C1.length; i++) {
        const f = fR1C1[i][j];
        if (typeof f === 'string' && f.startsWith('=')) { counts[f] = (counts[f] || 0) + 1; n++; }
        else if (!U.isBlank(values[i][j])) n++;
      }
      let best = null, bc = 0;
      for (const f in counts) if (counts[f] > bc) { bc = counts[f]; best = f; }
      if (best && n > 0 && bc / n >= 0.8) calc[j] = best;
    }
    return calc;
  }
  X._detectCalc = detectCalc;

  function buildTableData(name, sheetName, hdrValues, body) {
    const headers = hdrValues[0].map(h => String(h).trim());
    const idx = indexOf(headers);
    const calc = detectCalc(body.formulasR1C1, body.values);
    const rows = [];
    body.values.forEach((v, i) => {
      const empty = v.every((x, j) => calc[j] !== undefined || U.isBlank(x));
      if (!empty) rows.push({ i, v, f: body.formulas[i] });
    });
    return { name, sheet: sheetName, headers, idx, calc, rows, bodyAddress: body.address, rowCount: body.rowCount, ts: Date.now() };
  }

  /* Lecture de plusieurs tables + tableau de bord, en deux allers-retours. */
  X.readAll = function (tableNames, opts) {
    opts = opts || {};
    return Excel.run(async ctx => {
      const wb = ctx.workbook;
      const tRefs = {};
      tableNames.forEach(n => { tRefs[n] = wb.tables.getItemOrNullObject(n); });
      const dcfg = Hepi.config.dashboard;
      const dSheet = opts.dashboard ? wb.worksheets.getItemOrNullObject(dcfg.sheet) : null;
      const nOp = opts.dashboard ? wb.names.getItemOrNullObject(dcfg.nameOperation) : null;
      const nMois = opts.dashboard ? wb.names.getItemOrNullObject(dcfg.nameMois) : null;
      await ctx.sync();

      const loads = {};
      for (const n of tableNames) {
        const t = tRefs[n];
        if (t.isNullObject) continue;
        loads[n] = {
          hdr: t.getHeaderRowRange().load('values'),
          body: t.getDataBodyRange().load(['values', 'formulas', 'formulasR1C1', 'rowCount', 'address']),
          ws: t.worksheet.load('name')
        };
      }
      let dRange = null, rOp = null, rMois = null;
      if (dSheet && !dSheet.isNullObject) dRange = dSheet.getRange(dcfg.range).load(['values', 'formulas']);
      if (nOp && !nOp.isNullObject) rOp = nOp.getRange().load('values');
      if (nMois && !nMois.isNullObject) rMois = nMois.getRange().load('values');
      await ctx.sync();

      const out = { tables: {}, dash: null };
      for (const n of tableNames) {
        const l = loads[n];
        out.tables[n] = l ? buildTableData(n, l.ws.name, l.hdr.values, l.body) : null;
      }
      if (opts.dashboard) {
        out.dash = {
          exists: !!dRange,
          op: rOp ? rOp.values[0][0] : '',
          mois: rMois ? rMois.values[0][0] : '',
          values: dRange ? dRange.values : [],
          formulas: dRange ? dRange.formulas : []
        };
      }
      return out;
    });
  };

  /* Lecture légère : opération et mois affichés dans le tableau de bord. */
  X.readDashCtx = function () {
    return Excel.run(async ctx => {
      const dc = Hepi.config.dashboard;
      const a = ctx.workbook.names.getItemOrNullObject(dc.nameOperation);
      const b = ctx.workbook.names.getItemOrNullObject(dc.nameMois);
      await ctx.sync();
      const ra = a.isNullObject ? null : a.getRange().load('values');
      const rb = b.isNullObject ? null : b.getRange().load('values');
      await ctx.sync();
      return { op: ra ? ra.values[0][0] : '', mois: rb ? rb.values[0][0] : '' };
    });
  };

  function nearest(cands, hint) {
    if (hint === null || hint === undefined) return cands[0];
    return cands.reduce((a, b) => Math.abs(b - hint) < Math.abs(a - hint) ? b : a, cands[0]);
  }

  /* Retrouve une ligne : 1) numéro + valeurs identiques ; 2) valeurs identiques ailleurs ;
   * 3) mêmes champs clés (la ligne a été modifiée par quelqu'un d'autre entre-temps). */
  function locate(values, idx, base, keyFields, hint) {
    const fields = Object.keys(base).filter(h => idx[h] !== undefined);
    const matchAll = r => fields.every(h => U.same(r[idx[h]], base[h]));
    if (hint !== null && hint !== undefined && hint < values.length && matchAll(values[hint])) return { i: hint, exact: true };
    let cands = [];
    values.forEach((r, i) => { if (matchAll(r)) cands.push(i); });
    if (cands.length) return { i: nearest(cands, hint), exact: true };
    const kf = (keyFields || []).filter(h => idx[h] !== undefined && h in base);
    if (!kf.length) return null;
    cands = [];
    values.forEach((r, i) => { if (kf.every(h => U.same(r[idx[h]], base[h]))) cands.push(i); });
    if (cands.length) return { i: nearest(cands, hint), exact: false };
    return null;
  }
  X._locate = locate;

  function writeCell(cell, v, isText) {
    if (v === undefined || v === null) v = '';
    if (isText && typeof v === 'string' && v !== '' && U.looksConvertible(v)) cell.numberFormat = [['@']];
    cell.values = [[v]];
  }

  /* Modification d'une ligne existante.
   * req = { hint, base:{en-tête: valeur d'origine}, keyFields, changes:{en-tête: nouvelle valeur}, textFields:[...], force } */
  X.updateRow = function (tname, req) {
    return Excel.run(async ctx => {
      const t = ctx.workbook.tables.getItem(tname);
      const hdr = t.getHeaderRowRange().load('values');
      const body = t.getDataBodyRange().load(['values', 'formulasR1C1', 'rowCount']);
      await ctx.sync();
      const headers = hdr.values[0].map(h => String(h).trim());
      const idx = indexOf(headers);
      const calc = detectCalc(body.formulasR1C1, body.values);
      const loc = locate(body.values, idx, req.base, req.keyFields, req.hint);
      if (!loc) return { status: 'notfound' };
      const row = body.values[loc.i];
      const conflicts = [];
      if (!loc.exact) {
        for (const h in req.changes) {
          if (!(h in req.base) || idx[h] === undefined) continue;
          const theirs = row[idx[h]];
          if (!U.same(theirs, req.base[h]) && !U.same(theirs, req.changes[h])) conflicts.push({ h, base: req.base[h], theirs, mine: req.changes[h] });
        }
      }
      if (conflicts.length && !req.force) return { status: 'conflict', conflicts, rowIndex: loc.i };
      const text = new Set(req.textFields || []);
      const before = {};
      for (const h in req.changes) {
        const j = idx[h];
        if (j === undefined) throw new Error(`Colonne introuvable dans ${tname} : « ${h} »`);
        if (calc[j] !== undefined) throw new Error(`La colonne « ${h} » est calculée : elle ne peut pas être modifiée.`);
        before[h] = row[j];
        writeCell(body.getCell(loc.i, j), req.changes[h], text.has(h));
      }
      await ctx.sync();
      const after = {};
      headers.forEach((h, j) => { after[h] = (h in req.changes) ? req.changes[h] : row[j]; });
      return { status: 'ok', rowIndex: loc.i, before, after, merged: !loc.exact };
    });
  };

  /* Modification groupée de plusieurs lignes d'une même table (une seule synchronisation).
   * reqs = [{ hint, base, changes }] ; les lignes en conflit sont ignorées et signalées. */
  X.updateRows = function (tname, reqs, opts) {
    opts = opts || {};
    return Excel.run(async ctx => {
      const t = ctx.workbook.tables.getItem(tname);
      const hdr = t.getHeaderRowRange().load('values');
      const body = t.getDataBodyRange().load(['values', 'formulasR1C1', 'rowCount']);
      await ctx.sync();
      const headers = hdr.values[0].map(h => String(h).trim());
      const idx = indexOf(headers);
      const calc = detectCalc(body.formulasR1C1, body.values);
      const text = new Set(opts.textFields || []);
      const results = reqs.map(req => {
        const loc = locate(body.values, idx, req.base, opts.keyFields, req.hint);
        if (!loc) return { status: 'notfound' };
        const row = body.values[loc.i];
        if (!loc.exact) {
          const c = Object.keys(req.changes).filter(h => h in req.base && idx[h] !== undefined && !U.same(row[idx[h]], req.base[h]) && !U.same(row[idx[h]], req.changes[h]));
          if (c.length) return { status: 'conflict', fields: c };
        }
        const before = {};
        for (const h in req.changes) {
          const j = idx[h];
          if (j === undefined || calc[j] !== undefined) continue;
          before[h] = row[j];
          writeCell(body.getCell(loc.i, j), req.changes[h], text.has(h));
        }
        return { status: 'ok', rowIndex: loc.i, before };
      });
      await ctx.sync();
      return results;
    });
  };

  /* Ajout de lignes. objs = [{en-tête: valeur}] ; opts = { textFields, formats:{en-tête: format}, index } */
  X.addRows = function (tname, objs, opts) {
    opts = opts || {};
    return Excel.run(async ctx => {
      const t = ctx.workbook.tables.getItem(tname);
      const hdr = t.getHeaderRowRange().load('values');
      const body = t.getDataBodyRange().load(['values', 'formulasR1C1', 'rowCount']);
      await ctx.sync();
      const headers = hdr.values[0].map(h => String(h).trim());
      const idx = indexOf(headers);
      const calc = detectCalc(body.formulasR1C1, body.values);
      const text = new Set(opts.textFields || []);
      const start = body.rowCount;
      const firstEmpty = start === 1 && body.values[0].every((x, j) => calc[j] !== undefined || U.isBlank(x));
      const unknown = new Set();
      const newIdx = [];
      objs.forEach((o, k) => {
        let rr;
        if (k === 0 && firstEmpty) { rr = body.getRow(0); newIdx.push(0); }
        else if (opts.index !== undefined && objs.length === 1) { rr = t.rows.add(opts.index).getRange(); newIdx.push(opts.index); }
        else { rr = t.rows.add(null).getRange(); newIdx.push(firstEmpty ? start + k - 1 : start + k); }
        for (const h in o) {
          const j = idx[h];
          if (j === undefined) { unknown.add(h); continue; }
          if (calc[j] !== undefined) continue;
          const cell = rr.getCell(0, j);
          if (opts.formats && opts.formats[h]) cell.numberFormat = [[opts.formats[h]]];
          writeCell(cell, o[h], text.has(h));
        }
      });
      await ctx.sync();
      // Les colonnes calculées se recopient normalement seules ; on vérifie quand même.
      if (Object.keys(calc).length) {
        const b2 = t.getDataBodyRange().load('formulasR1C1');
        await ctx.sync();
        let fixes = 0;
        for (const i of newIdx) {
          for (const j in calc) {
            const f = b2.formulasR1C1[i] && b2.formulasR1C1[i][j];
            if (!(typeof f === 'string' && f.startsWith('='))) { b2.getCell(i, +j).formulasR1C1 = [[calc[j]]]; fixes++; }
          }
        }
        if (fixes) await ctx.sync();
      }
      return { status: 'ok', indices: newIdx, unknown: Array.from(unknown) };
    });
  };

  /* Suppression d'une ligne retrouvée par ses valeurs. */
  X.deleteRow = function (tname, req) {
    return Excel.run(async ctx => {
      const t = ctx.workbook.tables.getItem(tname);
      const hdr = t.getHeaderRowRange().load('values');
      const body = t.getDataBodyRange().load(['values', 'formulasR1C1', 'rowCount']);
      await ctx.sync();
      const headers = hdr.values[0].map(h => String(h).trim());
      const idx = indexOf(headers);
      const calc = detectCalc(body.formulasR1C1, body.values);
      const loc = locate(body.values, idx, req.base, req.keyFields, req.hint);
      if (!loc || !loc.exact) return { status: loc ? 'conflict' : 'notfound' };
      const row = body.values[loc.i];
      const values = {};
      headers.forEach((h, j) => { if (calc[j] === undefined) values[h] = row[j]; });
      if (body.rowCount === 1) {
        headers.forEach((h, j) => { if (calc[j] === undefined) body.getCell(0, j).values = [['']]; });
      } else {
        t.rows.getItemAt(loc.i).delete();
      }
      await ctx.sync();
      return { status: 'ok', rowIndex: loc.i, values };
    });
  };

  /* Remplacement d'un libellé dans plusieurs tables (renommage d'un lot ou d'une entreprise).
   * plan = [{ table, filter:{col, val}, cols:[...], from, to }] */
  X.replaceValues = function (plan) {
    return Excel.run(async ctx => {
      const loads = plan.map(p => {
        const t = ctx.workbook.tables.getItemOrNullObject(p.table);
        return { p, t };
      });
      await ctx.sync();
      const live = loads.filter(l => !l.t.isNullObject).map(l => ({
        p: l.p,
        hdr: l.t.getHeaderRowRange().load('values'),
        body: l.t.getDataBodyRange().load('values')
      }));
      await ctx.sync();
      const counts = {};
      for (const l of live) {
        const headers = l.hdr.values[0].map(h => String(h).trim());
        const idx = indexOf(headers);
        const fj = l.p.filter ? idx[l.p.filter.col] : undefined;
        let n = 0;
        l.body.values.forEach((r, i) => {
          if (fj !== undefined && !U.same(r[fj], l.p.filter.val)) return;
          for (const c of l.p.cols) {
            const j = idx[c];
            if (j !== undefined && U.same(r[j], l.p.from)) { writeCell(l.body.getCell(i, j), l.p.to, true); n++; }
          }
        });
        counts[l.p.table] = (counts[l.p.table] || 0) + n;
      }
      await ctx.sync();
      return counts;
    });
  };

  /* Crée une feuille + table si elle n'existe pas encore. */
  X.ensureTable = function (def) {
    return Excel.run(async ctx => {
      const t = ctx.workbook.tables.getItemOrNullObject(def.name);
      await ctx.sync();
      if (!t.isNullObject) return { created: false };
      let name = def.sheet;
      let ws = ctx.workbook.worksheets.getItemOrNullObject(name);
      await ctx.sync();
      if (!ws.isNullObject) {
        const used = ws.getUsedRangeOrNullObject(true);
        await ctx.sync();
        if (!used.isNullObject) { name = def.sheet + ' (panneau)'; ws = null; }
      } else ws = null;
      if (!ws) ws = ctx.workbook.worksheets.add(name);
      const addr = 'A1:' + X.colLetter(def.headers.length - 1) + '1';
      ws.getRange(addr).values = [def.headers];
      const nt = ws.tables.add(addr, true);
      nt.name = def.name;
      if (def.hidden) ws.visibility = 'Hidden';
      await ctx.sync();
      return { created: true, sheet: name };
    });
  };

  X.readRange = function (sheet, address, props) {
    return Excel.run(async ctx => {
      const r = ctx.workbook.worksheets.getItem(sheet).getRange(address).load(props || ['values']);
      await ctx.sync();
      return { values: r.values, formulas: r.formulas };
    });
  };

  X.writeFormulas = function (sheet, address, formulas) {
    return Excel.run(async ctx => {
      ctx.workbook.worksheets.getItem(sheet).getRange(address).formulas = formulas;
      await ctx.sync();
    });
  };

  X.writeNamed = function (pairs) {
    return Excel.run(async ctx => {
      for (const n in pairs) ctx.workbook.names.getItem(n).getRange().values = [[pairs[n]]];
      await ctx.sync();
    });
  };

  X.goToRow = function (tname, rowIndex) {
    return Excel.run(async ctx => {
      const t = ctx.workbook.tables.getItem(tname);
      const ws = t.worksheet.load('visibility');
      await ctx.sync();
      if (ws.visibility !== 'Visible') throw new Error('La feuille de cette table est masquée.');
      ws.activate();
      t.getDataBodyRange().getRow(rowIndex).select();
      await ctx.sync();
    });
  };

  X.activeCell = function () {
    return Excel.run(async ctx => {
      const c = ctx.workbook.getActiveCell();
      c.load(['address', 'rowIndex', 'columnIndex']);
      c.worksheet.load('name');
      await ctx.sync();
      return { sheet: c.worksheet.name, row: c.rowIndex, col: c.columnIndex, address: c.address };
    });
  };

  X.onSelection = function (handler) {
    return Excel.run(async ctx => {
      ctx.workbook.onSelectionChanged.add(handler);
      await ctx.sync();
    });
  };

  X.onTablesChanged = function (names, handler) {
    return Excel.run(async ctx => {
      const refs = names.map(n => ctx.workbook.tables.getItemOrNullObject(n));
      await ctx.sync();
      refs.forEach(t => { if (!t.isNullObject) t.onChanged.add(handler); });
      await ctx.sync();
    });
  };

  X.getSetting = function (k) {
    try { return Office.context.document.settings.get(k); } catch (e) { return null; }
  };
  X.setSetting = function (k, v) {
    return new Promise((resolve, reject) => {
      try {
        const s = Office.context.document.settings;
        if (v === null) s.remove(k); else s.set(k, v);
        s.saveAsync(r => r.status === 'succeeded' ? resolve() : reject(r.error));
      } catch (e) { reject(e); }
    });
  };

  X.friendlyError = function (e) {
    const code = e && (e.code || (e.debugInfo && e.debugInfo.code));
    const msg = (e && e.message) || String(e);
    if (code === 'InvalidOperationInCellEditMode' || /cell edit mode|mode édition/i.test(msg))
      return 'Une cellule Excel est en cours de saisie. Validez-la (touche Entrée) puis réessayez.';
    if (code === 'ItemNotFound') return 'Élément introuvable dans le classeur : une table ou une feuille a peut-être été renommée.';
    if (code === 'AccessDenied') return 'Écriture refusée : le classeur ou la feuille est protégé, ou ouvert en lecture seule.';
    if (code === 'InvalidOperation' && /filter|filtr/i.test(msg)) return 'La table est filtrée : effacez ses filtres puis réessayez.';
    if (code === 'InvalidOperation') return 'Excel a refusé l’opération (table filtrée ou feuille protégée ?). ' + msg;
    return msg;
  };

  Hepi.X = X;
})();
