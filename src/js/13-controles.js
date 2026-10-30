/* Onglet Contrôles : anomalies de l'opération et validation du net à payer mensuel. */
(function () {
  const U = Hepi.U, S = Hepi.S, X = Hepi.X, UI = Hepi.UI, K = Hepi.K, C = Hepi.config;
  const h = UI.h;
  const V = Hepi.V = Hepi.V || {};

  V.controles = function (box) {
    const A = Hepi.A;
    const sub = A.sub.ctrl;
    box.appendChild(h('div', { class: 'pad' }, UI.segmented([
      { value: 'anomalies', label: 'Anomalies' }, { value: 'validation', label: 'Validation du mois' }
    ], sub, v => { A.sub.ctrl = v; A.render(); })));
    const body = h('div', { class: 'list' });
    box.appendChild(body);
    if (sub === 'validation') renderValidation(body); else renderAnomalies(body);
  };

  const titleOf = (key, r) => key === 'paiements' ? `${r.entreprise || '?'} — ${r.lot || '?'}`
    : key === 'avancement' ? (r.Lot || '?') : key === 'marches' ? (r.Denomination_Lot || '?') : (r.Entreprise || '?');

  function renderAnomalies(body) {
    const A = Hepi.A;
    A.ctrlScope = A.ctrlScope || 'mois';
    const allMonths = S.ctx.mois === '*' || !S.ctx.mois;
    body.appendChild(h('div', { class: 'pad pad-tight toolbar' },
      allMonths ? h('span', { class: 'toolbar-text', text: 'Toute l’opération' }) :
        UI.segmented([{ value: 'mois', label: U.monthShort(S.ctx.mois) }, { value: 'op', label: 'Toute l’opération' }], A.ctrlScope, v => { A.ctrlScope = v; A.render(); })));
    const mois = allMonths || A.ctrlScope === 'op' ? '*' : S.ctx.mois;

    // Écarts de net à payer calculés par le tableau de bord
    const d = S.dash;
    if (d && d.exists && U.same(d.op, S.ctx.op) && mois !== '*' && U.same(d.mois, mois)) {
      const gaps = d.pairs.filter(p => Math.abs(U.num(p.netDeclare) - U.num(p.netCalcule)) > 1);
      const sec = h('div', { class: 'grp' }, h('div', { class: 'grp-head' }, h('div', { class: 'grp-titles' },
        h('span', { class: 'grp-lot', text: 'Net à payer — tableau de bord' }),
        h('span', { class: 'grp-mand', text: gaps.length ? `${gaps.length} écart${gaps.length > 1 ? 's' : ''} entre net calculé et net déclaré` : 'Tous les nets concordent' }))));
      gaps.forEach(p => {
        const rec = S.records('paiements').find(r => r.type_entreprise === 'Mandataire' && U.same(r['Opération'], d.op) && U.same(r.Mois, d.mois) && U.same(r.entreprise, p.entreprise) && U.same(r.lot, p.lot));
        sec.appendChild(h('button', { type: 'button', class: 'item', disabled: !rec, on: { click: () => rec && A.editor('paiements', rec) } },
          h('span', { class: 'lv lv-warn' }),
          h('div', { class: 'item-main' }, h('div', { class: 'item-title' }, h('span', { text: p.entreprise })), h('div', { class: 'item-meta' }, h('span', { text: p.lot }))),
          h('span', { class: 'item-amount num', text: U.fmtMoney(U.round2(U.num(p.netDeclare) - U.num(p.netCalcule))) })));
      });
      body.appendChild(sec);
    }

    const res = K.scan(S.ctx.op, mois);
    const buckets = { error: [], warn: [], info: [] };
    res.forEach(x => { const w = K.worst(x.issues); if (w) buckets[w].push(x); });
    if (!res.length) { body.appendChild(UI.empty('Aucune anomalie détectée.', 'Les contrôles portent sur les montants, les rattachements au référentiel, les doublons et les indices BT.')); return; }
    const titles = { error: 'À corriger', warn: 'À vérifier', info: 'Pour information' };
    ['error', 'warn', 'info'].forEach(lv => {
      const items = buckets[lv];
      if (!items.length) return;
      const wrap = lv === 'info' ? h('details', { class: 'grp' }) : h('div', { class: 'grp' });
      const head = h(lv === 'info' ? 'summary' : 'div', { class: 'grp-head' }, h('div', { class: 'grp-titles' },
        h('span', { class: 'grp-lot lv-text-' + lv, text: titles[lv] }), h('span', { class: 'grp-mand', text: items.length + ' ligne' + (items.length > 1 ? 's' : '') })));
      wrap.appendChild(head);
      items.forEach(x => {
        const r = x.rec;
        wrap.appendChild(h('button', { type: 'button', class: 'item item-issue', on: { click: () => A.editor(x.key, r) } },
          h('span', { class: 'lv lv-' + lv }),
          h('div', { class: 'item-main' },
            h('div', { class: 'item-title' }, h('span', { text: titleOf(x.key, r) })),
            h('div', { class: 'item-meta' }, h('span', { text: C.tables[x.key].label }), r.Mois ? h('span', { text: U.monthShort(r.Mois) }) : null, r['N°_Situation'] !== undefined ? h('span', { text: 'Sit. ' + U.display(r['N°_Situation'], 'int') }) : null),
            h('ul', { class: 'issue-list' }, x.issues.map(i => h('li', { class: 'lv-text-' + i.level, text: i.msg }))))));
      });
      body.appendChild(wrap);
    });
  }

  /* ---------- Validation du net à payer ---------- */
  function dashboardWired() {
    return !!(S.dash && S.dash.months.length && S.dash.months.every(m => /BDD_Validations/i.test(String(m.valideFormula || ''))));
  }

  function renderValidation(body) {
    const A = Hepi.A;
    const op = S.ctx.op;
    if (!S.has('validations') || !dashboardWired()) {
      body.appendChild(h('div', { class: 'pad' },
        h('div', { class: 'callout' },
          h('p', { class: 'callout-title', text: 'Les colonnes « Net validé » et « Commentaire » du tableau de bord sont saisies à la main.' }),
          h('p', { text: 'Elles sont posées à côté d’une liste de mois qui change avec l’opération affichée : en changeant d’opération, les validations restent sur les mêmes lignes et se retrouvent en face d’autres mois.' }),
          h('p', { text: 'Le panneau peut les enregistrer dans une table dédiée (feuille « BDD Validations ») et remplacer ces deux colonnes par des formules qui la lisent. Les valeurs déjà saisies sont reprises pour l’opération affichée.' }),
          UI.btn('Créer la table et relier le tableau de bord', setup, 'primary small'))));
      if (!S.has('validations')) return;
    }
    const recs = S.records('validations').filter(r => U.same(r['Opération'], op));
    const months = U.uniq(S.monthsForOp(op).concat(recs.map(r => String(r.Mois)))).sort();
    if (!months.length) { body.appendChild(UI.empty('Aucun mois à valider pour cette opération.', null)); return; }
    const grp = h('div', { class: 'grp' });
    months.forEach(m => {
      const v = recs.find(r => String(r.Mois) === m);
      const decl = K.netDeclareMois(op, m);
      const val = v ? v['Net_TTC_Validé'] : '';
      const has = typeof val === 'number';
      const ecart = has ? U.round2(val - decl) : null;
      grp.appendChild(h('button', { type: 'button', class: 'item', on: { click: () => editValidation(op, m, v, decl) } },
        h('span', { class: 'lv lv-' + (has ? (Math.abs(ecart) <= 1 ? 'ok' : 'warn') : 'none') }),
        h('div', { class: 'item-main' },
          h('div', { class: 'item-title' }, h('span', { text: U.monthShort(m) }), has ? h('span', { class: 'chip chip-ok', text: 'Validé' }) : null),
          h('div', { class: 'item-meta' }, h('span', { text: 'Déclaré ' + U.fmtMoney(decl) }), has && Math.abs(ecart) > 1 ? h('span', { class: 'lv-text-warn', text: 'Écart ' + U.fmtMoney(ecart) }) : null,
            v && v.Commentaire ? h('span', { class: 'meta-comment', text: String(v.Commentaire) }) : null)),
        h('span', { class: 'item-amount num', text: has ? U.fmtMoney(val) : '—' })));
    });
    body.appendChild(grp);
  }

  async function editValidation(op, mois, rec, decl) {
    const A = Hepi.A;
    const amount = h('input', { class: 'inp num', type: 'text', inputmode: 'decimal', value: rec && typeof rec['Net_TTC_Validé'] === 'number' ? U.fmtMoney(rec['Net_TTC_Validé']) : '' });
    const comment = h('textarea', { class: 'inp', rows: 3 }, rec && rec.Commentaire ? String(rec.Commentaire) : '');
    const body = h('div', {},
      h('div', { class: 'netbox-grid' }, h('span', { text: 'Net déclaré (somme des situations)' }), h('span', { class: 'num', text: U.fmtEuro(decl) })),
      h('div', { class: 'fld fld-num' }, h('label', { class: 'fld-label', text: 'Net à payer TTC validé' }), amount,
        h('button', { type: 'button', class: 'linkish', on: { click: () => { amount.value = U.fmtMoney(decl); } } }, 'Reprendre le net déclaré')),
      h('div', { class: 'fld' }, h('label', { class: 'fld-label', text: 'Commentaire' }), comment));
    const go = await UI.modal({
      title: 'Validation — ' + U.monthShort(mois), body, dismissValue: false,
      actions: [{ label: 'Annuler', value: false, kind: 'ghost' }, { label: 'Enregistrer', value: true, kind: 'primary' }]
    });
    if (!go) return;
    const p = U.parseNumber(amount.value);
    if (!p.ok) { UI.toast('Montant invalide : ' + p.error, { kind: 'err' }); return; }
    await A.ensureUser();
    const vals = { 'Net_TTC_Validé': p.value, 'Commentaire': comment.value.trim(), 'Validé_par': S.getUser(), 'Date_validation': U.todaySerial() };
    const ok = await A.run(async () => {
      if (rec) {
        const ch = {};
        for (const k in vals) if (!U.same(vals[k], rec[k])) ch[k] = vals[k];
        if (Object.keys(ch).length) await S.save('validations', rec, ch);
      } else {
        await S.create('validations', Object.assign({ 'Opération': op, 'Mois': mois }, vals));
      }
      return true;
    });
    if (ok) { UI.toast('Validation enregistrée.'); A.render(); }
  }

  async function setup() {
    const A = Hepi.A;
    const d = S.dash;
    if (!d || !d.exists) { UI.toast('Feuille « Tableau de bord » introuvable.', { kind: 'err' }); return; }
    if (d.col.netValide < 0 || d.col.commentaire < 0 || d.col.mois < 0) { UI.toast('Colonnes MOIS / NET A PAYER TTC VALIDÉ / COMMENTAIRE introuvables en ligne 8.', { kind: 'err' }); return; }
    const isF = f => typeof f === 'string' && f.startsWith('=');
    const legacy = d.months.filter(m => (!isF(m.valideFormula) && !U.isBlank(m.netValide)) || (!isF(m.commentaireFormula) && !U.isBlank(m.commentaire)));
    const body = h('div', {},
      h('p', { text: `Une feuille « BDD Validations » sera créée. Les colonnes ${X.colLetter(d.col.netValide)} et ${X.colLetter(d.col.commentaire)} du tableau de bord (lignes ${C.dashboard.firstRow} à ${C.dashboard.firstRow + C.dashboard.monthRows - 1}) seront remplacées par des formules.` }),
      legacy.length ? h('div', {}, h('p', { text: `Valeurs saisies à la main reprises pour ${d.op} :` }),
        h('ul', { class: 'plain' }, legacy.map(m => h('li', { text: `${U.monthShort(m.mois)} : ${[U.isBlank(m.netValide) ? '' : U.fmtEuro(U.num(m.netValide)), m.commentaire || ''].filter(Boolean).join(' — ')}` })))) :
        h('p', { text: 'Aucune valeur saisie à la main n’a été trouvée.' }),
      h('p', { class: 'help', text: 'Vérifiez que ces valeurs concernent bien l’opération affichée avant de continuer.' }));
    const go = await UI.confirm('Relier le tableau de bord', body, { confirm: 'Créer et relier' });
    if (!go) return;
    await A.ensureUser();
    const ok = await A.run(async () => {
      await X.ensureTable(C.tables.validations);
      await S.load();
      if (legacy.length) {
        await S.createMany('validations', legacy.map(m => ({
          'Opération': d.op, 'Mois': m.mois,
          'Net_TTC_Validé': typeof m.netValide === 'number' ? m.netValide : '',
          'Commentaire': U.isBlank(m.commentaire) ? '' : String(m.commentaire),
          'Validé_par': S.getUser(), 'Date_validation': U.todaySerial()
        })));
      }
      const B = X.colLetter(d.col.mois), cv = X.colLetter(d.col.netValide), cc = X.colLetter(d.col.commentaire);
      const r0 = C.dashboard.firstRow, r1 = r0 + C.dashboard.monthRows - 1;
      const f = (r, field) => `=IF($${B}${r}="","",LET(v,XLOOKUP(1,(BDD_Validations[Opération]=Nom_operation)*(BDD_Validations[Mois]=$${B}${r}),BDD_Validations[${field}],""),IF(v="","",v)))`;
      const colV = [], colC = [];
      for (let r = r0; r <= r1; r++) { colV.push([f(r, 'Net_TTC_Validé')]); colC.push([f(r, 'Commentaire')]); }
      await X.writeFormulas(C.dashboard.sheet, `${cv}${r0}:${cv}${r1}`, colV);
      await X.writeFormulas(C.dashboard.sheet, `${cc}${r0}:${cc}${r1}`, colC);
      await S.journal([{ action: 'Paramétrage', table: 'Tableau de bord', key: d.op, field: `${cv}${r0}:${cc}${r1}`, before: `${legacy.length} valeur(s) saisie(s) à la main`, after: 'Formules reliées à BDD_Validations' }]);
      await S.load();
      return true;
    }, 'Paramétrage…');
    if (ok) { UI.toast('Tableau de bord relié à la table des validations.'); A.render(); }
  }
})();
