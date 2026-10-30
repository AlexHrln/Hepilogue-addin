/* Onglet Journal : historique des modifications faites depuis le panneau. */
(function () {
  const U = Hepi.U, S = Hepi.S, UI = Hepi.UI, C = Hepi.config;
  const h = UI.h;
  const V = Hepi.V = Hepi.V || {};

  const keyByLabel = label => Object.keys(C.tables).find(k => C.tables[k].label === label);

  V.journal = function (box) {
    const A = Hepi.A;
    A.jq = A.jq || '';
    A.jOp = A.jOp === undefined ? true : A.jOp;
    const search = h('input', { class: 'inp search', type: 'search', placeholder: 'Rechercher dans le journal…', value: A.jq, 'aria-label': 'Rechercher dans le journal' });
    const onlyOp = h('input', { type: 'checkbox', class: 'chk', checked: A.jOp, on: { change: e => { A.jOp = e.target.checked; draw(); } } });
    search.addEventListener('input', U.debounce(() => { A.jq = search.value; draw(); }, 180));
    box.appendChild(h('div', { class: 'pad' }, h('div', { class: 'toolbar' },
      h('div', { class: 'search-wrap' }, UI.icon('search'), search),
      h('label', { class: 'mini-toggle' }, onlyOp, h('span', { text: S.ctx.op || 'Opération' })))));
    const list = h('div', { class: 'list' });
    box.appendChild(list);

    function draw() {
      UI.clear(list);
      if (!S.has('journal')) { list.appendChild(UI.empty('Le journal est vide.', 'Chaque modification faite depuis ce panneau y sera tracée : qui, quand, quelle valeur avant et après.')); return; }
      let recs = S.records('journal').slice().reverse();
      if (A.jOp && S.ctx.op) recs = recs.filter(r => String(r['Clé']).split(' | ')[0] === S.ctx.op || r['Clé'] === S.ctx.op);
      if (A.jq) { const q = U.norm(A.jq); recs = recs.filter(r => U.norm(Object.values(r).filter(v => typeof v !== 'object').join(' ')).includes(q)); }
      if (!recs.length) { list.appendChild(UI.empty('Aucune entrée ne correspond.', null)); return; }
      recs.slice(0, 250).forEach(r => list.appendChild(entry(r)));
      if (recs.length > 250) list.appendChild(h('p', { class: 'list-foot', text: `250 entrées affichées sur ${recs.length}. Le journal complet est dans la feuille masquée « ${C.tables.journal.sheet} ».` }));
    }
    draw();
  };

  function entry(r) {
    const A = Hepi.A;
    const del = r.Action === 'Suppression';
    let restore = null;
    if (del && r['Ancienne valeur']) {
      const key = keyByLabel(r.Table);
      if (key) restore = UI.btn('Restaurer la ligne', async () => {
        let vals;
        try { vals = JSON.parse(r['Ancienne valeur']); } catch (e) { UI.toast('Contenu illisible : restauration impossible.', { kind: 'err' }); return; }
        if (!await UI.confirm('Restaurer la ligne ?', `La ligne « ${r['Clé']} » sera recréée en fin de table ${C.tables[key].name}.`, { confirm: 'Restaurer' })) return;
        await A.ensureUser();
        const res = await A.run(() => S.create(key, vals));
        if (res) { UI.toast('Ligne restaurée.'); A.render(); }
      }, 'small ghost');
    }
    return h('div', { class: 'jentry' },
      h('div', { class: 'j-head' },
        h('span', { class: 'j-action j-' + U.norm(r.Action).toLowerCase(), text: r.Action }),
        h('span', { class: 'j-table', text: r.Table }),
        h('span', { class: 'j-when', text: (U.fmtDate(r.Horodatage) + ' ' + timeOf(r.Horodatage)).trim() + (r.Utilisateur ? ', ' + r.Utilisateur : '') })),
      r['Clé'] ? h('div', { class: 'j-key', title: r['Clé'], text: String(r['Clé']).split(' | ').filter(x => !/\.pdf$/i.test(x)).join(' | ') }) : null,
      del ? null : (r.Champ || r['Ancienne valeur'] || r['Nouvelle valeur']) ? h('div', { class: 'j-change' },
        r.Champ ? h('span', { class: 'j-field', text: r.Champ }) : null,
        !U.isBlank(r['Ancienne valeur']) ? h('span', { class: 'j-before', text: String(r['Ancienne valeur']) }) : null,
        !U.isBlank(r['Nouvelle valeur']) ? h('span', { class: 'j-after', text: String(r['Nouvelle valeur']) }) : null) : null,
      restore);
  }

  function timeOf(v) {
    if (typeof v !== 'number') return '';
    const mins = Math.round((v - Math.floor(v)) * 1440);
    return String(Math.floor(mins / 60) % 24).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }
  V.timeOf = timeOf;
})();
