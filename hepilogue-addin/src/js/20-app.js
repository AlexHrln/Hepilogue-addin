/* Application : en-tête de contexte, onglets, éditeur générique, synchronisation avec la sélection Excel. */
(function () {
  const U = Hepi.U, S = Hepi.S, X = Hepi.X, UI = Hepi.UI, K = Hepi.K, C = Hepi.config;
  const h = UI.h;
  const V = Hepi.V;

  const A = Hepi.A = {
    tab: S.getPref('tab', 'saisie'),
    sub: { saisie: 'paiements', ref: 'lots', ctrl: 'anomalies' },
    stack: [],
    q: '',
    onlyIssues: false,
    busyCount: 0
  };
  const TABS = [
    { value: 'saisie', label: 'Saisie', view: () => V.saisie },
    { value: 'ref', label: 'Référentiel', view: () => V.referentiel },
    { value: 'ctrl', label: 'Contrôles', view: () => V.controles },
    { value: 'journal', label: 'Journal', view: () => V.journal }
  ];

  /* Exécute une opération sur le classeur avec indicateur d'attente et message d'erreur lisible. */
  A.run = async function (fn, label) {
    A.busyCount++; UI.busy(true, label || 'Enregistrement…');
    try { return await fn(); }
    catch (e) {
      console.error(e);
      UI.toast(X.friendlyError(e), { kind: 'err' });
      return null;
    } finally { A.busyCount--; if (!A.busyCount) UI.busy(false); }
  };

  A.ensureUser = async function () {
    if (S.getUser()) return S.getUser();
    const v = await UI.prompt('Vos initiales', 'Initiales ou nom court', '', {
      help: 'Elles accompagnent chaque modification dans le journal. Vous pourrez les changer dans le menu.',
      placeholder: 'ex. AH'
    });
    S.setUser((v || '').trim().slice(0, 30) || '?');
    renderHeader();
    return S.getUser();
  };

  /* ---------- Rendu ---------- */
  const $ = id => document.getElementById(id);

  function renderHeader() {
    const opSel = $('ctx-op'), moisSel = $('ctx-mois'), follow = $('ctx-follow');
    UI.clear(opSel);
    const ops = S.operations();
    if (S.ctx.op && !ops.includes(S.ctx.op)) ops.push(S.ctx.op);
    ops.forEach(o => opSel.appendChild(h('option', { value: o, text: o })));
    opSel.value = S.ctx.op || '';
    UI.clear(moisSel);
    moisSel.appendChild(h('option', { value: '*', text: 'Tous les mois' }));
    const months = S.monthsForOp(S.ctx.op);
    if (S.ctx.mois && S.ctx.mois !== '*' && !months.includes(S.ctx.mois)) months.unshift(S.ctx.mois);
    months.forEach(m => moisSel.appendChild(h('option', { value: m, text: U.monthShort(m) })));
    moisSel.value = S.ctx.mois || '*';
    UI.clear(follow).appendChild(UI.icon(S.ctx.follow ? 'link' : 'unlink'));
    follow.setAttribute('aria-pressed', S.ctx.follow ? 'true' : 'false');
    follow.title = S.ctx.follow
      ? 'Suit l’opération et le mois du tableau de bord. Cliquer pour choisir librement.'
      : 'Sélection indépendante du tableau de bord. Cliquer pour afficher cette opération et ce mois dans le tableau de bord.';
    follow.classList.toggle('on', S.ctx.follow);
  }

  function renderTabs() {
    const nav = $('tabs');
    UI.clear(nav);
    let errors = 0;
    try { errors = K.scan(S.ctx.op, S.ctx.mois).filter(x => K.worst(x.issues) === 'error').length; } catch (e) { /* données incomplètes */ }
    TABS.forEach(t => nav.appendChild(h('button', {
      type: 'button', role: 'tab', class: 'tab' + (A.tab === t.value ? ' on' : ''), 'aria-selected': A.tab === t.value ? 'true' : 'false',
      on: { click: () => A.go(t.value) }
    }, t.label, t.value === 'ctrl' && errors ? h('span', { class: 'badge badge-err', title: errors + ' ligne(s) à corriger', text: String(errors) }) : null)));
  }

  A.render = function () {
    renderHeader();
    renderTabs();
    const view = $('view');
    const scroll = view.scrollTop;
    UI.clear(view);
    if (A.stack.length) {
      const top = A.stack[A.stack.length - 1];
      top.render(view);
      if (top.keepScroll) { view.scrollTop = top.keepScroll; top.keepScroll = 0; }
    } else {
      const t = TABS.find(x => x.value === A.tab) || TABS[0];
      try { t.view()(view); } catch (e) { console.error(e); view.appendChild(UI.empty('Affichage impossible', String(e.message || e))); }
      if (A._keepScroll) { view.scrollTop = scroll; A._keepScroll = false; }
    }
  };

  A.go = async function (tab) {
    if (!await A.leaveOk()) return;
    A.stack = [];
    A.tab = tab; S.setPref('tab', tab);
    A.render();
    $('view').scrollTop = 0;
  };
  A.leaveOk = async function () {
    const dirty = A.stack.some(e => e.dirty && e.dirty());
    if (!dirty) return true;
    return UI.confirm('Abandonner les modifications ?', 'Des valeurs saisies n’ont pas été enregistrées.', { confirm: 'Abandonner', danger: true, cancel: 'Continuer la saisie' });
  };
  A.push = function (entry) { A.stack.push(entry); A.render(); $('view').scrollTop = 0; };
  A.pop = async function (force) {
    const top = A.stack[A.stack.length - 1];
    if (!force && top && top.dirty && top.dirty()) {
      if (!await UI.confirm('Abandonner les modifications ?', 'Des valeurs saisies n’ont pas été enregistrées.', { confirm: 'Abandonner', danger: true, cancel: 'Continuer la saisie' })) return;
    }
    A.stack.pop();
    A._keepScroll = !A.stack.length;
    A.render();
  };

  /* ---------- Éditeur générique d'un enregistrement ---------- */
  A.editor = async function (key, rec, opts) {
    opts = opts || {};
    if (opts.replace) { if (!await A.leaveOk()) return; A.stack.pop(); }
    const cfg = C.tables[key];
    const hooks = V.hooks[key] || {};
    let current = rec;
    let form = null;
    const entry = {
      key,
      dirty: () => !!form && form.dirty(),
      render(box) {
        const isNew = !current;
        const actionsBtn = UI.iconBtn('more', 'Autres actions', ev => UI.menu(ev.currentTarget, menuItems()));
        box.appendChild(h('div', { class: 'detail-top' },
          UI.iconBtn('back', 'Retour à la liste', () => A.pop()),
          h('div', { class: 'detail-title' }, h('span', { class: 'detail-kicker', text: (isNew ? 'Nouvelle ligne — ' : '') + cfg.label }), h('span', { class: 'detail-name', text: hooks.title ? hooks.title(current) : cfg.label })),
          isNew ? null : actionsBtn));
        if (!S.has(key) && !cfg.create) { box.appendChild(UI.empty('Table introuvable', `La table ${cfg.name} n’existe pas dans ce classeur.`)); return; }
        if (!isNew && hooks.cartouche) box.appendChild(hooks.cartouche(current));
        const status = h('span', { class: 'foot-status' });
        const saveBtn = UI.btn(isNew ? 'Créer la ligne' : 'Enregistrer', save, 'primary');
        const resetBtn = UI.btn('Rétablir', () => { form = null; entry.keepScroll = $('view').scrollTop; A.render(); }, 'ghost');
        const updateFoot = () => {
          const n = Object.keys(form.changes()).length;
          const errs = form.issues.filter(i => i.level === 'error').length;
          status.textContent = isNew ? (errs ? `${errs} point${errs > 1 ? 's' : ''} bloquant${errs > 1 ? 's' : ''}` : '') :
            (n ? `${n} modification${n > 1 ? 's' : ''}` : 'Aucune modification');
          saveBtn.disabled = !isNew && n === 0;
          resetBtn.hidden = isNew || n === 0;
        };
        form = new UI.Form({
          key, record: current, initial: opts.initial, layout: cfg.layout,
          check: v => hooks.check ? hooks.check(v) : [],
          onChange: (f, hd) => { if (hooks.onChange) hooks.onChange(f, hd, isNew); updateFoot(); }
        });
        box.appendChild(form.el);
        if (!isNew && hooks.after) hooks.after(current, box, form);
        if (!isNew) {
          const calcHs = (cfg.computedShown || []).filter(x => S.isCalc(key, x));
          if (calcHs.length) {
            box.appendChild(h('details', { class: 'computed' }, h('summary', { text: 'Valeurs calculées par le classeur' }),
              h('dl', { class: 'kv' }, calcHs.map(x => [h('dt', { text: x }), h('dd', { class: typeof current[x] === 'number' ? 'num' : '', text: U.isBlank(current[x]) ? '—' : (typeof current[x] === 'number' ? U.fmtCoef(current[x]) : String(current[x])) })]))));
          }
          const hist = S.historyFor(key, current);
          if (hist.length) {
            box.appendChild(h('details', { class: 'computed' }, h('summary', { text: `Historique (${hist.length})` }),
              h('ul', { class: 'hist' }, hist.slice(0, 15).map(j => h('li', {},
                h('span', { class: 'hist-when', text: `${U.fmtDate(j.Horodatage)} ${V.timeOf(j.Horodatage)}${j.Utilisateur ? ', ' + j.Utilisateur : ''}` }),
                h('span', { text: j.Action === 'Modification' ? `${j.Champ} : ${j['Ancienne valeur'] || '(vide)'} → ${j['Nouvelle valeur'] || '(vide)'}` : j.Action }))))));
          }
        }
        box.appendChild(h('div', { class: 'foot' }, status, resetBtn, saveBtn));
        updateFoot();
      }
    };

    function menuItems() {
      const extra = hooks.actions ? hooks.actions(current).filter(Boolean) : [];
      return extra.concat([
        { label: 'Afficher la ligne dans Excel', icon: 'go', run: () => A.run(() => X.goToRow(cfg.name, current._i), 'Sélection…') },
        { sep: true },
        { label: 'Supprimer la ligne', icon: 'trash', danger: true, run: remove }
      ]);
    }

    async function save() {
      const isNew = !current;
      form.refresh();
      const pe = form.parseErrors();
      if (pe.length) { UI.toast('Valeur invalide — ' + pe[0], { kind: 'err' }); return; }
      const miss = form.missing();
      if (miss.length) { UI.toast('À renseigner : ' + miss.join(', '), { kind: 'err' }); return; }
      const changes = form.changes();
      if (!isNew && !Object.keys(changes).length) return;
      const blocking = form.issues.filter(i => i.level === 'error');
      if (blocking.length) {
        const go = await UI.confirm('Enregistrer malgré les erreurs ?', h('ul', { class: 'plain' }, blocking.map(b => h('li', { text: b.msg }))), { confirm: 'Enregistrer quand même' });
        if (!go) return;
      }
      let step = {};
      if (hooks.beforeSave) { step = await hooks.beforeSave(form, current); if (step === false) return; }
      await A.ensureUser();
      const res = await A.run(async () => {
        if (isNew) {
          const obj = Object.assign({}, changes);
          for (const hd in C.tables[key].fields) if (C.tables[key].fields[hd].type === 'bool' && !(hd in obj) && S.has(key) && S.data[key].idx[hd] !== undefined) obj[hd] = false;
          return S.create(key, obj);
        }
        let r = await S.save(key, current, changes);
        if (r.status === 'conflict') {
          const keep = await conflictDialog(r.conflicts, key);
          if (!keep) { await S.load(); return { status: 'reloaded' }; }
          r = await S.save(key, current, changes, { force: true });
        }
        return r;
      });
      if (!res) return;
      if (res.status === 'notfound') {
        await UI.modal({ title: 'Ligne introuvable', body: 'Cette ligne a été supprimée ou profondément modifiée par quelqu’un d’autre depuis son ouverture. La liste va être rechargée.' });
        await A.run(() => S.load(), 'Lecture du classeur…');
        A.stack.pop(); A.render(); return;
      }
      if (res.status === 'reloaded') {
        const fresh = S.findLike(key, pickKey(key, current), current._i);
        current = fresh || current; form = null; A.render();
        UI.toast('Ligne rechargée avec les valeurs du classeur.', { kind: 'warn' });
        return;
      }
      if (step && step.after) await A.run(async () => { await step.after(); await S.load(); }, 'Report du nouveau libellé…');
      current = res.record ? S.findLike(key, pickInputs(key, res.record), res.record._i) || res.record : current;
      form = null;
      entry.keepScroll = $('view').scrollTop;
      A.render();
      const undo = S.undoAction;
      UI.toast(isNew ? 'Ligne créée.' : (res.merged ? 'Enregistré (fusionné avec une modification d’un autre utilisateur).' : 'Modifications enregistrées.'), {
        action: undo ? { label: 'Annuler', run: async () => { S.undoAction = null; const ok = await A.run(undo.run, 'Annulation…'); if (ok !== null) { await A.afterUndo(key, current); UI.toast(undo.label + '.'); } } } : null
      });
    }

    async function remove() {
      const uses = hooks.usage ? hooks.usage(current) : [];
      const body = h('div', {}, h('p', { text: S.keyString(key, current) }),
        uses.length ? h('div', {}, h('p', { class: 'lv-text-warn', text: 'Ce libellé est encore utilisé :' }), h('ul', { class: 'plain' }, uses.map(u => h('li', { text: `${u.label} : ${u.count}` })))) : null,
        h('p', { class: 'help', text: 'La ligne complète est conservée dans le journal et peut y être restaurée.' }));
      if (!await UI.confirm('Supprimer cette ligne ?', body, { confirm: 'Supprimer', danger: true })) return;
      await A.ensureUser();
      const res = await A.run(() => S.remove(key, current), 'Suppression…');
      if (!res) return;
      if (res.status !== 'ok') { UI.toast('La ligne a changé depuis son ouverture : rechargez avant de la supprimer.', { kind: 'warn' }); return; }
      A.stack.pop(); A.render();
      const undo = S.undoAction;
      UI.toast('Ligne supprimée.', { action: undo ? { label: 'Annuler', run: async () => { S.undoAction = null; await A.run(undo.run, 'Restauration…'); A.render(); } } : null });
    }

    A.push(entry);
    entry._setRecord = r => { current = r; form = null; };
  };

  function pickInputs(key, rec) { const o = {}; S.inputHeaders(key).forEach(hd => { if (hd in rec) o[hd] = rec[hd]; }); return o; }
  function pickKey(key, rec) { const o = {}; (C.tables[key].key || []).forEach(hd => { o[hd] = rec._base ? rec._base[hd] : rec[hd]; }); return o; }

  A.afterUndo = async function (key, rec) {
    const top = A.stack[A.stack.length - 1];
    if (top && top.key === key && top._setRecord && rec) {
      const fresh = S.findLike(key, pickKey(key, rec), rec._i);
      if (fresh) top._setRecord(fresh); else A.stack.pop();
    }
    A.render();
  };

  async function conflictDialog(conflicts, key) {
    const body = h('div', {},
      h('p', { text: 'Quelqu’un a modifié cette ligne pendant votre saisie :' }),
      h('ul', { class: 'plain' }, conflicts.map(c => {
        const t = S.fieldDef(key, c.h).type;
        return h('li', { text: `${S.fieldDef(key, c.h).label} : sa valeur ${U.display(c.theirs, t) || '(vide)'}, la vôtre ${U.display(c.mine, t) || '(vide)'}` });
      })));
    return UI.modal({
      title: 'Modification simultanée', body, dismissValue: false,
      actions: [{ label: 'Garder sa version', value: false, kind: 'ghost' }, { label: 'Garder ma saisie', value: true, kind: 'primary' }]
    });
  }

  /* ---------- Contexte (opération / mois) ---------- */
  function bindHeader() {
    $('ctx-op').addEventListener('change', async e => {
      if (!await A.leaveOk()) { renderHeader(); return; }
      A.stack = [];
      S.ctx.op = e.target.value; S.ctx.follow = false;
      const months = S.monthsForOp(S.ctx.op);
      if (S.ctx.mois !== '*' && !months.includes(S.ctx.mois)) S.ctx.mois = months[0] || '*';
      A.render();
    });
    $('ctx-mois').addEventListener('change', async e => {
      if (!await A.leaveOk()) { renderHeader(); return; }
      A.stack = [];
      S.ctx.mois = e.target.value; S.ctx.follow = false;
      A.render();
    });
    $('ctx-follow').addEventListener('click', async () => {
      if (S.ctx.follow) { S.ctx.follow = false; renderHeader(); UI.toast('Le panneau ne suit plus le tableau de bord.'); return; }
      const ok = await A.run(async () => { await S.pushCtxToDashboard(); S.ctx.follow = true; await S.load(); return true; }, 'Mise à jour du tableau de bord…');
      if (ok) { A.render(); UI.toast('Tableau de bord positionné sur ' + S.ctx.op + (S.ctx.mois !== '*' ? ', ' + U.monthShort(S.ctx.mois) : '') + '.'); }
    });
    $('btn-refresh').addEventListener('click', () => A.reload());
    $('btn-menu').addEventListener('click', e => UI.menu(e.currentTarget, settingsMenu()));
  }

  function settingsMenu() {
    const autoshow = X.getSetting('Office.AutoShowTaskpaneWithDocument') === true;
    const autoOpen = S.getPref('autoOpen', false);
    return [
      { label: 'Initiales : ' + (S.getUser() || 'non renseignées'), icon: 'user', run: async () => {
        const v = await UI.prompt('Vos initiales', 'Initiales ou nom court', S.getUser(), { help: 'Utilisées dans le journal des modifications.' });
        if (v !== null) { S.setUser(v.slice(0, 30)); UI.toast('Initiales enregistrées.'); }
      } },
      { label: autoshow ? 'Ne plus ouvrir le panneau avec ce classeur' : 'Ouvrir le panneau à l’ouverture du classeur', icon: 'check', run: async () => {
        await A.run(() => X.setSetting('Office.AutoShowTaskpaneWithDocument', autoshow ? null : true));
        UI.toast(autoshow ? 'Le panneau ne s’ouvrira plus automatiquement.' : 'Le panneau s’ouvrira avec ce classeur, pour chaque utilisateur qui dispose du complément.');
      } },
      { label: autoOpen ? 'Ne plus ouvrir la ligne sélectionnée' : 'Ouvrir directement la ligne sélectionnée', icon: 'pen', run: () => {
        S.setPref('autoOpen', !autoOpen);
        UI.toast(!autoOpen ? 'Une ligne sélectionnée dans une table s’ouvrira directement dans le panneau.' : 'Un bandeau proposera la ligne sélectionnée.');
      } },
      { sep: true },
      { label: 'Version ' + Hepi.VERSION, icon: 'info', run: () => UI.modal({ title: 'Hépilogue — Saisie', body: h('div', {},
        h('p', { text: 'Version ' + Hepi.VERSION + '. Panneau de saisie et de contrôle des tables du suivi des situations.' }),
        h('p', { class: 'help', text: 'Les colonnes calculées ne sont jamais modifiées. Chaque écriture est tracée dans la feuille masquée « ' + C.tables.journal.sheet + ' ».' })) }) }
    ];
  }

  /* ---------- Rechargement ---------- */
  A.reload = async function (silent) {
    const top = A.stack[A.stack.length - 1];
    const res = await A.run(() => S.load(), silent ? 'Actualisation…' : 'Lecture du classeur…');
    if (!res) return;
    if (top && top.key && top._setRecord && !(top.dirty && top.dirty())) {
      // L'enregistrement affiché est relu
      top.keepScroll = $('view').scrollTop;
    }
    A.render();
  };

  /* ---------- Sélection Excel -> panneau ---------- */
  const setBanner = function (content) {
    const b = $('banner');
    UI.clear(b);
    if (!content) { b.hidden = true; return; }
    b.hidden = false;
    b.appendChild(content);
  };

  const onSelection = U.debounce(async function () {
    let cell;
    try { cell = await X.activeCell(); } catch (e) { return; }
    try {
      const dcfg = C.dashboard;
      if (cell.sheet === dcfg.sheet) return dashboardSelection(cell);
      const key = Object.keys(S.data).find(k => S.data[k] && S.data[k].sheet === cell.sheet && ['paiements', 'avancement', 'marches', 'entreprises'].includes(k));
      if (!key) return setBanner(null);
      const a = X.parseAddress(S.data[key].bodyAddress);
      if (!a || cell.row < a.r1 || cell.row > a.r2 || cell.col < a.c1 || cell.col > a.c2) return setBanner(null);
      const rec = S.records(key).find(r => r._i === cell.row - a.r1);
      if (!rec) return setBanner(null);
      const label = V.hooks[key] && V.hooks[key].title ? V.hooks[key].title(rec) : S.keyString(key, rec);
      if (S.getPref('autoOpen', false) && !A.stack.some(e => e.dirty && e.dirty())) { A.stack = []; A.editor(key, rec); setBanner(null); return; }
      setBanner(h('div', { class: 'banner-in' },
        h('div', { class: 'banner-text' }, h('span', { class: 'banner-k', text: 'Ligne sélectionnée' }), h('span', { class: 'banner-v', text: label })),
        UI.btn('Modifier', async () => { if (!await A.leaveOk()) return; A.stack = []; setBanner(null); A.editor(key, rec); }, 'small primary', 'pen'),
        UI.iconBtn('x', 'Masquer', () => setBanner(null))));
    } catch (e) { console.warn(e); }
  }, 280);

  async function dashboardSelection(cell) {
    // Le tableau de bord a peut-être changé d'opération ou de mois : on le relit.
    const prev = S.dash ? [S.dash.op, S.dash.mois].join('|') : '';
    try {
      const res = await X.readDashCtx();
      const cur = [res.op, res.mois].join('|');
      if (cur !== prev) {
        await S.load();
        if (S.ctx.follow && !A.stack.some(e => e.dirty && e.dirty())) { A.stack = []; A.render(); }
        else renderHeader();
      }
    } catch (e) { /* lecture impossible pendant une saisie */ }
    const d = S.dash;
    if (!d || !d.exists) return setBanner(null);
    const excelRow = cell.row + 1;
    const colMax = Math.max(d.col.commentaire, d.col.netValide, d.col.netDeclareMois);
    if (cell.col <= colMax) {
      const m = d.months.find(x => x.row === excelRow);
      if (!m) return setBanner(null);
      return setBanner(h('div', { class: 'banner-in' },
        h('div', { class: 'banner-text' }, h('span', { class: 'banner-k', text: 'Tableau de bord' }), h('span', { class: 'banner-v', text: U.monthShort(m.mois) })),
        UI.btn('Paiements', async () => { if (!await A.leaveOk()) return; S.ctx.op = String(d.op); S.ctx.mois = m.mois; S.ctx.follow = U.same(m.mois, d.mois); A.stack = []; A.tab = 'saisie'; A.sub.saisie = 'paiements'; A.render(); }, 'small'),
        UI.btn('Valider', async () => { if (!await A.leaveOk()) return; S.ctx.op = String(d.op); S.ctx.mois = m.mois; S.ctx.follow = U.same(m.mois, d.mois); A.stack = []; A.tab = 'ctrl'; A.sub.ctrl = 'validation'; A.render(); }, 'small primary'),
        UI.iconBtn('x', 'Masquer', () => setBanner(null))));
    }
    const p = d.pairs.find(x => x.row === excelRow);
    if (!p) {
      const s = (d.sts || []).find(x => x.row === excelRow);
      if (!s) return setBanner(null);
      const recST = S.records('paiements').find(r => r.type_entreprise === 'Sous-traitant' && U.same(r['Opération'], d.op) && U.same(r.Mois, d.mois) && U.same(r.entreprise, s.entreprise));
      return setBanner(h('div', { class: 'banner-in' },
        h('div', { class: 'banner-text' }, h('span', { class: 'banner-k', text: U.monthShort(d.mois) + ', sous-traitant' }), h('span', { class: 'banner-v', text: `${s.entreprise} (${s.mandataire})` })),
        recST ? UI.btn('Modifier', async () => { if (!await A.leaveOk()) return; A.stack = []; setBanner(null); A.tab = 'saisie'; A.editor('paiements', recST); }, 'small primary', 'pen')
          : UI.btn('Saisir le paiement', async () => {
            if (!await A.leaveOk()) return;
            A.stack = []; setBanner(null); A.tab = 'saisie';
            const ref = S.stRef(d.op, s.entreprise);
            const mand = S.records('entreprises').find(r => U.same(r.Operation, d.op) && r.Type === 'Mandataire' && U.same(r.Entreprise, s.mandataire));
            A.editor('paiements', null, { initial: V.defaults('paiements', { 'Opération': d.op, entreprise: s.entreprise, mandataire: s.mandataire, lot: mand ? mand.Denomination_Lot : '', type_entreprise: 'Sous-traitant', autoliquidation: !!(ref && String(ref['Autoliquidation (OUI/NON)']).toUpperCase() === 'OUI') }) });
          }, 'small', 'plus'),
        UI.iconBtn('x', 'Masquer', () => setBanner(null))));
    }
    const rec = S.records('paiements').find(r => r.type_entreprise === 'Mandataire' && U.same(r['Opération'], d.op) && U.same(r.Mois, d.mois) && U.same(r.entreprise, p.entreprise) && U.same(r.lot, p.lot));
    setBanner(h('div', { class: 'banner-in' },
      h('div', { class: 'banner-text' }, h('span', { class: 'banner-k', text: U.monthShort(d.mois) }), h('span', { class: 'banner-v', text: `${p.entreprise}, ${p.lot}` })),
      rec ? UI.btn('Modifier', async () => { if (!await A.leaveOk()) return; A.stack = []; setBanner(null); A.tab = 'saisie'; A.sub.saisie = 'paiements'; A.editor('paiements', rec); }, 'small primary', 'pen')
        : UI.btn('Saisir le paiement', async () => {
          if (!await A.leaveOk()) return;
          A.stack = []; setBanner(null); A.tab = 'saisie';
          const ref = S.stRef(d.op, p.entreprise, p.lot);
          A.editor('paiements', null, { initial: V.defaults('paiements', { 'Opération': d.op, entreprise: p.entreprise, mandataire: p.entreprise, lot: p.lot, type_entreprise: 'Mandataire', autoliquidation: !!(ref && String(ref['Autoliquidation (OUI/NON)']).toUpperCase() === 'OUI') }) });
        }, 'small', 'plus'),
      UI.iconBtn('x', 'Masquer', () => setBanner(null))));
  }

  /* Modifications du classeur par d'autres (co-édition, extraction automatique). */
  const onTablesChanged = U.debounce(async function () {
    if (Date.now() - S.lastOwnWrite < 4000) return;
    if (A.stack.some(e => e.dirty && e.dirty())) { $('stale').hidden = false; return; }
    if (A.busyCount) return;
    await S.load().catch(() => null);
    A._keepScroll = true;
    A.render();
  }, 1500);

  /* ---------- Démarrage ---------- */
  A.start = async function () {
    bindHeader();
    $('stale-reload').addEventListener('click', () => { $('stale').hidden = true; A.reload(); });
    S.on('warn', m => UI.toast(m, { kind: 'warn' }));
    if (typeof Office !== 'undefined' && Office.context && Office.context.requirements && !Office.context.requirements.isSetSupported('ExcelApi', '1.7')) {
      UI.clear($('view')).appendChild(UI.empty('Version d’Excel trop ancienne', 'Ce panneau nécessite Excel pour Microsoft 365 (Mac, Windows ou web).'));
      return;
    }
    const ok = await A.run(() => S.load(), 'Lecture du classeur…');
    if (!ok) {
      UI.clear($('view')).appendChild(UI.empty('Le classeur n’a pas pu être lu.', 'Vérifiez que le fichier ouvert est bien le suivi des situations, puis réessayez.', UI.btn('Réessayer', () => A.start(), 'primary small')));
      return;
    }
    const missing = ['paiements', 'avancement', 'marches', 'entreprises'].filter(k => !S.has(k));
    if (missing.length === 4) {
      UI.clear($('view')).appendChild(UI.empty('Ce classeur n’est pas un suivi des situations.', 'Les tables BDD_Paiements, BDD_Avancement, BDD_Marches et BDD_ST sont introuvables.'));
      return;
    }
    A.render();
    X.onSelection(onSelection).catch(e => console.warn('Sélection non suivie', e));
    X.onTablesChanged(['paiements', 'avancement', 'marches', 'entreprises', 'indices'].map(k => C.tables[k].name), onTablesChanged).catch(e => console.warn('Modifications non suivies', e));
  };
})();
