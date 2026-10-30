/* Lecture et écriture dans le classeur (Office.js).
 * - la table est relue juste avant d'écrire, et la ligne retrouvée par ses valeurs (co-édition) ;
 * - seules les cellules modifiées sont écrites ;
 * - les colonnes calculées (formule commune à toute la colonne) ne sont jamais écrites. */
(function () {
  const U = Hepi.U;
  const X = {};

  const indexOf = headers => { const o = {}; headers.forEach((h, j) => { o[h] = j; }); return o; };

  /* Colonne calculée : au moins 80 % des lignes partagent la même formule R1C1. */
  function detectCalc(fR1C1, values) {
    const calc = {};
    if (!fR1C1 || !fR1C1.length) return calc;
    for (let j = 0; j < fR1C1[0].length; j++) {
      const counts = {}; let n = 0;
      for (let i = 0; i < fR1C1.length; i++) {
        const f = fR1C1[i][j];
        if (typeof f === 'string' && f.startsWith('=')) { counts[f] = (counts[f] || 0) + 1; n++; }
        else if (!U.isBlank(values[i][j])) n++;
      }
      let best = null, bc = 0;
      for (const f in counts) if (counts[f] > bc) { bc = counts[f]; best = f; }
      if (best && bc / n >= 0.8) calc[j] = best;
    }
    return calc;
  }

  /* Tables demandées + opération et mois du tableau de bord. */
  X.readAll = function (names) {
    return Excel.run(async ctx => {
      const wb = ctx.workbook, d = Hepi.config.dashboard;
      const refs = names.map(n => wb.tables.getItemOrNullObject(n));
      const nOp = wb.names.getItemOrNullObject(d.nameOperation);
      const nMois = wb.names.getItemOrNullObject(d.nameMois);
      await ctx.sync();
      const loads = refs.map(t => t.isNullObject ? null : {
        hdr: t.getHeaderRowRange().load('values'),
        body: t.getDataBodyRange().load(['values', 'formulasR1C1', 'rowCount'])
      });
      const rOp = nOp.isNullObject ? null : nOp.getRange().load('values');
      const rMois = nMois.isNullObject ? null : nMois.getRange().load('values');
      await ctx.sync();
      const tables = {};
      names.forEach((n, k) => {
        const l = loads[k];
        if (!l) { tables[n] = null; return; }
        const headers = l.hdr.values[0].map(h => String(h).trim());
        const calc = detectCalc(l.body.formulasR1C1, l.body.values);
        const rows = [];
        l.body.values.forEach((v, i) => {
          if (v.some((x, j) => calc[j] === undefined && !U.isBlank(x))) rows.push({ i, v });
        });
        tables[n] = { name: n, headers, idx: indexOf(headers), calc, rows };
      });
      return {
        tables,
        op: rOp ? String(rOp.values[0][0] || '') : '',
        mois: rMois ? String(rMois.values[0][0] || '') : ''
      };
    });
  };

  function locate(values, idx, base, hint, used) {
    const fields = Object.keys(base).filter(h => idx[h] !== undefined);
    const same = r => fields.every(h => U.same(r[idx[h]], base[h]));
    const free = i => !used || !used.has(i);
    if (hint !== undefined && hint < values.length && free(hint) && same(values[hint])) return hint;
    const found = [];
    values.forEach((r, i) => { if (free(i) && same(r)) found.push(i); });
    if (!found.length) return -1;
    return found.reduce((a, b) => Math.abs(b - hint) < Math.abs(a - hint) ? b : a);
  }

  function writeCell(cell, v, isText) {
    if (v === undefined || v === null) v = '';
    // Un texte comme « 25-02-34 » ou « 2605E035 » serait converti par Excel en date ou en nombre
    if (isText && typeof v === 'string' && v !== '' && U.looksConvertible(v)) cell.numberFormat = [['@']];
    cell.values = [[v]];
  }

  /* Modifie une ou plusieurs lignes d'une table, en une seule fois.
   * reqs = [{ base, hint, changes }] : base = valeurs de la ligne à l'ouverture de la fiche.
   * Si l'une des lignes a été modifiée entre-temps par quelqu'un d'autre, rien n'est écrit. */
  X.updateRows = function (table, reqs, textCols) {
    return Excel.run(async ctx => {
      const t = ctx.workbook.tables.getItem(table);
      const hdr = t.getHeaderRowRange().load('values');
      const body = t.getDataBodyRange().load(['values', 'formulasR1C1']);
      await ctx.sync();
      const headers = hdr.values[0].map(h => String(h).trim());
      const idx = indexOf(headers);
      const calc = detectCalc(body.formulasR1C1, body.values);
      const used = new Set();
      const rows = [];
      for (const req of reqs) {
        const i = locate(body.values, idx, req.base, req.hint, used);
        if (i < 0) return { status: 'changed' };
        used.add(i); rows.push(i);
      }
      reqs.forEach((req, k) => {
        for (const h in req.changes) {
          const j = idx[h];
          if (j === undefined) throw new Error(`Colonne « ${h} » introuvable dans ${table}.`);
          if (calc[j] !== undefined) throw new Error(`La colonne « ${h} » est calculée : elle n’est pas modifiable.`);
          writeCell(body.getCell(rows[k], j), req.changes[h], (textCols || []).includes(h));
        }
      });
      await ctx.sync();
      return { status: 'ok', rows };
    });
  };

  /* Ajoute une ligne en fin de table. Les colonnes calculées se remplissent seules ; on le vérifie. */
  X.addRow = function (table, obj, textCols) {
    return Excel.run(async ctx => {
      const t = ctx.workbook.tables.getItem(table);
      const hdr = t.getHeaderRowRange().load('values');
      const body = t.getDataBodyRange().load(['values', 'formulasR1C1', 'rowCount']);
      await ctx.sync();
      const headers = hdr.values[0].map(h => String(h).trim());
      const idx = indexOf(headers);
      const calc = detectCalc(body.formulasR1C1, body.values);
      const firstEmpty = body.rowCount === 1 && body.values[0].every((x, j) => calc[j] !== undefined || U.isBlank(x));
      const at = firstEmpty ? 0 : body.rowCount;
      const range = firstEmpty ? body.getRow(0) : t.rows.add(null).getRange();
      const unknown = [];
      for (const h in obj) {
        const j = idx[h];
        if (j === undefined) { unknown.push(h); continue; }
        if (calc[j] !== undefined) continue;
        writeCell(range.getCell(0, j), obj[h], (textCols || []).includes(h));
      }
      await ctx.sync();
      if (Object.keys(calc).length) {
        const b2 = t.getDataBodyRange().load('formulasR1C1');
        await ctx.sync();
        let fix = 0;
        for (const j in calc) {
          const f = b2.formulasR1C1[at] && b2.formulasR1C1[at][j];
          if (!(typeof f === 'string' && f.startsWith('='))) { b2.getCell(at, +j).formulasR1C1 = [[calc[j]]]; fix++; }
        }
        if (fix) await ctx.sync();
      }
      return { status: 'ok', rowIndex: at, unknown };
    });
  };

  /* Prévenir le panneau quand l'opération ou le mois du tableau de bord change, ou quand une table change. */
  X.watch = function (tableNames, onDashboard, onTables) {
    return Excel.run(async ctx => {
      const ws = ctx.workbook.worksheets.getItemOrNullObject(Hepi.config.dashboard.sheet);
      const refs = tableNames.map(n => ctx.workbook.tables.getItemOrNullObject(n));
      await ctx.sync();
      if (!ws.isNullObject) ws.onChanged.add(onDashboard);
      refs.forEach(t => { if (!t.isNullObject) t.onChanged.add(onTables); });
      await ctx.sync();
    });
  };

  X.friendlyError = function (e) {
    const code = e && e.code;
    const msg = (e && e.message) || String(e);
    if (code === 'InvalidOperationInCellEditMode' || /cell edit mode/i.test(msg))
      return 'Une cellule Excel est en cours de saisie : validez-la (Entrée) puis réessayez.';
    if (code === 'ItemNotFound') return 'Table ou nom introuvable dans le classeur (renommé ?).';
    if (code === 'AccessDenied') return 'Écriture refusée : feuille protégée ou classeur en lecture seule.';
    if (code === 'InvalidOperation') return 'Excel a refusé l’écriture (table filtrée ou feuille protégée ?).';
    return msg;
  };

  Hepi.X = X;
})();
