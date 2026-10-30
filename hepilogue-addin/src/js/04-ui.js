/* Interface : construction du DOM, fenêtres, notifications, formulaires. */
(function () {
  const U = Hepi.U;
  const UI = {};

  UI.h = function (tag, props) {
    const el = document.createElement(tag);
    const p = props || {};
    for (const k in p) {
      const v = p[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
      else if (k === 'style') el.setAttribute('style', v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) UI.append(el, arguments[i]);
    return el;
  };
  UI.append = function (el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(x => UI.append(el, x));
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  };
  UI.clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  const h = UI.h;

  const ICONS = {
    back: '<path d="M10 3 5 8l5 5" />',
    refresh: '<path d="M13 3v3.5H9.5" /><path d="M12.6 6.4A5 5 0 1 0 13 9" />',
    more: '<circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
    link: '<path d="M6.5 9.5 9.5 6.5" /><path d="M7.5 4.5 8.6 3.4a2.5 2.5 0 0 1 3.5 3.5L11 8" /><path d="M8.5 11.5 7.4 12.6a2.5 2.5 0 0 1-3.5-3.5L5 8" />',
    unlink: '<path d="M7.5 4.5 8.6 3.4a2.5 2.5 0 0 1 3.5 3.5L11 8" /><path d="M8.5 11.5 7.4 12.6a2.5 2.5 0 0 1-3.5-3.5L5 8" /><path d="M2.5 2.5l11 11" />',
    plus: '<path d="M8 3v10M3 8h10" />',
    search: '<circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" />',
    x: '<path d="m4 4 8 8M12 4l-8 8" />',
    go: '<path d="M6 3h7v7" /><path d="M13 3 6 10" /><path d="M10 13H3V6" />',
    copy: '<rect x="5.5" y="5.5" width="7" height="7" rx="1" /><path d="M3.5 10.5v-7h7" />',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />',
    check: '<path d="m3.5 8.5 3 3 6-7" />',
    warn: '<path d="M8 2.5 14 13H2L8 2.5Z" /><path d="M8 6.5v3M8 11.2v.3" />',
    info: '<circle cx="8" cy="8" r="5.5" /><path d="M8 7.2V11M8 5v.3" />',
    pen: '<path d="M3 13l1-3.5 6.5-6.5 2.5 2.5L6.5 12 3 13Z" />',
    user: '<circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c.6-2.5 2.6-4 5-4s4.4 1.5 5 4" />'
  };
  UI.icon = function (name, cls) {
    const span = document.createElement('span');
    span.className = 'ico' + (cls ? ' ' + cls : '');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    return span;
  };
  UI.iconBtn = function (name, label, onClick, cls) {
    return h('button', { class: 'icon-btn' + (cls ? ' ' + cls : ''), type: 'button', title: label, 'aria-label': label, on: { click: onClick } }, UI.icon(name));
  };
  UI.btn = function (label, onClick, kind, iconName) {
    return h('button', { class: 'btn ' + (kind || ''), type: 'button', on: { click: onClick } }, iconName ? UI.icon(iconName) : null, h('span', { text: label }));
  };

  /* ---------- Fenêtre modale (les alert/confirm natifs ne fonctionnent pas dans un complément) ---------- */
  UI.modal = function (o) {
    return new Promise(resolve => {
      const root = document.getElementById('modal-root');
      const prevFocus = document.activeElement;
      let done = false;
      const close = v => {
        if (done) return; done = true;
        root.removeChild(back); document.removeEventListener('keydown', onKey);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(v);
      };
      const onKey = e => { if (e.key === 'Escape') close(o.dismissValue === undefined ? null : o.dismissValue); };
      const body = typeof o.body === 'string' ? h('p', { text: o.body }) : o.body;
      const actions = h('div', { class: 'modal-actions' }, (o.actions || [{ label: 'OK', value: true, kind: 'primary' }]).map(a =>
        h('button', { class: 'btn ' + (a.kind || ''), type: 'button', on: { click: () => close(typeof a.value === 'function' ? a.value() : a.value) } }, a.label)
      ));
      const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
        h('h2', { class: 'modal-title', text: o.title }), h('div', { class: 'modal-body' }, body), actions);
      const back = h('div', { class: 'modal-back', on: { mousedown: e => { if (e.target === back) close(o.dismissValue === undefined ? null : o.dismissValue); } } }, box);
      root.appendChild(back);
      document.addEventListener('keydown', onKey);
      const first = box.querySelector('input, select, textarea') || actions.querySelector('.primary, .danger') || actions.lastChild;
      setTimeout(() => first && first.focus(), 30);
    });
  };
  UI.confirm = (title, text, opt) => {
    opt = opt || {};
    return UI.modal({
      title, body: text, dismissValue: false,
      actions: [{ label: opt.cancel || 'Annuler', value: false, kind: 'ghost' }, { label: opt.confirm || 'Confirmer', value: true, kind: opt.danger ? 'danger' : 'primary' }]
    });
  };
  UI.prompt = (title, label, initial, opt) => {
    opt = opt || {};
    const input = h('input', { class: 'inp', type: 'text', value: initial || '', 'aria-label': label, placeholder: opt.placeholder || '' });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('.modal-actions .primary').click(); });
    const box = h('div', {}, h('label', { class: 'fld-label', text: label }), input, opt.help ? h('p', { class: 'help', text: opt.help }) : null);
    return UI.modal({
      title, body: box, dismissValue: null,
      actions: [{ label: 'Annuler', value: null, kind: 'ghost' }, { label: opt.confirm || 'Valider', value: () => input.value.trim(), kind: 'primary' }]
    });
  };

  /* ---------- Notifications ---------- */
  UI.toast = function (msg, o) {
    o = o || {};
    const root = document.getElementById('toast-root');
    const el = h('div', { class: 'toast ' + (o.kind || ''), role: 'status' },
      UI.icon(o.kind === 'err' ? 'warn' : (o.kind === 'warn' ? 'warn' : 'check')),
      h('span', { class: 'toast-msg', text: msg }));
    let timer;
    const close = () => { clearTimeout(timer); if (el.parentNode) el.parentNode.removeChild(el); };
    if (o.action) {
      el.appendChild(h('button', { class: 'toast-act', type: 'button', on: { click: async () => { close(); await o.action.run(); } } }, o.action.label));
    }
    el.appendChild(h('button', { class: 'toast-x', type: 'button', 'aria-label': 'Fermer', on: { click: close } }, UI.icon('x')));
    UI.clear(root).appendChild(el);
    timer = setTimeout(close, o.timeout || (o.kind === 'err' ? 12000 : 7000));
    return close;
  };

  /* ---------- Menu contextuel ---------- */
  UI.menu = function (anchor, items) {
    const root = document.getElementById('modal-root');
    const r = anchor.getBoundingClientRect();
    const close = () => { if (back.parentNode) root.removeChild(back); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const list = h('div', { class: 'menu', role: 'menu' }, items.filter(Boolean).map(it => it.sep ? h('div', { class: 'menu-sep' }) :
      h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', disabled: !!it.disabled, on: { click: () => { close(); it.run(); } } },
        it.icon ? UI.icon(it.icon) : h('span', { class: 'ico' }), h('span', { text: it.label }))));
    const back = h('div', { class: 'menu-back', on: { mousedown: e => { if (e.target === back) close(); } } }, list);
    root.appendChild(back);
    const w = 230;
    list.style.top = Math.min(r.bottom + 4, window.innerHeight - 20 - items.length * 34) + 'px';
    list.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    document.addEventListener('keydown', onKey);
    const f = list.querySelector('.menu-item:not([disabled])'); if (f) f.focus();
  };

  UI.busy = function (on, label) {
    const el = document.getElementById('busy');
    if (!el) return;
    el.hidden = !on;
    el.querySelector('span').textContent = label || 'Lecture du classeur…';
  };

  /* ---------- Formulaire générique ---------- */
  let uid = 0;
  const nextId = () => 'f' + (++uid);

  function FieldCtl(form, h0, def, compact) {
    this.form = form; this.h = h0; this.type = def.type || 'text';
    this.def = (this.type === 'month' && !def.options) ? Object.assign({}, def, { options: 'months' }) : def;
    def = this.def;
    this.error = '';
    const id = nextId();
    let input;
    const self = this;
    const onInput = () => self.read(false);
    const onBlur = () => self.read(true);
    switch (this.type) {
      case 'bool':
        input = h('input', { type: 'checkbox', id, class: 'chk', on: { change: onBlur } });
        break;
      case 'date':
        input = h('input', { type: 'date', id, class: 'inp', on: { change: onBlur, blur: onBlur } });
        break;
      case 'select':
      case 'month':
        input = h('select', { id, class: 'inp', on: { change: onBlur } });
        break;
      case 'textarea':
        input = h('textarea', { id, class: 'inp', rows: 3, on: { input: onInput, blur: onBlur } });
        break;
      case 'money': case 'coef': case 'int':
        input = h('input', { type: 'text', id, class: 'inp num', inputmode: this.type === 'int' ? 'numeric' : 'decimal', autocomplete: 'off', on: { input: onInput, blur: onBlur, keydown: e => { if (e.key === 'Enter') { e.preventDefault(); onBlur(); } } } });
        break;
      default: {
        input = h('input', { type: 'text', id, class: 'inp', autocomplete: 'off', on: { input: onInput, blur: onBlur } });
        if (def.options) { const dl = h('datalist', { id: id + 'l' }); input.setAttribute('list', id + 'l'); this.datalist = dl; }
      }
    }
    this.input = input;
    this.msg = h('div', { class: 'fld-msg' });
    if (compact) {
      this.el = h('div', { class: 'cell' }, input);
      input.setAttribute('aria-label', def.label);
    } else if (this.type === 'bool') {
      this.el = h('div', { class: 'fld fld-bool' }, h('label', { class: 'switch', for: id }, input, h('span', { class: 'switch-ui' }), h('span', { class: 'switch-label', text: def.label })), this.msg);
    } else {
      this.fx = h('span', { class: 'fx', hidden: true, text: 'ƒ' });
      this.el = h('div', { class: 'fld' + (this.type === 'money' || this.type === 'coef' || this.type === 'int' ? ' fld-num' : '') },
        h('label', { class: 'fld-label', for: id }, def.label, def.required ? h('span', { class: 'req', title: 'Obligatoire', text: ' *' }) : null, this.fx),
        input, this.datalist || null, def.help ? h('div', { class: 'help', text: def.help }) : null, this.msg);
    }
  }
  FieldCtl.prototype.fillOptions = function () {
    const d = this.def;
    if (!d.options) return;
    const opts = Array.isArray(d.options) ? d.options : Hepi.S.list(d.options, this.form.values);
    const cur = this.form.values[this.h];
    if (this.datalist) {
      UI.clear(this.datalist);
      opts.forEach(o => this.datalist.appendChild(h('option', { value: o })));
      return;
    }
    UI.clear(this.input);
    const all = opts.slice();
    if (!all.includes('')) all.unshift('');
    if (!U.isBlank(cur) && !all.some(o => U.same(o, cur))) all.push(String(cur));
    all.forEach(o => this.input.appendChild(h('option', { value: o, text: o === '' ? '—' : (opts.some(x => U.same(x, o)) || o === '' ? o : o + ' (hors liste)') })));
  };
  FieldCtl.prototype.show = function (v) {
    const t = this.type, inp = this.input;
    if (t === 'select' || t === 'month') { this.fillOptions(); inp.value = U.isBlank(v) ? '' : String(v); return; }
    if (this.datalist) this.fillOptions();
    if (t === 'bool') { inp.checked = v === true || String(v).toUpperCase() === 'TRUE' || String(v).toUpperCase() === 'VRAI'; return; }
    if (t === 'date') { inp.value = U.serialToISO(v); return; }
    if (t === 'money' || t === 'coef') inp.classList.toggle('zero', v === 0);
    if (t === 'money') { inp.value = typeof v === 'number' ? U.fmtMoney(v) : (U.isBlank(v) ? '' : String(v)); return; }
    if (t === 'coef') { inp.value = typeof v === 'number' ? U.fmtCoef(v) : (U.isBlank(v) ? '' : String(v)); return; }
    inp.value = U.isBlank(v) ? '' : String(v);
  };
  /* Lit la saisie, la convertit dans le type de la colonne et prévient le formulaire. */
  FieldCtl.prototype.read = function (final) {
    const t = this.type, inp = this.input;
    let v, err = '';
    if (t === 'bool') v = inp.checked;
    else if (t === 'date') v = inp.value ? U.isoToSerial(inp.value) : '';
    else if (t === 'money' || t === 'coef' || t === 'int') {
      const p = U.parseNumber(inp.value);
      if (!p.ok) { err = p.error; v = this.form.values[this.h]; }
      else {
        v = p.value;
        if (v !== '' && t === 'money') v = U.round2(v);
        inp.classList.toggle('zero', v === 0);
        if (v !== '' && t === 'int' && !Number.isInteger(v)) err = 'Nombre entier attendu';
        if (final && v !== '' && !err) this.show(v);
      }
    } else v = inp.value;
    if (typeof v === 'string' && t !== 'textarea') v = final ? v.trim() : v;
    this.error = err;
    this.form.set(this.h, v, { final, fromCtl: this });
  };
  FieldCtl.prototype.setState = function (st) {
    const box = this.el;
    box.classList.toggle('is-changed', !!st.changed);
    box.classList.toggle('is-err', !!(st.error || this.error));
    box.classList.toggle('is-warn', !st.error && !this.error && !!st.warn);
    const msg = this.error || st.error || st.warn || '';
    if (this.msg) this.msg.textContent = this.el.classList.contains('cell') ? '' : msg;
    const titleParts = [];
    if (st.changed) titleParts.push('Valeur d’origine : ' + (st.orig === '' ? '(vide)' : st.orig));
    if (msg) titleParts.push(msg);
    this.input.title = titleParts.join('\n');
    if (this.fx) {
      this.fx.hidden = !st.formula;
      this.fx.title = st.formula ? `Cellule contenant une formule : ${st.formula}\nUne nouvelle saisie la remplacera par une valeur.` : '';
    }
  };

  /* opts : { key, record, initial, layout, check(values, form) -> [{level,msg,fields}], onChange() } */
  function Form(opts) {
    this.key = opts.key;
    this.rec = opts.record || null;
    this.isNew = !this.rec;
    this.base = this.rec ? Object.assign({}, this.rec._base) : {};
    this.values = Object.assign({}, this.rec || {}, opts.initial || {});
    this.ctl = {};
    this.opts = opts;
    this.issues = [];
    this.el = h('div', { class: 'form' });
    this.alerts = h('div', { class: 'alerts', 'aria-live': 'polite' });
    this.el.appendChild(this.alerts);
    this.build(opts.layout);
    this.refresh();
  }
  Form.prototype.def = function (hd) { return Hepi.S.fieldDef(this.key, hd); };
  Form.prototype.field = function (hd, compact) {
    if (Hepi.S.has(this.key) && Hepi.S.data[this.key].idx[hd] === undefined) return null;
    if (Hepi.S.isCalc(this.key, hd)) return null;
    const c = new FieldCtl(this, hd, this.def(hd), compact);
    this.ctl[hd] = c;
    c.show(this.values[hd]);
    return c;
  };
  Form.prototype.build = function (layout) {
    const used = new Set();
    (layout || []).forEach(sec => {
      const secEl = h('section', { class: 'sec' }, h('h3', { class: 'sec-title', text: sec.title }), sec.note ? h('p', { class: 'sec-note', text: sec.note }) : null);
      sec.items.forEach(it => {
        if (typeof it === 'string') {
          used.add(it); const c = this.field(it); if (c) secEl.appendChild(c.el);
        } else if (it.row) {
          const cells = it.row.map(x => { used.add(x); return this.field(x); }).filter(Boolean);
          if (cells.length) secEl.appendChild(h('div', { class: 'row' + (cells.length === 1 ? ' row-1' : '') }, cells.map(c => c.el)));
        } else if (it.matrix) {
          secEl.appendChild(this.matrix(it.matrix, used));
        }
      });
      this.el.appendChild(secEl);
    });
    // Colonnes de saisie présentes dans la table mais absentes de la configuration
    const extra = Hepi.S.inputHeaders(this.key).filter(x => !used.has(x));
    if (extra.length) {
      const secEl = h('section', { class: 'sec' }, h('h3', { class: 'sec-title', text: 'Autres colonnes' }));
      extra.forEach(x => { const c = this.field(x); if (c) secEl.appendChild(c.el); });
      this.el.appendChild(secEl);
    }
  };
  Form.prototype.matrix = function (rows, used) {
    const head = h('div', { class: 'mx-row mx-head' }, h('div', { class: 'mx-label' }), Hepi.TVA.map(t => h('div', { class: 'mx-col', text: t.label })));
    const body = rows.map(r => {
      r.hs.forEach(x => used.add(x));
      const cells = r.hs.map(x => this.field(x, true));
      const sum = h('span', { class: 'mx-sum' });
      this._sums = this._sums || [];
      this._sums.push({ el: sum, hs: r.hs });
      return h('div', { class: 'mx-row' },
        h('div', { class: 'mx-label' }, h('span', { class: 'mx-name', text: r.label }), r.hint ? h('span', { class: 'mx-hint', text: r.hint }) : null, sum),
        cells.map(c => c ? c.el : h('div', { class: 'cell cell-na', text: '—' })));
    });
    return h('div', { class: 'mx', role: 'group' }, head, body);
  };
  Form.prototype.set = function (hd, v, o) {
    this.values[hd] = v;
    if (o && o.final) this.refresh(); else this.refreshLight(hd);
    if (this.opts.onChange) this.opts.onChange(this, hd);
  };
  Form.prototype.changes = function () {
    const ch = {};
    for (const hd in this.ctl) {
      const v = this.values[hd];
      if (this.isNew) { if (!U.isBlank(v) && v !== false) ch[hd] = v; }
      else if (!U.same(v, this.base[hd])) {
        // Une case décochée sur une cellule vide n'est pas une modification
        if (this.ctl[hd].type === 'bool' && v === false && U.isBlank(this.base[hd])) continue;
        ch[hd] = v;
      }
    }
    return ch;
  };
  Form.prototype.dirty = function () { return Object.keys(this.changes()).length > 0; };
  Form.prototype.parseErrors = function () { return Object.values(this.ctl).filter(c => c.error).map(c => c.def.label + ' : ' + c.error); };
  Form.prototype.missing = function () {
    return Object.values(this.ctl).filter(c => c.def.required && c.el.style.display !== 'none' && U.isBlank(this.values[c.h])).map(c => c.def.label);
  };
  Form.prototype.refreshLight = function (hd) {
    const c = this.ctl[hd];
    if (!c) return;
    c.setState({ changed: !this.isNew && !U.same(this.values[hd], this.base[hd]) && !(c.type === 'bool' && this.values[hd] === false && U.isBlank(this.base[hd])), orig: U.display(this.base[hd], c.type) });
    this.updateSums();
  };
  Form.prototype.updateSums = function () {
    (this._sums || []).forEach(s => {
      const tot = s.hs.reduce((a, x) => a + U.num(this.values[x]), 0);
      s.el.textContent = tot ? U.fmtMoney(tot) : '';
    });
  };
  Form.prototype.refresh = function () {
    // Visibilité conditionnelle
    for (const hd in this.ctl) {
      const c = this.ctl[hd];
      const vis = !c.def.when || c.def.when(this.values);
      c.el.style.display = vis ? '' : 'none';
      if (c.def.options && (c.type === 'select' || c.datalist)) { const cur = this.values[hd]; c.fillOptions(); if (c.type === 'select') c.input.value = U.isBlank(cur) ? '' : String(cur); }
    }
    this.el.querySelectorAll('.row').forEach(r => {
      const any = Array.from(r.children).some(ch => ch.style.display !== 'none');
      r.style.display = any ? '' : 'none';
    });
    // Contrôles
    this.issues = this.opts.check ? (this.opts.check(this.values, this) || []) : [];
    const byField = {};
    this.issues.forEach(is => (is.fields || []).forEach(f => {
      const cur = byField[f];
      if (!cur || (is.level === 'error' && cur.level !== 'error')) byField[f] = is;
    }));
    for (const hd in this.ctl) {
      const c = this.ctl[hd];
      const is = byField[hd];
      c.setState({
        changed: !this.isNew && !U.same(this.values[hd], this.base[hd]) && !(c.type === 'bool' && this.values[hd] === false && U.isBlank(this.base[hd])),
        orig: U.display(this.base[hd], c.type),
        error: is && is.level === 'error' ? is.msg : '',
        warn: is && is.level !== 'error' ? is.msg : '',
        formula: this.rec && this.rec._f ? this.rec._f[hd] : ''
      });
    }
    this.updateSums();
    UI.renderIssues(this.alerts, this.issues);
  };

  UI.renderIssues = function (box, issues) {
    UI.clear(box);
    const order = { error: 0, warn: 1, info: 2 };
    issues.slice().sort((a, b) => order[a.level] - order[b.level]).forEach(is => {
      box.appendChild(h('div', { class: 'alert alert-' + is.level }, UI.icon(is.level === 'info' ? 'info' : 'warn'), h('span', { text: is.msg })));
    });
  };

  UI.Form = Form;

  /* Bloc « cartouche » : l'identité d'un enregistrement, à la manière d'un cartouche de plan. */
  UI.cartouche = function (cells) {
    // Une case seule sur sa ligne occupe toute la largeur : le quadrillage reste plein.
    const list = cells.filter(Boolean).map(c => Object.assign({}, c));
    let colPos = 0;
    list.forEach((c, k) => {
      if (c.wide) { colPos = 0; return; }
      const next = list[k + 1];
      if (colPos === 0 && (!next || next.wide)) { c.wide = true; return; }
      colPos = colPos === 0 ? 1 : 0;
    });
    return h('div', { class: 'cartouche' }, list.map(c =>
      h('div', { class: 'ct-cell' + (c.wide ? ' ct-wide' : '') + (c.strong ? ' ct-strong' : '') },
        h('span', { class: 'ct-label', text: c.label }), h('span', { class: 'ct-value', text: U.isBlank(c.value) ? '—' : String(c.value) }))));
  };

  UI.statusChip = function (statut) {
    if (U.isBlank(statut)) return null;
    const cls = /valid/i.test(statut) ? 'ok' : (/corrig/i.test(statut) ? 'plan' : 'warn');
    return h('span', { class: 'chip chip-' + cls, text: statut });
  };

  UI.segmented = function (items, current, onPick) {
    return h('div', { class: 'seg', role: 'tablist' }, items.map(it =>
      h('button', { type: 'button', role: 'tab', class: 'seg-btn' + (it.value === current ? ' on' : ''), 'aria-selected': it.value === current ? 'true' : 'false', on: { click: () => onPick(it.value) } },
        it.label, it.badge ? h('span', { class: 'badge', text: it.badge }) : null)));
  };

  UI.empty = function (title, text, action) {
    return h('div', { class: 'empty' }, h('p', { class: 'empty-title', text: title }), text ? h('p', { class: 'empty-text', text }) : null, action || null);
  };

  Hepi.UI = UI;
})();
