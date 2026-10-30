/* Onglet Saisie : paiements (BDD_Paiements) et avancement (BDD_Avancement). */
(function () {
  const U = Hepi.U, S = Hepi.S, UI = Hepi.UI, K = Hepi.K, C = Hepi.config;
  const h = UI.h;
  const V = Hepi.V = Hepi.V || {};
  V.hooks = V.hooks || {};
  const RATES = Hepi.TVA;

  function scope(r) {
    const A = Hepi.A;
    return U.same(r['Opération'], S.ctx.op) && (S.ctx.mois === '*' || !S.ctx.mois || String(r.Mois) === S.ctx.mois) && matches(r, A.q);
  }
  function matches(r, q) {
    if (!q) return true;
    const hay = U.norm([r.entreprise, r.mandataire, r.lot, r.Lot, r['N°_Situation'], r['N°_Facture'], r.Source_PDF, r.Statut].join(' '));
    return U.norm(q).split(/\s+/).every(w => hay.includes(w));
  }

  /* ---------- Vue liste ---------- */
  V.saisie = function (box) {
    const A = Hepi.A;
    const sub = A.sub.saisie;
    const seg = UI.segmented([{ value: 'paiements', label: 'Paiements' }, { value: 'avancement', label: 'Avancement' }], sub, v => { A.sub.saisie = v; A.render(); });
    const search = h('input', { class: 'inp search', type: 'search', placeholder: 'Entreprise, lot, n°…', value: A.q, 'aria-label': 'Rechercher' });
    search.addEventListener('input', U.debounce(() => { A.q = search.value; renderList(); }, 180));
    const onlyChk = h('input', { type: 'checkbox', class: 'chk', checked: A.onlyIssues, on: { change: e => { A.onlyIssues = e.target.checked; renderList(); } } });
    const tools = h('div', { class: 'toolbar' },
      h('div', { class: 'search-wrap' }, UI.icon('search'), search),
      h('label', { class: 'mini-toggle' }, onlyChk, h('span', { text: 'À vérifier' })),
      UI.btn('Ligne', () => A.editor(sub, null, { initial: V.defaults(sub) }), 'primary small', 'plus'));
    const listBox = h('div', { class: 'list' });
    const foot = h('div', { class: 'list-foot' });
    box.appendChild(h('div', { class: 'pad' }, seg, tools));
    box.appendChild(listBox);
    box.appendChild(foot);

    function renderList() {
      UI.clear(listBox); UI.clear(foot);
      if (!S.has(sub)) { listBox.appendChild(UI.empty('Table introuvable', `La table ${C.tables[sub].name} n’existe pas dans ce classeur.`)); return; }
      if (sub === 'paiements') renderPaiements(listBox, foot); else renderAvancement(listBox, foot);
    }
    renderList();
  };

  function issueBar(level) { return h('span', { class: 'lv lv-' + (level || 'none'), 'aria-hidden': 'true' }); }

  function renderPaiements(listBox, foot) {
    const A = Hepi.A;
    const env = K.env();
    let recs = S.records('paiements').filter(scope).map(r => ({ r, is: K.paiement(r, env) }));
    if (A.onlyIssues) recs = recs.filter(x => ['error', 'warn'].includes(K.worst(x.is)) || x.r.avancement_propre_recalcule === true);
    if (!recs.length) {
      listBox.appendChild(UI.empty(A.q || A.onlyIssues ? 'Aucune ligne ne correspond.' : 'Aucun paiement pour cette sélection.',
        A.q || A.onlyIssues ? 'Modifiez la recherche ou le filtre.' : 'Choisissez un autre mois, ou saisissez une ligne à la main.',
        A.q || A.onlyIssues ? null : UI.btn('Saisir une ligne de paiement', () => A.editor('paiements', null, { initial: V.defaults('paiements') }), 'small', 'plus')));
      return;
    }
    const groups = {};
    recs.forEach(x => {
      const r = x.r;
      const mand = r.type_entreprise === 'Mandataire' ? r.entreprise : r.mandataire;
      const k = [S.ctx.mois === '*' ? r.Mois : '', r.lot, mand].join('§');
      (groups[k] = groups[k] || { mois: r.Mois, lot: r.lot, mand, items: [] }).items.push(x);
    });
    const keys = Object.keys(groups).sort((a, b) => {
      const ga = groups[a], gb = groups[b];
      if (S.ctx.mois === '*' && ga.mois !== gb.mois) return String(gb.mois).localeCompare(String(ga.mois));
      return String(ga.lot).localeCompare(String(gb.lot), 'fr', { numeric: true }) || String(ga.mand).localeCompare(String(gb.mand), 'fr');
    });
    let total = 0;
    keys.forEach(k => {
      const g = groups[k];
      g.items.sort((a, b) => (a.r.type_entreprise === 'Mandataire' ? -1 : 0) - (b.r.type_entreprise === 'Mandataire' ? -1 : 0) || String(a.r.entreprise).localeCompare(String(b.r.entreprise), 'fr'));
      const sum = g.items.reduce((a, x) => a + U.num(x.r.montant_ttc_declare), 0);
      total += sum;
      const grp = h('div', { class: 'grp' },
        h('div', { class: 'grp-head' },
          h('div', { class: 'grp-titles' }, h('span', { class: 'grp-lot', text: (S.ctx.mois === '*' ? U.monthShort(g.mois) + ' — ' : '') + (g.lot || 'Lot non renseigné') }), h('span', { class: 'grp-mand', text: g.mand || '' })),
          h('span', { class: 'grp-sum num', text: U.fmtMoney(sum) })));
      g.items.forEach(x => grp.appendChild(paiementItem(x.r, x.is)));
      listBox.appendChild(grp);
    });
    foot.appendChild(h('span', { text: `${recs.length} ligne${recs.length > 1 ? 's' : ''}` }));
    foot.appendChild(h('span', { class: 'num', text: 'Payé TTC ' + U.fmtEuro(U.round2(total)) }));
  }

  function paiementItem(r, is) {
    const A = Hepi.A;
    const st = r.type_entreprise === 'Sous-traitant';
    const flags = [];
    if (r.autoliquidation === true) flags.push(h('span', { class: 'flag', text: 'Autoliquidé' }));
    if (r.avancement_propre_recalcule === true) flags.push(h('span', { class: 'flag flag-warn', text: 'Part propre recalculée' }));
    const worst = K.worst(is.filter(i => !(i.level === 'info' && /recalculée/.test(i.msg))));
    const nIssues = is.filter(i => i.level !== 'info').length;
    return h('button', { type: 'button', class: 'item' + (st ? ' item-st' : ''), on: { click: () => A.editor('paiements', r) } },
      issueBar(worst),
      h('div', { class: 'item-main' },
        h('div', { class: 'item-title' }, h('span', { text: r.entreprise || '(entreprise ?)' }), UI.statusChip(r.Statut)),
        h('div', { class: 'item-meta' },
          h('span', { text: st ? 'Sous-traitant' : (r.type_entreprise || 'Rôle ?') }),
          h('span', { text: 'Sit. ' + U.display(r['N°_Situation'], 'int') }),
          flags,
          nIssues ? h('span', { class: 'meta-issues lv-text-' + worst, text: nIssues + ' point' + (nIssues > 1 ? 's' : '') + ' à revoir' }) : null)),
      h('span', { class: 'item-amount num', text: U.fmtMoney(r.montant_ttc_declare) }));
  }

  function renderAvancement(listBox, foot) {
    const A = Hepi.A;
    const env = K.env();
    let recs = S.records('avancement').filter(scope).map(r => ({ r, is: K.avancement(r, env) }));
    if (A.onlyIssues) recs = recs.filter(x => ['error', 'warn'].includes(K.worst(x.is)));
    if (!recs.length) {
      listBox.appendChild(UI.empty('Aucun avancement pour cette sélection.', null,
        UI.btn('Saisir un avancement', () => A.editor('avancement', null, { initial: V.defaults('avancement') }), 'small', 'plus')));
      return;
    }
    recs.sort((a, b) => String(b.r.Mois).localeCompare(String(a.r.Mois)) || String(a.r.Lot).localeCompare(String(b.r.Lot), 'fr', { numeric: true }));
    let total = 0;
    const grp = h('div', { class: 'grp' });
    recs.forEach(x => {
      const r = x.r;
      const ht = U.num(r.HT_Periodique_TVA_5_5) + U.num(r.HT_Periodique_TVA_10) + U.num(r.HT_Periodique_TVA_20);
      total += ht;
      grp.appendChild(h('button', { type: 'button', class: 'item', on: { click: () => A.editor('avancement', r) } },
        issueBar(K.worst(x.is.filter(i => i.level !== 'info'))),
        h('div', { class: 'item-main' },
          h('div', { class: 'item-title' }, h('span', { text: r.Lot || '(lot ?)' })),
          h('div', { class: 'item-meta' }, h('span', { text: 'Sit. ' + U.display(r['N°_Situation'], 'int') }), S.ctx.mois === '*' ? h('span', { text: U.monthShort(r.Mois) }) : null)),
        h('span', { class: 'item-amount num', text: U.fmtMoney(U.round2(ht)) })));
    });
    listBox.appendChild(grp);
    foot.appendChild(h('span', { text: `${recs.length} ligne${recs.length > 1 ? 's' : ''}` }));
    foot.appendChild(h('span', { class: 'num', text: 'HT ' + U.fmtEuro(U.round2(total)) }));
  }

  /* ---------- Valeurs par défaut d'une nouvelle ligne ---------- */
  V.defaults = function (key, extra) {
    const o = {};
    const fields = C.tables[key].fields;
    for (const hd in fields) if (fields[hd].type === 'bool') o[hd] = false;
    const opH = C.tables[key].opField;
    if (opH) o[opH] = S.ctx.op;
    if (key === 'paiements' || key === 'avancement') o['Date_Réception'] = U.todaySerial();
    return Object.assign(o, extra || {});
  };

  /* ---------- Paiements : comportements spécifiques ---------- */
  V.hooks.paiements = {
    title: rec => rec ? (rec.entreprise || 'Paiement') : 'Nouvelle ligne de paiement',
    cartouche: rec => UI.cartouche([
      { label: 'Opération', value: rec['Opération'] },
      { label: 'Mois', value: U.monthShort(rec.Mois) },
      { label: 'Entreprise', value: rec.entreprise, wide: true, strong: true },
      { label: 'Rôle', value: rec.type_entreprise },
      { label: 'Situation', value: 'n° ' + U.display(rec['N°_Situation'], 'int') + (U.isBlank(rec['N°_Facture']) ? '' : ' — fact. ' + rec['N°_Facture']) },
      { label: 'Lot', value: rec.lot, wide: true },
      rec.type_entreprise === 'Sous-traitant' ? { label: 'Mandataire', value: rec.mandataire, wide: true } : null
    ]),
    check: v => K.paiement(v),
    onChange: function (form, hd, isNew) {
      // Pré-remplissage depuis BDD Entreprises quand on choisit l'entreprise d'une nouvelle ligne
      if (isNew && hd === 'entreprise') {
        const op = form.values['Opération'];
        const refs = S.records('entreprises').filter(r => U.same(r.Operation, op) && U.same(r.Entreprise, form.values.entreprise));
        if (refs.length) {
          const ref = refs.find(r => U.same(r.Denomination_Lot, form.values.lot)) || refs[0];
          const set = (k, v) => { if (form.ctl[k] && (U.isBlank(form.values[k]) || form.values[k] === false)) { form.values[k] = v; form.ctl[k].show(v); } };
          set('type_entreprise', ref.Type);
          set('mandataire', ref.Type === 'Mandataire' ? ref.Entreprise : ref.Mandataire);
          if (ref.Type === 'Mandataire') set('lot', ref.Denomination_Lot);
          else { const m = S.records('entreprises').find(r => U.same(r.Operation, op) && r.Type === 'Mandataire' && U.same(r.Entreprise, ref.Mandataire)); set('lot', m ? m.Denomination_Lot : ref.Denomination_Lot); }
          set('autoliquidation', String(ref['Autoliquidation (OUI/NON)']).toUpperCase() === 'OUI');
          form.refresh();
        }
      }
      // Une ligne corrigée à la main passe au statut « Corrigé » (modifiable avant d'enregistrer)
      if (!isNew && hd !== 'Statut' && form.ctl.Statut && U.isBlank(form.base.Statut) && U.isBlank(form.values.Statut) && form.dirty()) {
        form.values.Statut = 'Corrigé'; form.ctl.Statut.show('Corrigé'); form.refreshLight('Statut');
      }
    },
    actions: rec => [
      { label: 'Dupliquer la ligne', icon: 'copy', run: () => Hepi.A.editor('paiements', null, { initial: copyInputs('paiements', rec, { Statut: '' }) }) },
      rec.type_entreprise === 'Mandataire' ? { label: 'Ajouter un sous-traitant du mois', icon: 'plus', run: () => Hepi.A.editor('paiements', null, { initial: stInitial(rec) }) } : null
    ],
    after: function (rec, box) {
      const env = K.env();
      if (rec.type_entreprise === 'Mandataire') {
        box.appendChild(netBlock(rec));
        const sts = K.stOf(rec, env);
        if (sts.length) {
          const tbl = h('div', { class: 'related' }, h('h3', { class: 'sec-title', text: 'Sous-traitants payés ce mois-ci' }));
          sts.forEach(s => tbl.appendChild(h('button', { type: 'button', class: 'rel-item', on: { click: () => Hepi.A.editor('paiements', s, { replace: true }) } },
            h('span', { class: 'rel-name', text: s.entreprise }),
            h('span', { class: 'num', text: U.fmtMoney(RATES.reduce((a, t) => a + U.num(s['avancement_total_ht_tva' + t.key]), 0)) + ' HT' }))));
          box.appendChild(tbl);
        }
      } else if (rec.type_entreprise === 'Sous-traitant') {
        const m = K.mandataireOf(rec, env);
        if (m) box.appendChild(h('div', { class: 'related' }, h('button', { type: 'button', class: 'rel-item', on: { click: () => Hepi.A.editor('paiements', m, { replace: true }) } },
          h('span', { class: 'rel-name', text: 'Ligne du mandataire : ' + m.entreprise }), h('span', { class: 'num', text: U.fmtMoney(m.montant_ttc_declare) + ' TTC' }))));
      }
    }
  };

  function copyInputs(key, rec, over) {
    const o = {};
    S.inputHeaders(key).forEach(hd => { o[hd] = rec[hd]; });
    return Object.assign(o, over || {});
  }
  function stInitial(rec) {
    const o = V.defaults('paiements');
    ['Opération', 'N°_Situation', 'Date_Réception', 'Date_Document', 'Date_Échéance', 'N°_Facture', 'Source_PDF'].forEach(k => { o[k] = rec[k]; });
    o.type_entreprise = 'Sous-traitant'; o.mandataire = rec.entreprise; o.lot = rec.lot;
    return o;
  }

  /* Net calculé par le tableau de bord pour ce couple entreprise / lot. */
  function netBlock(rec) {
    const d = S.dash;
    const box = h('div', { class: 'netbox' });
    if (!d || !d.exists) return box;
    const sameCtx = U.same(d.op, rec['Opération']) && U.same(d.mois, rec.Mois);
    if (!sameCtx) {
      box.appendChild(h('p', { class: 'netbox-note', text: 'Le tableau de bord affiche une autre opération ou un autre mois.' }));
      box.appendChild(UI.btn('Afficher ce mois dans le tableau de bord', async () => {
        S.ctx.op = String(rec['Opération']); S.ctx.mois = String(rec.Mois); S.ctx.follow = true;
        await Hepi.A.run(async () => { await S.pushCtxToDashboard(); await S.load(); });
        Hepi.A.render();
      }, 'small ghost'));
      return box;
    }
    const p = d.pairs.find(x => U.same(x.entreprise, rec.entreprise) && U.same(x.lot, rec.lot));
    if (!p) { box.appendChild(h('p', { class: 'netbox-note', text: 'Ce couple entreprise / lot n’apparaît pas dans le tableau de bord.' })); return box; }
    const calc = U.num(p.netCalcule), decl = U.num(p.netDeclare), ecart = U.round2(decl - calc);
    const ok = Math.abs(ecart) <= 1;
    box.classList.add(ok ? 'netbox-ok' : 'netbox-ko');
    box.appendChild(h('div', { class: 'netbox-title', text: 'Vérification du net à payer (tableau de bord)' }));
    box.appendChild(h('div', { class: 'netbox-grid' },
      h('span', { text: 'Net calculé' }), h('span', { class: 'num', text: U.fmtEuro(calc) }),
      h('span', { text: 'Net déclaré' }), h('span', { class: 'num', text: U.fmtEuro(decl) }),
      h('span', { class: 'netbox-ecart', text: ok ? 'Concordant' : 'Écart' }), h('span', { class: 'num netbox-ecart', text: ok ? '' : U.fmtEuro(ecart) })));
    return box;
  }
  V.netBlock = netBlock;

  /* ---------- Avancement ---------- */
  V.hooks.avancement = {
    title: rec => rec ? (rec.Lot || 'Avancement') : 'Nouvel avancement',
    cartouche: rec => UI.cartouche([
      { label: 'Opération', value: rec['Opération'] },
      { label: 'Mois', value: U.monthShort(rec.Mois) },
      { label: 'Lot', value: rec.Lot, wide: true, strong: true },
      { label: 'Situation', value: 'n° ' + U.display(rec['N°_Situation'], 'int') },
      { label: 'Reçue le', value: U.fmtDate(rec['Date_Réception']) }
    ]),
    check: v => K.avancement(v),
    actions: rec => [
      { label: 'Dupliquer la ligne', icon: 'copy', run: () => Hepi.A.editor('avancement', null, { initial: copyInputs('avancement', rec) }) }
    ],
    after: function (rec, box) {
      const pai = S.records('paiements').filter(r => r.type_entreprise === 'Mandataire' && U.same(r['Opération'], rec['Opération']) && String(r.Mois) === String(rec.Mois) && U.same(r.lot, rec.Lot));
      if (!pai.length) return;
      const ht = pai.reduce((a, r) => a + RATES.reduce((b, t) => b + U.num(r['avancement_total_ht_tva' + t.key]), 0), 0);
      const mine = U.num(rec.HT_Periodique_TVA_5_5) + U.num(rec.HT_Periodique_TVA_10) + U.num(rec.HT_Periodique_TVA_20);
      const diff = U.round2(mine - ht);
      box.appendChild(h('div', { class: 'netbox ' + (Math.abs(diff) <= 1 ? 'netbox-ok' : '') },
        h('div', { class: 'netbox-title', text: 'Comparaison avec les paiements du mois' }),
        h('div', { class: 'netbox-grid' },
          h('span', { text: 'Avancement total déclaré (mandataire)' }), h('span', { class: 'num', text: U.fmtEuro(U.round2(ht)) }),
          h('span', { text: 'Écart avec cette ligne' }), h('span', { class: 'num', text: Math.abs(diff) <= 1 ? 'Concordant' : U.fmtEuro(diff) }))));
    }
  };
})();
