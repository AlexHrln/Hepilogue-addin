/* Hépilogue – Saisie : paiements du mois affiché dans le tableau de bord, et ajouts au référentiel. */
(function () {
  const U = Hepi.U, X = Hepi.X, C = Hepi.config, T = C.tables;
  const $ = id => document.getElementById(id);

  /* ---------- Petits outils d'affichage ---------- */
  function h(tag, props) {
    const el = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(x => add(el, x));
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  const btn = (label, onClick, cls) => h('button', { type: 'button', class: 'btn ' + (cls || ''), on: { click: onClick } }, label);

  function toast(msg, kind) {
    const root = clear($('toast'));
    const el = h('div', { class: 'toast ' + (kind || ''), role: 'status' }, msg);
    root.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, kind === 'err' ? 10000 : 4000);
  }
  /* Les fenêtres natives (alert, confirm) ne fonctionnent pas dans un complément Office. */
  function ask(title, body, actions) {
    return new Promise(resolve => {
      const root = $('modal');
      const close = v => { clear(root); resolve(v); };
      root.appendChild(h('div', { class: 'modal-back' },
        h('div', { class: 'modal', role: 'dialog', 'aria-label': title },
          h('h2', { text: title }), typeof body === 'string' ? h('p', { text: body }) : body,
          h('div', { class: 'modal-actions' }, actions.map(a => btn(a.label, () => close(a.value), a.cls))))));
      const b = root.querySelector('.btn.primary'); if (b) b.focus();
    });
  }
  async function busy(fn, label) {
    $('busy').hidden = false; $('busy').title = label || '';
    try { return await fn(); }
    catch (e) { console.error(e); toast(X.friendlyError(e), 'err'); return null; }
    finally { $('busy').hidden = true; }
  }

  /* ---------- Données ---------- */
  const S = { op: '', mois: '', t: {}, view: 'list', tab: 'paiements', form: null, lastWrite: 0 };

  async function load() {
    const res = await X.readAll(Object.values(T));
    S.t = res.tables; S.op = res.op; S.mois = res.mois;
  }
  function records(name) {
    const t = S.t[name];
    if (!t) return [];
    return t.rows.map(row => {
      const r = { _i: row.i, _base: {} };
      t.headers.forEach((col, j) => { r[col] = row.v[j]; if (t.calc[j] === undefined) r._base[col] = row.v[j]; });
      return r;
    });
  }
  const has = (name, col) => !!S.t[name] && S.t[name].idx[col] !== undefined;

  function options(name, values) {
    const op = values.Operation || S.op;
    switch (name) {
      case 'entreprises': return U.sortFr(U.uniq(records(T.entreprises).filter(r => U.same(r.Operation, op)).map(r => String(r.Entreprise))));
      case 'mandataires': return U.sortFr(U.uniq(records(T.entreprises).filter(r => U.same(r.Operation, op) && r.Type === 'Mandataire').map(r => String(r.Entreprise))));
      case 'lots': return U.sortFr(U.uniq(records(T.marches).filter(r => U.same(r.Operation, op)).map(r => String(r.Denomination_Lot)).concat([C.lotEntrepriseGenerale])));
      case 'lotsEG': return [''].concat(options('lots', values));
      case 'months': return [''].concat(records(T.indices).map(r => String(r.Mois)).filter(Boolean));
      case 'indexNames': return [''].concat(S.t[T.indices] ? S.t[T.indices].headers.filter(x => x !== 'Mois') : []);
      case 'revisionTypes': return C.revisionTypes;
      default: return [];
    }
  }
  function operations() {
    const ops = [].concat(
      records(T.marches).map(r => r.Operation), records(T.entreprises).map(r => r.Operation),
      records(T.operations).map(r => r['Nom des opérations autorisées']), [S.op]);
    return U.sortFr(U.uniq(ops.map(String)));
  }

  /* ---------- Champs de formulaire ---------- */
  let uid = 0;
  function makeForm(values, base, onChange) {
    const F = { values, base: base || null, ctl: {}, errors: {} };
    F.field = function (def, compact) {
      const id = 'f' + (++uid), col = def.col;
      let input;
      const read = final => {
        let v = input.value, err = '';
        if (def.type === 'bool') v = input.checked;
        else if (def.type === 'date') v = input.value ? U.isoToSerial(input.value) : '';
        else if (def.type === 'money' || def.type === 'coef' || def.type === 'int') {
          const p = U.parseNumber(input.value);
          if (!p.ok) err = p.error;
          else {
            v = p.value;
            if (v !== '' && def.type === 'money') v = U.round2(v);
            if (v !== '' && def.type === 'int' && !Number.isInteger(v)) err = 'Nombre entier attendu';
            if (final && !err && v !== '') input.value = def.type === 'money' ? U.fmtMoney(v) : U.fmtCoef(v);
          }
        } else if (final) v = v.trim();
        F.errors[col] = err;
        if (!err) F.values[col] = v;
        mark();
        if (onChange) onChange(col, final);
      };
      if (def.type === 'bool') input = h('input', { type: 'checkbox', id, class: 'chk', on: { change: () => read(true) } });
      else if (def.type === 'select') input = h('select', { id, class: 'inp', on: { change: () => read(true) } });
      else if (def.type === 'date') input = h('input', { type: 'date', id, class: 'inp', on: { change: () => read(true) } });
      else input = h('input', {
        type: 'text', id, autocomplete: 'off', placeholder: def.placeholder || '',
        class: 'inp' + (['money', 'coef', 'int'].includes(def.type) ? ' num' : ''),
        inputmode: def.type === 'int' ? 'numeric' : (def.type === 'money' || def.type === 'coef' ? 'decimal' : 'text'),
        on: { input: () => read(false), blur: () => read(true), keydown: e => { if (e.key === 'Enter' && input.tagName === 'INPUT') { e.preventDefault(); read(true); } } }
      });
      let list = null;
      if (def.type === 'text' && def.options) { list = h('datalist', { id: id + 'l' }); input.setAttribute('list', id + 'l'); }
      const fill = () => {
        const v = F.values[col];
        if (def.type === 'select' || list) {
          const opts = Array.isArray(def.options) ? def.options : options(def.options, F.values);
          const target = list || clear(input);
          if (list) clear(list);
          const all = opts.slice();
          if (def.type === 'select') {
            if ((!def.required || U.isBlank(v)) && !all.includes('')) all.unshift('');
            if (!U.isBlank(v) && !all.some(o => U.same(o, v))) all.push(String(v));
          }
          all.forEach(o => target.appendChild(h('option', { value: o, text: o === '' && !list ? '—' : o })));
        }
        if (def.type === 'bool') input.checked = v === true;
        else if (def.type === 'date') input.value = U.serialToISO(v);
        else if (def.type === 'money') input.value = typeof v === 'number' ? U.fmtMoney(v) : (U.isBlank(v) ? '' : String(v));
        else if (def.type === 'coef') input.value = typeof v === 'number' ? U.fmtCoef(v) : (U.isBlank(v) ? '' : String(v));
        else input.value = U.isBlank(v) ? '' : String(v);
      };
      const box = compact ? h('div', { class: 'cell' }, input)
        : def.type === 'bool' ? h('label', { class: 'fld fld-bool', for: id }, input, h('span', { text: def.label }))
          : h('div', { class: 'fld' + (def.strong ? ' fld-strong' : '') }, h('label', { for: id, class: 'lbl' }, def.label, def.required ? ' *' : ''), input, list);
      if (compact) input.setAttribute('aria-label', def.label);
      const msg = h('div', { class: 'msg' });
      if (!compact && def.type !== 'bool') box.appendChild(msg);
      F.ctl[col] = { def, box, input, fill, msg };
      fill();
      return box;
    };
    F.changes = function () {
      const out = {};
      for (const col in F.ctl) {
        const v = F.values[col];
        if (F.ctl[col].box.hidden) continue;
        if (!F.base) { if (!U.isBlank(v) && v !== false) out[col] = v; }
        else if (!U.same(v, F.base[col]) && !(v === false && U.isBlank(F.base[col]))) out[col] = v;
      }
      return out;
    };
    F.refresh = function () {
      for (const col in F.ctl) {
        const c = F.ctl[col];
        if (c.def.when) c.box.hidden = !c.def.when(F.values);
        if (c.def.type === 'select' || c.input.list) c.fill();
      }
      mark();
    };
    F.problems = function () {
      const out = [];
      for (const col in F.ctl) {
        const c = F.ctl[col];
        if (c.box.hidden) continue;
        if (F.errors[col]) out.push(`${c.def.label} : ${F.errors[col]}`);
        else if (c.def.required && U.isBlank(F.values[col])) out.push(`${c.def.label} : à renseigner`);
      }
      return out;
    };
    function mark() {
      for (const col in F.ctl) {
        const c = F.ctl[col];
        const changed = F.base && !U.same(F.values[col], F.base[col]) && !(F.values[col] === false && U.isBlank(F.base[col]));
        c.box.classList.toggle('changed', !!changed);
        c.box.classList.toggle('bad', !!F.errors[col]);
        c.input.title = changed ? 'Avant : ' + (U.display(F.base[col], c.def.type) || '(vide)') : '';
        c.msg.textContent = F.errors[col] || '';
      }
    }
    return F;
  }

  function matrix(F, rows) {
    return h('div', { class: 'mx' },
      h('div', { class: 'mx-head' }, Hepi.TVA.map(t => h('span', { text: t }))),
      rows.filter(r => r.cols.some(c => has(T.paiements, c))).map(r => h('div', { class: 'mx-row' },
        h('div', { class: 'mx-label', text: r.label }),
        r.cols.map((col, k) => has(T.paiements, col) ? F.field({ col, label: `${r.label} ${Hepi.TVA[k]}`, type: 'money' }, true) : h('div', { class: 'cell' })))));
  }

  /* ---------- Rendu ---------- */
  function render() {
    $('ctx-op').textContent = S.op || 'Aucune opération';
    $('ctx-mois').textContent = S.mois ? U.monthShort(S.mois) : '—';
    document.querySelectorAll('.tab').forEach(t => {
      const on = t.dataset.tab === S.tab;
      t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const v = clear($('view'));
    if (S.view === 'list') (S.tab === 'paiements' ? viewPaiements : viewReferentiel)(v);
    else S.viewFn(v);
  }

  async function leave() {
    if (S.form && Object.keys(S.form.changes()).length && S.form.base) {
      const ok = await ask('Abandonner la saisie ?', 'Les modifications non enregistrées seront perdues.',
        [{ label: 'Continuer la saisie', value: false, cls: 'ghost' }, { label: 'Abandonner', value: true, cls: 'danger' }]);
      if (!ok) return false;
    }
    S.form = null; S.view = 'list';
    return true;
  }

  /* Liste des paiements du mois */
  function viewPaiements(v) {
    if (!S.t[T.paiements]) { v.appendChild(h('p', { class: 'empty', text: `Table ${T.paiements} introuvable dans ce classeur.` })); return; }
    const rows = records(T.paiements).filter(r => U.same(r['Opération'], S.op) && U.same(r.Mois, S.mois));
    const total = rows.reduce((a, r) => a + U.num(r.montant_ttc_declare), 0);
    v.appendChild(h('div', { class: 'bar' },
      h('span', { class: 'bar-text', text: rows.length ? `${rows.length} ligne${rows.length > 1 ? 's' : ''} — ${U.fmtMoney(U.round2(total))} € TTC` : '' }),
      btn('Ajouter une ligne', () => openPaiement(null), 'primary small')));
    if (!rows.length) {
      v.appendChild(h('p', { class: 'empty', text: 'Aucun paiement pour ce mois. Changez de mois dans le tableau de bord ou ajoutez une ligne.' }));
      return;
    }
    // Mandataire puis ses sous-traitants, lot par lot
    const groups = {};
    rows.forEach(r => {
      const mand = r.type_entreprise === 'Sous-traitant' ? r.mandataire : r.entreprise;
      const k = r.lot + '§' + mand;
      (groups[k] = groups[k] || { lot: r.lot, items: [] }).items.push(r);
    });
    Object.keys(groups).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })).forEach(k => {
      const g = groups[k];
      g.items.sort((a, b) => (a.type_entreprise === 'Sous-traitant') - (b.type_entreprise === 'Sous-traitant') || String(a.entreprise).localeCompare(String(b.entreprise), 'fr'));
      v.appendChild(h('div', { class: 'grp', text: g.lot || 'Lot non renseigné' }));
      g.items.forEach(r => v.appendChild(h('button', {
        type: 'button', class: 'item' + (r.type_entreprise === 'Sous-traitant' ? ' st' : ''), on: { click: () => openPaiement(r) }
      },
      h('span', { class: 'item-main' }, h('span', { class: 'item-name', text: r.entreprise || '?' }),
        h('span', { class: 'item-meta', text: `${r.type_entreprise || ''} — situation ${U.display(r['N°_Situation'], 'int')}` })),
      h('span', { class: 'item-amount num', text: U.fmtMoney(r.montant_ttc_declare) }))));
    });
  }

  /* Fiche d'un paiement (existant ou nouveau) */
  function openPaiement(rec) {
    const isNew = !rec;
    const P = C.paiement;
    S.view = 'form';
    S.viewFn = function (v) {
      const values = isNew ? newPaiementDefaults() : Object.assign({}, rec);
      let foot;
      const F = makeForm(values, isNew ? null : rec._base, (col, final) => {
        if (isNew && col === 'entreprise' && final) prefill(F);
        if (isNew && col === 'Date_Réception') dateHint();
        if (final) F.refresh();
        updateFoot();
      });
      S.form = F;
      v.appendChild(h('div', { class: 'head' },
        h('button', { type: 'button', class: 'back', 'aria-label': 'Retour', on: { click: async () => { if (await leave()) render(); } } }, '‹'),
        h('div', {}, h('div', { class: 'head-title', text: isNew ? 'Nouvelle ligne de paiement' : (rec.entreprise || 'Paiement') }),
          h('div', { class: 'head-sub', text: isNew ? `${S.op} — ${U.monthShort(S.mois)}` : `${rec.type_entreprise || ''}, ${rec.lot || ''} — situation ${U.display(rec['N°_Situation'], 'int')}` }))));
      const hint = h('div', { class: 'hint' });
      function dateHint() {
        const m = U.monthFromSerial(F.values['Date_Réception']);
        hint.textContent = m && S.mois && m !== S.mois ? `Avec cette date, la ligne sera rattachée à ${U.monthShort(m)} et non à ${U.monthShort(S.mois)}.` : '';
      }
      if (isNew) {
        const sec = h('div', { class: 'sec' }, h('h3', { text: 'Identification' }));
        P.identity.filter(d => has(T.paiements, d.col)).forEach(d => sec.appendChild(F.field(d)));
        sec.appendChild(hint);
        v.appendChild(sec);
      }
      v.appendChild(h('div', { class: 'sec' }, h('h3', { text: 'Montants HT du mois' }), matrix(F, P.matrix)));
      v.appendChild(h('div', { class: 'sec grid2' }, P.fields.filter(d => has(T.paiements, d.col)).map(d => F.field(d))));
      const status = h('span', { class: 'foot-text' });
      const saveBtn = btn(isNew ? 'Ajouter la ligne' : 'Enregistrer', () => (isNew ? createPaiement(F) : savePaiement(rec, F)), 'primary');
      foot = h('div', { class: 'foot' }, status, saveBtn);
      v.appendChild(foot);
      function updateFoot() {
        if (isNew) return;
        const n = Object.keys(F.changes()).length;
        status.textContent = n ? `${n} modification${n > 1 ? 's' : ''}` : '';
        saveBtn.disabled = n === 0;
      }
      F.refresh(); updateFoot(); if (isNew) dateHint();
    };
    render();
    $('view').scrollTop = 0;
  }

  function newPaiementDefaults() {
    const o = {};
    C.paiement.falseOnCreate.forEach(c => { o[c] = false; });
    // Date par défaut dans le mois affiché, pour que la ligne y soit rattachée
    const m = /^(\d{4})_(\d{2})/.exec(S.mois || '');
    const today = new Date();
    if (m && !(today.getFullYear() === +m[1] && today.getMonth() + 1 === +m[2])) o['Date_Réception'] = U.isoToSerial(`${m[1]}-${m[2]}-01`);
    else o['Date_Réception'] = U.todaySerial();
    return o;
  }

  /* Choisir une entreprise connue remplit son rôle, son mandataire, son lot et l'autoliquidation. */
  function prefill(F) {
    const refs = records(T.entreprises).filter(r => U.same(r.Operation, S.op) && U.same(r.Entreprise, F.values.entreprise));
    if (!refs.length) return;
    const ref = refs[0];
    const set = (col, val) => { if (F.ctl[col]) { F.values[col] = val; F.ctl[col].fill(); } };
    set('type_entreprise', ref.Type);
    if (ref.Type === 'Mandataire') { set('mandataire', ref.Entreprise); set('lot', ref.Denomination_Lot); }
    else {
      set('mandataire', ref.Mandataire);
      const m = records(T.entreprises).find(r => U.same(r.Operation, S.op) && r.Type === 'Mandataire' && U.same(r.Entreprise, ref.Mandataire));
      set('lot', m ? m.Denomination_Lot : ref.Denomination_Lot);
    }
    set('autoliquidation', String(ref['Autoliquidation (OUI/NON)']).toUpperCase() === 'OUI');
  }

  const PAI_KEYS = ['Opération', 'N°_Situation', 'entreprise', 'lot', 'Source_PDF'];

  async function savePaiement(rec, F, force) {
    const pb = F.problems();
    if (pb.length) { toast(pb[0], 'err'); return; }
    const changes = F.changes();
    if (!Object.keys(changes).length) return;
    S.lastWrite = Date.now();
    const res = await busy(() => X.updateRow(T.paiements, { base: rec._base, hint: rec._i, keys: PAI_KEYS, changes, force }), 'Enregistrement');
    if (!res) return;
    if (res.status === 'conflict') {
      const body = h('div', {}, h('p', { text: 'Quelqu’un a modifié cette ligne pendant votre saisie :' }),
        h('ul', {}, res.conflicts.map(c => h('li', { text: `${c.col} : ${U.display(c.theirs, 'money') || '(vide)'} chez l’autre utilisateur, ${U.display(c.mine, 'money') || '(vide)'} chez vous` }))));
      const keep = await ask('Modification simultanée', body, [{ label: 'Garder sa version', value: false, cls: 'ghost' }, { label: 'Garder ma saisie', value: true, cls: 'primary' }]);
      if (keep) return savePaiement(rec, F, true);
      await busy(load); S.form = null; S.view = 'list'; render(); return;
    }
    if (res.status === 'notfound') {
      toast('Ligne introuvable : elle a été supprimée ou modifiée entre-temps. La liste est rechargée.', 'err');
      await busy(load); S.form = null; S.view = 'list'; render(); return;
    }
    await busy(load);
    S.form = null; S.view = 'list'; render();
    toast('Modifications enregistrées.');
  }

  async function createPaiement(F) {
    const pb = F.problems();
    if (pb.length) { toast(pb[0], 'err'); return; }
    const obj = Object.assign({ 'Opération': S.op }, F.changes());
    C.paiement.falseOnCreate.forEach(c => { if (!(c in obj)) obj[c] = false; });
    S.lastWrite = Date.now();
    const res = await busy(() => X.addRow(T.paiements, obj, ['Opération', 'entreprise', 'type_entreprise', 'mandataire', 'lot']), 'Ajout');
    if (!res) return;
    await busy(load);
    S.form = null; S.view = 'list'; render();
    toast('Ligne ajoutée.');
  }

  /* ---------- Référentiel : ajouts uniquement ---------- */
  function viewReferentiel(v) {
    v.appendChild(h('div', { class: 'sec' },
      h('p', { class: 'intro', text: 'Ajouter un élément au référentiel. Pour modifier un élément existant, passez directement par la table.' }),
      h('div', { class: 'choices' },
        btn('Ajouter une opération', () => openRef('operation'), 'choice'),
        btn('Ajouter un lot', () => openRef('lot'), 'choice'),
        btn('Ajouter une entreprise', () => openRef('entreprise'), 'choice'))));
  }

  function openRef(kind, preset) {
    S.view = 'form';
    S.viewFn = function (v) {
      const title = { operation: 'Nouvelle opération', lot: 'Nouveau lot', entreprise: 'Nouvelle entreprise' }[kind];
      v.appendChild(h('div', { class: 'head' },
        h('button', { type: 'button', class: 'back', 'aria-label': 'Retour', on: { click: async () => { if (await leave()) render(); } } }, '‹'),
        h('div', {}, h('div', { class: 'head-title', text: title }))));
      const values = Object.assign({}, preset || {});
      if (kind === 'lot') Object.assign(values, { Operation: values.Operation || S.op, 'Type de révision': 'Révision simple', 'Indice 1 coefficient': 1 });
      if (kind === 'entreprise') Object.assign(values, { Operation: values.Operation || S.op });
      const F = makeForm(values, null, (col, final) => {
        if (kind === 'entreprise' && col === 'Type' && values.Type === 'Sous-traitant' && U.isBlank(values['Autoliquidation (OUI/NON)'])) { values['Autoliquidation (OUI/NON)'] = 'OUI'; }
        if (final) F.refresh();
      });
      S.form = F;
      const sec = h('div', { class: 'sec' });
      if (kind === 'operation') {
        sec.appendChild(F.field({ col: 'Nom', label: 'Nom de l’opération', type: 'text', required: true, placeholder: 'VILLE-PROJET' }));
        sec.appendChild(h('p', { class: 'hint', text: 'Écrit comme au début des noms de fichiers des situations. L’opération est ajoutée à la liste reconnue par l’extraction ; elle apparaîtra dans le tableau de bord dès son premier lot.' }));
      } else {
        sec.appendChild(F.field({ col: 'Operation', label: 'Opération', type: 'select', options: operations(), required: true }));
        const defs = kind === 'lot' ? C.lot : C.entreprise;
        let grid = null, gname = null;
        defs.forEach(d => {
          if (d.group) {
            if (gname !== d.group) { grid = h('div', { class: 'grid3' }); sec.appendChild(grid); gname = d.group; }
            grid.appendChild(F.field(d));
          } else { gname = null; sec.appendChild(F.field(d)); }
        });
      }
      v.appendChild(sec);
      v.appendChild(h('div', { class: 'foot' }, h('span', { class: 'foot-text' }), btn('Ajouter', () => createRef(kind, F), 'primary')));
      F.refresh();
    };
    render();
    $('view').scrollTop = 0;
  }

  async function createRef(kind, F) {
    const pb = F.problems();
    if (pb.length) { toast(pb[0], 'err'); return; }
    const v = F.changes();
    let table, obj, text;
    if (kind === 'operation') {
      const name = String(v.Nom || '').trim().toUpperCase().replace(/\s+/g, '-');
      if (operations().some(o => U.same(o, name))) { toast('Cette opération existe déjà.', 'err'); return; }
      table = T.operations; obj = { 'Nom des opérations autorisées': name }; text = Object.keys(obj);
    } else if (kind === 'lot') {
      if (records(T.marches).some(r => U.same(r.Operation, v.Operation) && U.same(r.Denomination_Lot, v.Denomination_Lot))) { toast('Ce lot existe déjà pour cette opération.', 'err'); return; }
      table = T.marches; obj = v; text = ['Operation', 'Denomination_Lot', 'Type de révision', 'MOIS DE REFERENCE', 'Indice 1 de révision BT', 'Indice 2 de révision BT'];
      ['Montant base HT TVA 5,5%', 'Montant base HT TVA 10%', 'Montant base HT TVA 20%'].forEach(c => { if (!(c in obj)) obj[c] = 0; });
    } else {
      if (records(T.entreprises).some(r => U.same(r.Operation, v.Operation) && U.same(r.Entreprise, v.Entreprise) && U.same(r.Denomination_Lot, v.Denomination_Lot) && U.same(r.Type, v.Type))) { toast('Cette entreprise est déjà déclarée sur ce lot.', 'err'); return; }
      table = T.entreprises; obj = v; text = ['Operation', 'Entreprise', 'Denomination_Lot', 'Nature des prestations ST', 'Type', 'Mandataire', 'Autoliquidation (OUI/NON)', 'Avance', 'RG (OUI/NON)'];
    }
    if (!S.t[table]) { toast(`Table ${table} introuvable.`, 'err'); return; }
    S.lastWrite = Date.now();
    const res = await busy(() => X.addRow(table, obj, text), 'Ajout');
    if (!res) return;
    await busy(load);
    S.form = null;
    if (kind === 'operation') {
      toast(`Opération ${obj['Nom des opérations autorisées']} ajoutée.`);
      openRef('lot', { Operation: obj['Nom des opérations autorisées'] });
      return;
    }
    S.view = 'list'; render();
    toast(kind === 'lot' ? 'Lot ajouté.' : 'Entreprise ajoutée.');
  }

  /* ---------- Démarrage et suivi du tableau de bord ---------- */
  /* L'opération ou le mois du tableau de bord a changé (ou un collègue a modifié une table) : on relit. */
  async function refreshFromExcel() {
    const before = S.op + '|' + S.mois;
    try { await load(); } catch (e) { return; }
    const ctxChanged = before !== S.op + '|' + S.mois;
    const editing = S.form && Object.keys(S.form.changes()).length;
    if (editing) { if (ctxChanged) toast(`Le tableau de bord affiche maintenant ${S.op}, ${U.monthShort(S.mois)}.`); return; }
    if (ctxChanged) { S.form = null; S.view = 'list'; }
    if (ctxChanged || S.view === 'list') render();
  }
  const onDashboardChange = U.debounce(refreshFromExcel, 500);
  const onTableChange = U.debounce(() => { if (Date.now() - S.lastWrite > 3000) refreshFromExcel(); }, 800);

  Hepi.start = async function () {
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', async () => {
      if (!(await leave())) return;
      S.tab = t.dataset.tab; render();
    }));
    $('refresh').addEventListener('click', async () => { if (!(await leave())) return; await busy(load, 'Lecture'); render(); });
    const ok = await busy(async () => { await load(); return true; }, 'Lecture');
    if (!ok) return;
    render();
    X.watch([T.paiements, T.marches, T.entreprises], onDashboardChange, onTableChange).catch(e => console.warn(e));
  };
})();
