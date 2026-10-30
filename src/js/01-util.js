/* Utilitaires : nombres à la française, dates Excel, mois, comparaisons. */
(function () {
  const U = {};

  const nfMoney = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfCoef = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  const nfInt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

  U.isBlank = v => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  U.isErr = v => typeof v === 'string' && /^#(N\/A|VALUE!|REF!|DIV\/0!|NUM!|NAME\?|NULL!|SPILL!|CALC!|GETTING_DATA|BUSY)/.test(v);
  U.num = v => (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'boolean' ? 0 : (U.isBlank(v) || U.isErr(v) ? 0 : (isFinite(+v) ? +v : 0)));
  U.round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

  U.fmtMoney = v => (typeof v === 'number' && isFinite(v)) ? nfMoney.format(v).replace(/ /g, ' ') : (U.isBlank(v) ? '' : String(v));
  U.fmtEuro = v => (typeof v === 'number' && isFinite(v)) ? U.fmtMoney(v) + ' €' : (U.isBlank(v) ? '—' : String(v));
  U.fmtCoef = v => (typeof v === 'number' && isFinite(v)) ? nfCoef.format(v) : (U.isBlank(v) ? '' : String(v));
  U.fmtInt = v => (typeof v === 'number' && isFinite(v)) ? nfInt.format(v) : (U.isBlank(v) ? '' : String(v));

  /* Analyse d'une saisie numérique : "12 345,67", "12345.67", "1.234,5", "-50", "=1000*1,2". */
  U.parseNumber = function (input) {
    if (input === null || input === undefined) return { ok: true, value: '' };
    let s = String(input).trim();
    if (s === '') return { ok: true, value: '' };
    if (s.startsWith('=')) return U.evalExpr(s.slice(1));
    s = s.replace(/[\s  €]/g, '');
    if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
    const hasComma = s.includes(','), hasDot = s.includes('.');
    if (hasComma && hasDot) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) {
      s = s.replace(',', '.');
    } else if (hasDot && /^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return { ok: false, error: 'Nombre attendu' };
    return { ok: true, value: parseFloat(s) };
  };

  /* Petite calculatrice sûre : + - * / et parenthèses, virgule décimale acceptée. */
  U.evalExpr = function (src) {
    const s = src.replace(/[\s  €]/g, '').replace(/,/g, '.');
    let i = 0;
    const peek = () => s[i];
    function num() {
      const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i));
      if (!m) throw new Error('Expression invalide');
      i += m[0].length; return parseFloat(m[0]);
    }
    function factor() {
      if (peek() === '-') { i++; return -factor(); }
      if (peek() === '+') { i++; return factor(); }
      if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('Parenthèse manquante'); i++; return v; }
      return num();
    }
    function term() {
      let v = factor();
      while (peek() === '*' || peek() === '/') {
        const op = s[i++]; const r = factor();
        if (op === '/' && r === 0) throw new Error('Division par zéro');
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    try {
      const v = expr();
      if (i !== s.length) throw new Error('Expression invalide');
      if (!isFinite(v)) throw new Error('Résultat invalide');
      return { ok: true, value: v };
    } catch (e) { return { ok: false, error: e.message }; }
  };

  /* Dates : numéro de série Excel (système 1900) <-> AAAA-MM-JJ */
  const EPOCH = Date.UTC(1899, 11, 30);
  U.serialToISO = function (v) {
    if (typeof v === 'number' && isFinite(v)) {
      const d = new Date(EPOCH + Math.round(v * 86400000));
      return d.toISOString().slice(0, 10);
    }
    if (typeof v === 'string') {
      let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v.trim());
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return '';
  };
  U.isoToSerial = function (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCH) / 86400000);
  };
  U.fmtDate = function (v) {
    const iso = U.serialToISO(v);
    if (!iso) return U.isBlank(v) ? '' : String(v);
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  U.nowSerial = function () {
    const d = new Date();
    const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    return (local - EPOCH) / 86400000;
  };
  U.todaySerial = () => Math.floor(U.nowSerial());

  /* Mois au format du classeur : "2026_03 - mars" */
  U.monthLabel = function (y, m /* 1-12 */) {
    return `${y}_${String(m).padStart(2, '0')} - ${Hepi.MOIS_FR[m - 1]}`;
  };
  U.monthFromSerial = function (v) {
    const iso = U.serialToISO(v);
    if (!iso) return '';
    const [y, m] = iso.split('-');
    return U.monthLabel(+y, +m);
  };
  U.monthKey = label => (/^(\d{4})_(\d{2})/.exec(label || '') || [])[0] || '';
  U.monthShort = function (label) {
    const m = /^(\d{4})_(\d{2}) - (.+)$/.exec(label || '');
    return m ? `${m[3]} ${m[1]}` : (label || '');
  };
  U.addMonths = function (label, delta) {
    const m = /^(\d{4})_(\d{2})/.exec(label || '');
    if (!m) return '';
    const t = (+m[1]) * 12 + (+m[2] - 1) + delta;
    return U.monthLabel(Math.floor(t / 12), (t % 12) + 1);
  };
  U.currentMonth = function () { const d = new Date(); return U.monthLabel(d.getFullYear(), d.getMonth() + 1); };

  /* Comparaison de valeurs de cellules */
  U.same = function (a, b) {
    const ea = U.isBlank(a), eb = U.isBlank(b);
    if (ea || eb) return ea && eb;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    if (typeof a === 'boolean' || typeof b === 'boolean') return String(a).toUpperCase() === String(b).toUpperCase();
    return String(a).trim() === String(b).trim();
  };
  U.norm = s => String(s == null ? '' : s).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  U.uniq = arr => Array.from(new Set(arr.filter(x => !U.isBlank(x))));
  U.sortFr = arr => arr.slice().sort((a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' }));

  U.debounce = function (fn, ms) {
    let t; return function () { const args = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  };

  /* Texte susceptible d'être converti par Excel (nombre, date, notation 1E5…) */
  U.looksConvertible = s => typeof s === 'string' && (/^[=+\-@]/.test(s) || /^[\d\s.,/:\-eE%]+$/.test(s.trim()));

  U.display = function (v, type) {
    if (U.isBlank(v)) return '';
    switch (type) {
      case 'money': return typeof v === 'number' ? U.fmtMoney(v) : String(v);
      case 'coef': return typeof v === 'number' ? U.fmtCoef(v) : String(v);
      case 'int': return typeof v === 'number' ? String(v) : String(v);
      case 'date': return U.fmtDate(v);
      case 'bool': return v === true ? 'Oui' : (v === false ? 'Non' : String(v));
      default: return typeof v === 'number' ? U.fmtCoef(v) : String(v);
    }
  };

  Hepi.U = U;
})();
