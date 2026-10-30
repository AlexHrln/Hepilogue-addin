/* Onglet Référentiel : lots (BDD_Marches), entreprises (BDD_ST), indices BT, nouvelle opération. */
(function () {
  const U = Hepi.U, S = Hepi.S, UI = Hepi.UI, K = Hepi.K, C = Hepi.config;
  const h = UI.h;
  const V = Hepi.V = Hepi.V || {};
  V.hooks = V.hooks || {};
  const BASE = ['Montant base HT TVA 5,5%', 'Montant base HT TVA 10%', 'Montant base HT TVA 20%'];
  const sumBase = r => BASE.reduce((a, hd) => a + U.num(r[hd]), 0);

  V.referentiel = function (box) {
    const A = Hepi.A;
    const sub = A.sub.ref;
    const seg = UI.segmented([
      { value: 'lots', label: 'Lots' }, { value: 'entreprises', label: 'Entreprises' }, { value: 'indices', label: 'Indices BT' }
    ], sub, v => { A.sub.ref = v; A.render(); });
    box.appendChild(h('div', { class: 'pad' }, seg,
      h('div', { class: 'toolbar' },
        h('span', { class: 'toolbar-text', text: sub === 'indices' ? 'Tous les marchés' : (S.ctx.op || 'Aucune opération') }),
        sub === 'lots' ? UI.btn('Lot', () => A.editor('marches', null, { initial: V.defaults('marches', lastRevision()) }), 'small', 'plus') : null,
        sub === 'entreprises' ? UI.btn('Entreprise', () => A.editor('entreprises', null, { initial: V.defaults('entreprises') }), 'small', 'plus') : null,
        UI.btn('Nouvelle opération', () => V.wizard(), 'primary small', 'plus'))));
    const list = h('div', { class: 'list' });
    box.appendChild(list);
    if (sub === 'lots') renderLots(list);
    else if (sub === 'entreprises') renderEntreprises(list);
    else renderIndices(list);
  };

  /* Paramètres de révision du dernier lot de l'opération, repris pour un nouveau lot. */
  function lastRevision() {
    const lots = S.records('marches').filter(r => U.same(r.Operation, S.ctx.op));
    const l = lots[lots.length - 1];
    if (!l) return { 'Type de révision': 'Révision simple', 'Indice 1 coefficient': 1 };
    const o = {};
    ['Type de révision', "Coefficient d'actualisation", 'MOIS DE REFERENCE', 'Indice 1 de révision BT', 'Indice 1 coefficient', 'Indice 2 de révision BT', 'Indice 2 coefficient'].forEach(k => { o[k] = l[k]; });
    return o;
  }

  function renderLots(list) {
    const env = K.env();
    const recs = S.records('marches').filter(r => U.same(r.Operation, S.ctx.op))
      .sort((a, b) => String(a.Denomination_Lot).localeCompare(String(b.Denomination_Lot), 'fr', { numeric: true }));
    if (!recs.length) { list.appendChild(UI.empty('Aucun lot pour cette opération.', 'Ajoutez les lots un par un, ou créez une nouvelle opération avec tous ses lots.')); return; }
    const grp = h('div', { class: 'grp' });
    let total = 0;
    recs.forEach(r => {
      const is = K.marche(r, env).filter(i => i.level !== 'info');
      total += sumBase(r);
      grp.appendChild(h('button', { type: 'button', class: 'item', on: { click: () => Hepi.A.editor('marches', r) } },
        h('span', { class: 'lv lv-' + (K.worst(is) || 'none') }),
        h('div', { class: 'item-main' }, h('div', { class: 'item-title' }, h('span', { text: r.Denomination_Lot })),
          h('div', { class: 'item-meta' }, h('span', { text: r['Type de révision'] || 'Révision ?' }), r['MOIS DE REFERENCE'] ? h('span', { text: 'Mo ' + U.monthShort(r['MOIS DE REFERENCE']) }) : null)),
        h('span', { class: 'item-amount num', text: U.fmtMoney(sumBase(r)) })));
    });
    list.appendChild(grp);
    list.appendChild(h('div', { class: 'list-foot' }, h('span', { text: recs.length + ' lots' }), h('span', { class: 'num', text: 'Marché HT ' + U.fmtEuro(U.round2(total)) })));
  }

  function renderEntreprises(list) {
    const env = K.env();
    const recs = S.records('entreprises').filter(r => U.same(r.Operation, S.ctx.op));
    if (!recs.length) { list.appendChild(UI.empty('Aucune entreprise pour cette opération.', 'Déclarez d’abord le mandataire de chaque lot, puis ses sous-traitants.')); return; }
    const mandLot = {};
    recs.filter(r => r.Type === 'Mandataire').forEach(r => { mandLot[U.norm(r.Entreprise)] = r.Denomination_Lot; });
    const groups = {};
    recs.forEach(r => {
      const mand = r.Type === 'Mandataire' ? r.Entreprise : r.Mandataire;
      const lot = r.Type === 'Mandataire' ? r.Denomination_Lot : (mandLot[U.norm(r.Mandataire)] || r.Denomination_Lot);
      const k = lot + '§' + mand;
      (groups[k] = groups[k] || { lot, mand, items: [] }).items.push(r);
    });
    Object.keys(groups).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })).forEach(k => {
      const g = groups[k];
      g.items.sort((a, b) => (a.Type === 'Mandataire' ? -1 : 0) - (b.Type === 'Mandataire' ? -1 : 0) || String(a.Entreprise).localeCompare(String(b.Entreprise), 'fr'));
      const grp = h('div', { class: 'grp' }, h('div', { class: 'grp-head' }, h('div', { class: 'grp-titles' }, h('span', { class: 'grp-lot', text: g.lot || 'Lot ?' }), h('span', { class: 'grp-mand', text: g.mand || '' }))));
      g.items.forEach(r => {
        const is = K.entreprise(r, env).filter(i => i.level !== 'info');
        const st = r.Type === 'Sous-traitant';
        grp.appendChild(h('button', { type: 'button', class: 'item' + (st ? ' item-st' : ''), on: { click: () => Hepi.A.editor('entreprises', r) } },
          h('span', { class: 'lv lv-' + (K.worst(is) || 'none') }),
          h('div', { class: 'item-main' }, h('div', { class: 'item-title' }, h('span', { text: r.Entreprise })),
            h('div', { class: 'item-meta' }, h('span', { text: r.Type || 'Rôle ?' }),
              st && r['Nature des prestations ST'] ? h('span', { text: r['Nature des prestations ST'] }) : null,
              st && String(r['Autoliquidation (OUI/NON)']).toUpperCase() === 'OUI' ? h('span', { class: 'flag', text: 'Autoliquidé' }) : null,
              !U.isBlank(r.Avance) ? h('span', { class: 'flag', text: 'Avance ' + U.monthShort(r.Avance) }) : null)),
          h('span', { class: 'item-amount num', text: U.fmtMoney(sumBase(r)) })));
      });
      list.appendChild(grp);
    });
  }

  /* ---------- Indices BT : grille éditable ---------- */
  function neededIndices() {
    const env = K.env();
    const need = {};
    const add = (m, ix) => { if (!m || U.isBlank(ix) || U.isErr(ix)) return; const k = m + '|' + ix; need[k] = (need[k] || 0) + 1; };
    env.pai.concat(env.ava).forEach(r => {
      const type = String(r['Type de révision'] || '');
      if (!/simple|mixte/i.test(type)) return;
      const isPai = r._key === 'paiements';
      const m = K.moisOf(r);
      add(isPai ? U.addMonths(m, -3) : m, r['Index BT de référence - 1']);
      add(r['Mois de référence'], r['Index BT de référence - 1']);
      if (/mixte/i.test(type)) { add(m, r['Index BT de référence - 2']); add(r['Mois de référence'], r['Index BT de référence - 2']); }
    });
    return need;
  }

  function renderIndices(list) {
    const A = Hepi.A;
    if (!S.has('indices')) { list.appendChild(UI.empty('Table IndicesBT introuvable.', null)); return; }
    const names = S.indexNames();
    const recs = S.records('indices').filter(r => /^\d{4}_\d{2}/.test(String(r.Mois)));
    const need = neededIndices();
    const cur = U.currentMonth();
    const lo = U.addMonths(cur, -18), hi = U.addMonths(cur, 1);
    A.indicesAll = !!A.indicesAll;
    const shown = recs.filter(r => A.indicesAll || (String(r.Mois) >= lo && String(r.Mois) <= hi) || names.some(ix => need[r.Mois + '|' + ix] && U.isBlank(r[ix])));
    const last = names.map(ix => {
      const f = recs.filter(r => !U.isBlank(r[ix])).pop();
      return f ? `${ix} : ${U.monthShort(f.Mois)}` : `${ix} : aucun`;
    });
    const edits = new Map();
    const saveBtn = UI.btn('Enregistrer', async () => {
      const items = Array.from(edits.entries()).map(([rec, ch]) => ({ rec, changes: ch })).filter(it => Object.keys(it.changes).length);
      if (!items.length) return;
      await A.ensureUser();
      const res = await A.run(() => S.saveBatch('indices', items), 'Enregistrement des indices…');
      if (res) { UI.toast(`${res.ok} mois mis à jour` + (res.failed ? `, ${res.failed} en conflit (rechargez)` : '') + '.', { kind: res.failed ? 'warn' : 'ok' }); A.render(); }
    }, 'primary small');
    saveBtn.disabled = true;
    const counter = h('span', { class: 'toolbar-text' });
    const refresh = () => {
      const n = Array.from(edits.values()).reduce((a, ch) => a + Object.keys(ch).length, 0);
      saveBtn.disabled = n === 0;
      counter.textContent = n ? `${n} valeur${n > 1 ? 's' : ''} modifiée${n > 1 ? 's' : ''}` : '';
    };
    list.appendChild(h('div', { class: 'pad pad-tight' },
      h('p', { class: 'sec-note', text: 'Dernier indice saisi — ' + last.join(' ; ') + '. Les cases orangées sont utilisées par des situations mais restent vides.' })));
    const grid = h('div', { class: 'igrid', style: `grid-template-columns: minmax(96px,1.2fr) repeat(${names.length}, minmax(64px,1fr))` },
      h('div', { class: 'ig-h', text: 'Mois' }), names.map(n => h('div', { class: 'ig-h num', text: n })));
    shown.slice().reverse().forEach(r => {
      grid.appendChild(h('div', { class: 'ig-m' + (String(r.Mois) === cur ? ' ig-cur' : ''), text: U.monthShort(r.Mois) }));
      names.forEach(ix => {
        const used = need[r.Mois + '|' + ix];
        const inp = h('input', { class: 'inp num ig-in' + (used && U.isBlank(r[ix]) ? ' ig-need' : ''), type: 'text', inputmode: 'decimal', value: U.isBlank(r[ix]) ? '' : U.fmtCoef(r[ix]), 'aria-label': `${ix} ${U.monthShort(r.Mois)}`, title: used ? `Utilisé par ${used} ligne(s)` : '' });
        inp.addEventListener('change', () => {
          const p = U.parseNumber(inp.value);
          inp.classList.toggle('ig-err', !p.ok);
          if (!p.ok) return;
          const ch = edits.get(r) || {};
          if (U.same(p.value, r[ix])) delete ch[ix]; else ch[ix] = p.value;
          edits.set(r, ch);
          inp.classList.toggle('ig-changed', ix in ch);
          if (p.ok && p.value !== '') inp.value = U.fmtCoef(p.value);
          refresh();
        });
        grid.appendChild(inp);
      });
    });
    list.appendChild(grid);
    const lastMonth = recs.length ? String(recs[recs.length - 1].Mois) : '';
    list.appendChild(h('div', { class: 'pad toolbar' },
      h('button', { type: 'button', class: 'linkish', on: { click: () => { A.indicesAll = !A.indicesAll; A.render(); } } }, A.indicesAll ? 'Afficher les mois récents' : 'Afficher tous les mois'),
      lastMonth && lastMonth < hi ? UI.btn('Ajouter ' + U.monthShort(U.addMonths(lastMonth, 1)), async () => {
        await A.ensureUser();
        const r = await A.run(() => S.create('indices', { Mois: U.addMonths(lastMonth, 1) }));
        if (r) A.render();
      }, 'small ghost', 'plus') : null,
      counter, saveBtn));
  }

  /* ---------- Lots ---------- */
  V.hooks.marches = {
    title: rec => rec ? rec.Denomination_Lot : 'Nouveau lot',
    cartouche: rec => UI.cartouche([
      { label: 'Opération', value: rec.Operation },
      { label: 'Révision', value: rec['Type de révision'] },
      { label: 'Lot', value: rec.Denomination_Lot, wide: true, strong: true },
      { label: 'Marché HT', value: U.fmtEuro(U.round2(sumBase(rec))) },
      { label: 'Mois de référence', value: U.monthShort(rec['MOIS DE REFERENCE']) }
    ]),
    check: v => K.marche(v),
    beforeSave: (form, rec) => renameStep('lot', form, rec, 'Denomination_Lot', rec ? rec.Operation : ''),
    usage: rec => usageCount('lot', rec.Operation, rec.Denomination_Lot)
  };

  /* ---------- Entreprises ---------- */
  V.hooks.entreprises = {
    title: rec => rec ? rec.Entreprise : 'Nouvelle entreprise',
    cartouche: rec => UI.cartouche([
      { label: 'Opération', value: rec.Operation },
      { label: 'Rôle', value: rec.Type },
      { label: 'Entreprise', value: rec.Entreprise, wide: true, strong: true },
      { label: 'Lot', value: rec.Denomination_Lot, wide: true },
      rec.Type === 'Sous-traitant' ? { label: 'Mandataire', value: rec.Mandataire, wide: true } : null,
      { label: 'Marché HT', value: U.fmtEuro(U.round2(sumBase(rec))) },
      { label: 'Part propre HT', value: typeof rec['Total base HT part propre'] === 'number' ? U.fmtEuro(U.round2(rec['Total base HT part propre'])) : '—' }
    ]),
    check: v => K.entreprise(v),
    onChange: function (form, hd) {
      if (hd !== 'Type') return;
      if (form.values.Type === 'Mandataire') {
        ['Mandataire', 'Autoliquidation (OUI/NON)'].forEach(k => { if (form.ctl[k] && !U.isBlank(form.values[k])) { form.values[k] = ''; form.ctl[k].show(''); } });
      } else if (form.values.Type === 'Sous-traitant' && form.ctl['Autoliquidation (OUI/NON)'] && U.isBlank(form.values['Autoliquidation (OUI/NON)'])) {
        form.values['Autoliquidation (OUI/NON)'] = 'OUI'; form.ctl['Autoliquidation (OUI/NON)'].show('OUI');
      }
      form.refresh();
    },
    beforeSave: (form, rec) => renameStep('entreprise', form, rec, 'Entreprise', rec ? rec.Operation : ''),
    usage: rec => usageCount('entreprise', rec.Operation, rec.Entreprise, 1)
  };

  function usageCount(kind, op, val, self) {
    const plan = S.renamePlan(kind, op, val);
    return plan.map(p => ({ label: C.tables[p.key].label, count: p.count - (p.key === (kind === 'lot' ? 'marches' : 'entreprises') ? (self || 1) : 0) })).filter(p => p.count > 0);
  }

  /* Changement de libellé : proposer de le reporter dans les autres tables. */
  async function renameStep(kind, form, rec, field, op) {
    if (!rec) return {};
    const from = rec[field], to = form.values[field];
    if (U.same(from, to) || U.isBlank(from)) return {};
    const uses = usageCount(kind, op, from);
    if (!uses.length) return {};
    const body = h('div', {},
      h('p', { text: `« ${from} » devient « ${to} ». Ce libellé est aussi utilisé ici :` }),
      h('ul', { class: 'plain' }, uses.map(u => h('li', { text: `${u.label} : ${u.count} cellule${u.count > 1 ? 's' : ''}` }))),
      h('p', { class: 'help', text: 'Sans report, ces lignes ne seraient plus rattachées dans le tableau de bord.' }));
    const choice = await UI.modal({
      title: kind === 'lot' ? 'Renommer le lot partout ?' : 'Renommer l’entreprise partout ?', body, dismissValue: null,
      actions: [{ label: 'Annuler', value: null, kind: 'ghost' }, { label: 'Ici seulement', value: 'one' }, { label: 'Renommer partout', value: 'all', kind: 'primary' }]
    });
    if (!choice) return false;
    return choice === 'all' ? { after: () => S.rename(kind, op, from, to) } : {};
  }

  /* ---------- Assistant « Nouvelle opération » ---------- */
  V.wizard = function () {
    const A = Hepi.A;
    const st = {
      name: '', pipeline: true,
      rev: { type: 'Révision simple', mois: '', ix1: S.indexNames()[0] || 'BT01', c1: 1, ix2: '', c2: '', act: '' },
      lots: [{ name: 'LOT 01 - ', m: ['', '', ''], tit: '' }],
      touched: false
    };
    const allEnts = U.sortFr(U.uniq(S.records('entreprises').map(r => r.Entreprise)));
    A.push({
      dirty: () => st.touched && !st.done,
      render(box) {
        UI.clear(box);
        box.appendChild(h('div', { class: 'detail-top' }, UI.iconBtn('back', 'Retour', () => A.pop()), h('div', { class: 'detail-title' }, h('span', { text: 'Nouvelle opération' }))));
        const errBox = h('div', { class: 'alerts' });
        const touch = () => { st.touched = true; };

        // 1. Opération
        const nameIn = h('input', { class: 'inp', type: 'text', value: st.name, placeholder: 'VILLE-PROJET', 'aria-label': 'Nom de l’opération' });
        nameIn.addEventListener('input', () => { st.name = nameIn.value; touch(); });
        nameIn.addEventListener('blur', () => { st.name = nameIn.value.trim().toUpperCase().replace(/\s+/g, '-'); nameIn.value = st.name; });
        const pipe = h('input', { type: 'checkbox', class: 'chk', checked: st.pipeline, on: { change: e => { st.pipeline = e.target.checked; } } });
        box.appendChild(h('section', { class: 'sec' },
          h('h3', { class: 'sec-title', text: '1. Opération' }),
          h('div', { class: 'fld' }, h('label', { class: 'fld-label', text: 'Nom de l’opération' }), nameIn,
            h('div', { class: 'help', text: 'Écrit comme au début des noms de fichiers des situations, par exemple VILLE-PROJET.' })),
          h('label', { class: 'switch' }, pipe, h('span', { class: 'switch-ui' }), h('span', { class: 'switch-label', text: 'Ajouter à la liste des opérations reconnues par l’extraction' }))));

        // 2. Révision
        const r = st.rev;
        const sel = (opts, val, on) => { const s = h('select', { class: 'inp' }, opts.map(o => h('option', { value: o, text: o || '—' }))); s.value = val || ''; s.addEventListener('change', () => { on(s.value); touch(); }); return s; };
        const num = (val, on) => { const i = h('input', { class: 'inp num', type: 'text', inputmode: 'decimal', value: U.isBlank(val) ? '' : U.fmtCoef(val) }); i.addEventListener('change', () => { const p = U.parseNumber(i.value); i.classList.toggle('bad', !p.ok); if (p.ok) on(p.value); touch(); }); return i; };
        const revBox = h('div');
        const drawRev = () => {
          UI.clear(revBox);
          const simpleOrMixte = /simple|mixte/i.test(r.type);
          revBox.appendChild(h('div', { class: 'fld' }, h('label', { class: 'fld-label', text: 'Type de révision' }), sel(C.lists.typeRevision, r.type, v => { r.type = v; drawRev(); })));
          if (/actualisation/i.test(r.type)) revBox.appendChild(h('div', { class: 'fld fld-num' }, h('label', { class: 'fld-label', text: 'Coefficient d’actualisation' }), num(r.act, v => { r.act = v; })));
          if (simpleOrMixte) {
            revBox.appendChild(h('div', { class: 'fld' }, h('label', { class: 'fld-label', text: 'Mois de référence (Mo)' }), sel([''].concat(S.monthList()), r.mois, v => { r.mois = v; })));
            revBox.appendChild(h('div', { class: 'row' },
              h('div', { class: 'fld' }, h('label', { class: 'fld-label', text: 'Indice 1' }), sel([''].concat(S.indexNames()), r.ix1, v => { r.ix1 = v; })),
              h('div', { class: 'fld fld-num' }, h('label', { class: 'fld-label', text: 'Pondération 1' }), num(r.c1, v => { r.c1 = v; }))));
          }
          if (/mixte/i.test(r.type)) {
            revBox.appendChild(h('div', { class: 'row' },
              h('div', { class: 'fld' }, h('label', { class: 'fld-label', text: 'Indice 2' }), sel([''].concat(S.indexNames()), r.ix2, v => { r.ix2 = v; })),
              h('div', { class: 'fld fld-num' }, h('label', { class: 'fld-label', text: 'Pondération 2' }), num(r.c2, v => { r.c2 = v; }))));
          }
        };
        drawRev();
        box.appendChild(h('section', { class: 'sec' }, h('h3', { class: 'sec-title', text: '2. Révision des prix' }),
          h('p', { class: 'sec-note', text: 'Appliquée à tous les lots ; vous pourrez l’ajuster lot par lot ensuite.' }), revBox));

        // 3. Lots
        const lotsBox = h('div', { class: 'wz-lots' });
        const dl = h('datalist', { id: 'wz-ents' }, allEnts.map(e => h('option', { value: e })));
        const drawLots = () => {
          UI.clear(lotsBox);
          st.lots.forEach((l, n) => {
            const nm = h('input', { class: 'inp', type: 'text', value: l.name, 'aria-label': 'Dénomination du lot' });
            nm.addEventListener('input', () => { l.name = nm.value; touch(); });
            const ms = l.m.map((v, k) => {
              const i = h('input', { class: 'inp num', type: 'text', inputmode: 'decimal', value: typeof v === 'number' ? U.fmtMoney(v) : v, 'aria-label': 'Base HT ' + Hepi.TVA[k].label, placeholder: Hepi.TVA[k].label });
              i.addEventListener('change', () => { const p = U.parseNumber(i.value); i.classList.toggle('bad', !p.ok); l.m[k] = p.ok ? p.value : i.value; if (p.ok && p.value !== '') i.value = U.fmtMoney(p.value); touch(); });
              return i;
            });
            const tit = h('input', { class: 'inp', type: 'text', value: l.tit, list: 'wz-ents', placeholder: 'Titulaire (mandataire)', 'aria-label': 'Titulaire du lot' });
            tit.addEventListener('input', () => { l.tit = tit.value; touch(); });
            lotsBox.appendChild(h('div', { class: 'wz-lot' },
              h('div', { class: 'wz-lot-head' }, nm, UI.iconBtn('trash', 'Retirer ce lot', () => { st.lots.splice(n, 1); drawLots(); })),
              h('div', { class: 'wz-amounts' }, ms), tit));
          });
        };
        drawLots();
        const paste = h('textarea', { class: 'inp', rows: 4, placeholder: 'Lot ⇥ Base 5,5 % ⇥ Base 10 % ⇥ Base 20 % ⇥ Titulaire' });
        const importPaste = () => {
          const rows = paste.value.split(/\r?\n/).map(l => l.split('\t')).filter(c => c.length && c[0].trim());
          const parsed = [];
          rows.forEach(c => {
            const am = [1, 2, 3].map(k => U.parseNumber(c[k] || ''));
            if (am.some(p => !p.ok)) return; // ligne d'en-têtes ou non numérique
            parsed.push({ name: c[0].trim(), m: am.map(p => p.value), tit: (c[4] || '').trim() });
          });
          if (!parsed.length) { UI.toast('Aucune ligne reconnue. Collez des colonnes séparées par des tabulations (copie depuis Excel).', { kind: 'warn' }); return; }
          st.lots = st.lots.filter(l => l.name.trim() && l.name.trim() !== 'LOT 01 -').concat(parsed);
          paste.value = ''; touch(); drawLots();
          UI.toast(parsed.length + ' lot(s) importé(s).');
        };
        box.appendChild(h('section', { class: 'sec' }, h('h3', { class: 'sec-title', text: '3. Lots et titulaires' }),
          h('p', { class: 'sec-note', text: 'Le titulaire est enregistré comme mandataire du lot, avec le montant du lot comme base. Les sous-traitants s’ajoutent ensuite dans Entreprises.' }),
          dl, lotsBox,
          h('div', { class: 'toolbar' }, UI.btn('Ajouter un lot', () => {
            const next = 'LOT ' + String(st.lots.length + 1).padStart(2, '0') + ' - ';
            st.lots.push({ name: next, m: ['', '', ''], tit: '' }); drawLots();
          }, 'small ghost', 'plus')),
          h('details', { class: 'paste' }, h('summary', { text: 'Coller une liste de lots depuis Excel' }), paste,
            h('div', { class: 'toolbar' }, UI.btn('Importer les lignes collées', importPaste, 'small')))));

        // 4. Création
        const create = async () => {
          st.name = (nameIn.value || '').trim().toUpperCase().replace(/\s+/g, '-');
          const errs = [];
          if (!st.name) errs.push('Indiquez le nom de l’opération.');
          else if (!/^[A-Z0-9][A-Z0-9_.\-]*$/.test(st.name)) errs.push('Le nom ne doit contenir que des lettres sans accent, des chiffres et des tirets.');
          if (S.operations().some(o => U.same(o, st.name))) errs.push('Cette opération existe déjà.');
          const lots = st.lots.filter(l => l.name.trim() && !/^LOT \d+ -\s*$/.test(l.name.trim()));
          if (!lots.length) errs.push('Ajoutez au moins un lot.');
          const names = lots.map(l => U.norm(l.name));
          if (new Set(names).size !== names.length) errs.push('Deux lots portent le même nom.');
          if (lots.some(l => l.m.some(v => typeof v === 'string' && v.trim() !== ''))) errs.push('Un montant n’est pas un nombre valide.');
          if (/simple|mixte/i.test(r.type) && (!r.mois || !r.ix1)) errs.push('Indiquez le mois de référence et l’indice de révision.');
          UI.renderIssues(errBox, errs.map(m => ({ level: 'error', msg: m })));
          if (errs.length) { errBox.scrollIntoView({ block: 'nearest' }); return; }
          await A.ensureUser();
          const rev = {
            'Type de révision': r.type,
            "Coefficient d'actualisation": /actualisation/i.test(r.type) ? r.act : '',
            'MOIS DE REFERENCE': /simple|mixte/i.test(r.type) ? r.mois : '',
            'Indice 1 de révision BT': /simple|mixte/i.test(r.type) ? r.ix1 : '',
            'Indice 1 coefficient': /simple|mixte/i.test(r.type) ? r.c1 : '',
            'Indice 2 de révision BT': /mixte/i.test(r.type) ? r.ix2 : '',
            'Indice 2 coefficient': /mixte/i.test(r.type) ? r.c2 : ''
          };
          const amounts = l => ({ [BASE[0]]: l.m[0] === '' ? 0 : l.m[0], [BASE[1]]: l.m[1] === '' ? 0 : l.m[1], [BASE[2]]: l.m[2] === '' ? 0 : l.m[2] });
          const marches = lots.map(l => Object.assign({ Operation: st.name, Denomination_Lot: l.name.trim() }, amounts(l), rev));
          const ents = lots.filter(l => l.tit.trim()).map(l => Object.assign({ Operation: st.name, Entreprise: l.tit.trim(), Denomination_Lot: l.name.trim(), Type: 'Mandataire' }, amounts(l)));
          const ok = await A.run(async () => {
            await S.createMany('marches', marches);
            if (ents.length) await S.createMany('entreprises', ents);
            if (st.pipeline && S.has('operations') && !S.records('operations').some(x => U.same(x['Nom des opérations autorisées'], st.name)))
              await S.createMany('operations', [{ 'Nom des opérations autorisées': st.name }]);
            await S.load();
            return true;
          }, 'Création de l’opération…');
          if (!ok) return;
          st.done = true;
          S.ctx.op = st.name; S.ctx.mois = '*'; S.ctx.follow = false;
          A.sub.ref = 'lots';
          A.stack = [];
          A.tab = 'ref';
          A.render();
          UI.toast(`Opération ${st.name} créée : ${marches.length} lot(s), ${ents.length} mandataire(s).`);
        };
        box.appendChild(h('section', { class: 'sec' }, h('h3', { class: 'sec-title', text: '4. Création' }), errBox,
          h('div', { class: 'toolbar' }, UI.btn('Créer l’opération', create, 'primary'))));
      }
    });
  };
})();
