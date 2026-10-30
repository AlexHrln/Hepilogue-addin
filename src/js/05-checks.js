/* Contrôles de cohérence, alignés sur les règles des prompts d'extraction et sur le tableau de bord. */
(function () {
  const U = Hepi.U, S = Hepi.S, C = Hepi.config;
  const K = {};
  const RATES = Hepi.TVA;
  const EG = C.lists.lotEntrepriseGenerale;
  const issue = (level, msg, fields) => ({ level, msg, fields: fields || [] });
  const err = (m, f) => issue('error', m, f), warn = (m, f) => issue('warn', m, f), info = (m, f) => issue('info', m, f);
  const k3 = (a, b, c) => [a, b, c].map(U.norm).join('|');

  /* Index partagés, reconstruits après chaque lecture du classeur. */
  let envCache = null, envStamp = -1;
  K.env = function () {
    if (envCache && envStamp === S.lastLoad) return envCache;
    const pai = S.records('paiements'), ava = S.records('avancement');
    const st = S.records('entreprises'), mar = S.records('marches'), ind = S.records('indices');
    const dashPairs = new Set(), ents = new Set(), mands = new Set(), lots = new Set(), stKeys = {};
    st.forEach(r => {
      ents.add(U.norm(r.Operation) + '|' + U.norm(r.Entreprise));
      if (r.Type === 'Mandataire') { dashPairs.add(k3(r.Operation, r.Entreprise, r.Denomination_Lot)); mands.add(U.norm(r.Operation) + '|' + U.norm(r.Entreprise)); }
      const sk = [r.Operation, r.Entreprise, r.Denomination_Lot, r.Type].map(U.norm).join('|');
      stKeys[sk] = (stKeys[sk] || 0) + 1;
    });
    const lotCount = {};
    mar.forEach(r => { const k = U.norm(r.Operation) + '|' + U.norm(r.Denomination_Lot); lots.add(k); lotCount[k] = (lotCount[k] || 0) + 1; });
    const indices = {};
    ind.forEach(r => { indices[String(r.Mois)] = r; });
    const sigP = {}, sigA = {};
    pai.forEach(r => { const s = K.sigPaiement(r); (sigP[s] = sigP[s] || []).push(r._i); });
    ava.forEach(r => { const s = K.sigAvancement(r); (sigA[s] = sigA[s] || []).push(r._i); });
    envCache = { pai, ava, st, mar, dashPairs, ents, mands, lots, lotCount, stKeys, indices, sigP, sigA };
    envStamp = S.lastLoad;
    return envCache;
  };

  K.moisOf = r => U.monthFromSerial(r['Date_Réception']) || String(r.Mois || '');
  const tot = (r, k) => U.num(r['avancement_total_ht_tva' + k]);
  const pro = (r, k) => U.num(r['avancement_propre_ht_tva' + k]);
  K.sigPaiement = r => [r['Opération'], r['N°_Situation'], r.entreprise, r.lot, K.moisOf(r), U.round2(U.num(r.montant_ttc_declare))]
    .concat(RATES.map(t => U.round2(tot(r, t.key)))).map(x => U.norm(x)).join('|');
  K.sigAvancement = r => [r['Opération'], r['N°_Situation'], r.Lot, K.moisOf(r)]
    .concat(['HT_Periodique_TVA_5_5', 'HT_Periodique_TVA_10', 'HT_Periodique_TVA_20'].map(h => U.round2(U.num(r[h])))).map(x => U.norm(x)).join('|');

  /* Sous-traitants rattachés à une ligne mandataire, même mois. */
  K.stOf = function (r, env) {
    env = env || K.env();
    const m = K.moisOf(r);
    return env.pai.filter(x => x._i !== r._i && x.type_entreprise === 'Sous-traitant'
      && U.same(x['Opération'], r['Opération']) && K.moisOf(x) === m
      && U.norm(x.mandataire) === U.norm(r.entreprise) && U.norm(x.lot) === U.norm(r.lot));
  };
  K.mandataireOf = function (r, env) {
    env = env || K.env();
    const m = K.moisOf(r);
    return env.pai.find(x => x.type_entreprise === 'Mandataire' && U.same(x['Opération'], r['Opération'])
      && K.moisOf(x) === m && U.norm(x.entreprise) === U.norm(r.mandataire) && U.norm(x.lot) === U.norm(r.lot));
  };

  function indexIssue(r, env, mois1, mois2) {
    const type = String(r['Type de révision'] || '');
    if (!/simple|mixte/i.test(type)) return null;
    const need = [[r['Index BT de référence - 1'], mois1]];
    if (/mixte/i.test(type)) need.push([r['Index BT de référence - 2'], mois2]);
    const ref = r['Mois de référence'];
    const missing = [];
    need.forEach(([ix, m]) => {
      if (U.isBlank(ix) || U.isErr(ix) || !m) return;
      const row = env.indices[m];
      if (!row || U.isBlank(row[ix])) missing.push(`${ix} de ${U.monthShort(m)}`);
      const rr = env.indices[ref];
      if (ref && (!rr || U.isBlank(rr[ix]))) missing.push(`${ix} du mois de référence ${U.monthShort(ref)}`);
    });
    if (!missing.length) return null;
    return warn('Indice non renseigné (' + U.uniq(missing).join(', ') + ') : le coefficient de révision calculé est faux.', []);
  }

  K.paiement = function (r, env) {
    env = env || K.env();
    const out = [];
    const op = r['Opération'];
    const isM = r.type_entreprise === 'Mandataire', isST = r.type_entreprise === 'Sous-traitant';
    if (!U.isBlank(r.type_entreprise) && !isM && !isST) out.push(err('Rôle inconnu : « Mandataire » ou « Sous-traitant » attendu.', ['type_entreprise']));

    const moneyHs = Object.keys(C.tables.paiements.fields).filter(h => C.tables.paiements.fields[h].type === 'money' && h !== 'montant_ttc_declare');
    if (moneyHs.some(h => U.num(r[h]) !== 0) && U.num(r.montant_ttc_declare) === 0)
      out.push(err('Montant payé TTC manquant alors que la ligne porte des montants.', ['montant_ttc_declare']));
    ['retenue_garantie', 'penalite', 'autre_retenue'].forEach(h => {
      if (U.num(r[h]) > 0) out.push(warn(`${C.tables.paiements.fields[h].label} positive : une retenue se saisit en négatif.`, [h]));
    });
    if (RATES.some(t => U.num(r['avance_ht_tva' + t.key]) > 0))
      out.push(info('Avance positive : versement d’avance ? Une reprise se saisit en négatif.', RATES.map(t => 'avance_ht_tva' + t.key)));

    if (isM) {
      const sts = K.stOf(r, env);
      RATES.forEach(t => {
        const T = tot(r, t.key), P = pro(r, t.key);
        const f = ['avancement_propre_ht_tva' + t.key];
        if (P > T + 0.01) { out.push(err(`Part propre ${t.label} supérieure à l’avancement total.`, f)); return; }
        const S_ = sts.reduce((a, x) => a + tot(x, t.key), 0);
        const exp = U.round2(T - S_);
        if (exp < -1 && sts.length) {
          out.push(warn(`Taux ${t.label} : les sous-traitants du mois (${U.fmtMoney(U.round2(S_))}) dépassent l’avancement total du mandataire (${U.fmtMoney(T)}).`, ['avancement_total_ht_tva' + t.key]));
        } else if (Math.abs(P - exp) > 1) {
          out.push(warn(sts.length
            ? `Part propre ${t.label} : ${U.fmtMoney(P)} au lieu de ${U.fmtMoney(exp)} (avancement total − sous-traitants du mois).`
            : `Part propre ${t.label} différente de l’avancement total, sans sous-traitant saisi ce mois-ci.`, f));
        }
      });
    }
    if (r.avancement_propre_recalcule === true) out.push(info('Part propre recalculée par l’extraction : à vérifier sur la situation.', ['avancement_propre_recalcule']));
    if (r.avance_ventilation_deduite === true) out.push(info('Ventilation de l’avance par taux déduite du référentiel.', ['avance_ventilation_deduite']));

    const cd = U.num(r.revision_ht_coefficient), cc = r['Coefficient de révision'];
    if (cd && typeof cc === 'number' && Math.abs(cd - cc) > 0.0005)
      out.push(warn(`Coefficient déclaré ${U.fmtCoef(cd)} ≠ coefficient calculé ${U.fmtCoef(cc)}.`, ['revision_ht_coefficient']));

    if (isM && !U.isBlank(r.entreprise) && !env.dashPairs.has(k3(op, r.entreprise, r.lot)))
      out.push(err('Ligne invisible dans le tableau de bord : ce couple entreprise / lot n’existe pas comme mandataire dans BDD Entreprises.', ['entreprise', 'lot']));
    if (isST) {
      if (U.isBlank(r.mandataire)) out.push(err('Mandataire manquant pour ce sous-traitant.', ['mandataire']));
      else if (!env.dashPairs.has(k3(op, r.mandataire, r.lot)))
        out.push(err('Sous-traitant non rattaché au tableau de bord : couple mandataire / lot introuvable dans BDD Entreprises.', ['mandataire', 'lot']));
      if (!U.isBlank(r.entreprise) && !env.ents.has(U.norm(op) + '|' + U.norm(r.entreprise)))
        out.push(warn('Entreprise absente de BDD Entreprises pour cette opération.', ['entreprise']));
    }
    if (!U.isBlank(r.lot) && U.norm(r.lot) !== U.norm(EG) && !env.lots.has(U.norm(op) + '|' + U.norm(r.lot)))
      out.push(info('Lot absent de BDD Marchés : pas de révision calculée pour cette ligne.', ['lot']));

    const ii = indexIssue(r, env, U.addMonths(K.moisOf(r), -3), K.moisOf(r));
    if (ii) out.push(ii);

    const same = (env.sigP[K.sigPaiement(r)] || []).filter(i => i !== r._i);
    if (same.length) out.push(err('Doublon probable : une autre ligne a la même situation, la même entreprise, le même lot et les mêmes montants.', []));
    return out;
  };

  K.avancement = function (r, env) {
    env = env || K.env();
    const out = [];
    const hs = ['HT_Periodique_TVA_5_5', 'HT_Periodique_TVA_10', 'HT_Periodique_TVA_20'];
    if (hs.every(h => U.num(r[h]) === 0)) out.push(info('Aucun montant sur cette ligne.', hs));
    if (!U.isBlank(r.Lot) && !env.lots.has(U.norm(r['Opération']) + '|' + U.norm(r.Lot)))
      out.push(warn('Lot absent de BDD Marchés : la révision ne peut pas être calculée.', ['Lot']));
    const ii = indexIssue(r, env, K.moisOf(r), K.moisOf(r));
    if (ii) out.push(ii);
    const same = (env.sigA[K.sigAvancement(r)] || []).filter(i => i !== r._i);
    if (same.length) out.push(err('Doublon probable : même lot, même situation et mêmes montants sur une autre ligne.', []));
    return out;
  };

  K.marche = function (r, env) {
    env = env || K.env();
    const out = [];
    const type = String(r['Type de révision'] || '');
    const c1 = U.num(r['Indice 1 coefficient']), c2 = U.num(r['Indice 2 coefficient']);
    if (/simple|mixte/i.test(type)) {
      if (U.isBlank(r['MOIS DE REFERENCE'])) out.push(err('Mois de référence manquant.', ['MOIS DE REFERENCE']));
      if (U.isBlank(r['Indice 1 de révision BT'])) out.push(err('Indice 1 manquant.', ['Indice 1 de révision BT']));
      if (/simple/i.test(type) && c1 !== 1) out.push(warn('En révision simple, la pondération de l’indice 1 vaut normalement 1.', ['Indice 1 coefficient']));
      if (/mixte/i.test(type)) {
        if (U.isBlank(r['Indice 2 de révision BT'])) out.push(err('Indice 2 manquant pour une révision mixte.', ['Indice 2 de révision BT']));
        if (Math.abs(c1 + c2 - 1) > 0.0001) out.push(warn(`Les pondérations totalisent ${U.fmtCoef(c1 + c2)} au lieu de 1.`, ['Indice 1 coefficient', 'Indice 2 coefficient']));
      }
      const ref = env.indices[String(r['MOIS DE REFERENCE'] || '')];
      ['Indice 1 de révision BT', 'Indice 2 de révision BT'].forEach(h => {
        const ix = r[h];
        if (!U.isBlank(ix) && r['MOIS DE REFERENCE'] && (!ref || U.isBlank(ref[ix])))
          out.push(warn(`${ix} non renseigné pour le mois de référence dans Indices BT.`, ['MOIS DE REFERENCE']));
      });
    }
    if (/actualisation/i.test(type) && !U.num(r["Coefficient d'actualisation"])) out.push(err('Coefficient d’actualisation manquant.', ["Coefficient d'actualisation"]));
    const k = U.norm(r.Operation) + '|' + U.norm(r.Denomination_Lot);
    const n = (env.lotCount[k] || 0) - (r._i !== undefined && env.mar.some(x => x._i === r._i && U.norm(x.Operation) + '|' + U.norm(x.Denomination_Lot) === k) ? 1 : 0);
    if (n > 0) out.push(err('Ce lot existe déjà pour cette opération.', ['Denomination_Lot']));
    const total = ['Montant base HT TVA 5,5%', 'Montant base HT TVA 10%', 'Montant base HT TVA 20%'].reduce((a, h) => a + U.num(r[h]), 0);
    if (!total) out.push(info('Montant du marché non renseigné.', []));
    return out;
  };

  K.entreprise = function (r, env) {
    env = env || K.env();
    const out = [];
    const op = r.Operation;
    if (r.Type === 'Sous-traitant') {
      if (U.isBlank(r.Mandataire)) out.push(err('Indiquez le mandataire de ce sous-traitant.', ['Mandataire']));
      else if (!env.mands.has(U.norm(op) + '|' + U.norm(r.Mandataire))) out.push(warn('Ce mandataire n’est pas déclaré comme tel pour l’opération.', ['Mandataire']));
    }
    if (!U.isBlank(r.Denomination_Lot) && U.norm(r.Denomination_Lot) !== U.norm(EG) && !env.lots.has(U.norm(op) + '|' + U.norm(r.Denomination_Lot)))
      out.push(warn('Lot absent de BDD Marchés.', ['Denomination_Lot']));
    const pp = r['Total base HT part propre'];
    if (r.Type === 'Mandataire' && typeof pp === 'number' && pp < -0.01) out.push(warn('Les sous-traitants dépassent le montant du mandataire (part propre négative).', []));
    const hasAvance = ['Montant avance HT TVA 5,5%', 'Montant avance HT TVA 10%', 'Montant avance HT TVA 20%'].some(h => U.num(r[h]) !== 0);
    if (hasAvance && U.isBlank(r.Avance)) out.push(warn('Mois de versement de l’avance manquant : elle ne sera pas comptée dans le net payé.', ['Avance']));
    const sk = [op, r.Entreprise, r.Denomination_Lot, r.Type].map(U.norm).join('|');
    const n = (env.stKeys[sk] || 0) - (r._i !== undefined && env.st.some(x => x._i === r._i && [x.Operation, x.Entreprise, x.Denomination_Lot, x.Type].map(U.norm).join('|') === sk) ? 1 : 0);
    if (n > 0) out.push(warn('Cette entreprise est déjà déclarée sur ce lot avec ce rôle.', ['Entreprise']));
    return out;
  };

  /* Analyse d'une opération : anomalies par ligne. */
  K.scan = function (op, mois) {
    const env = K.env();
    const res = [];
    const inScope = r => U.same(r['Opération'], op) && (!mois || mois === '*' || K.moisOf(r) === mois);
    env.pai.filter(inScope).forEach(r => { const is = K.paiement(r, env); if (is.length) res.push({ key: 'paiements', rec: r, issues: is }); });
    env.ava.filter(inScope).forEach(r => { const is = K.avancement(r, env); if (is.length) res.push({ key: 'avancement', rec: r, issues: is }); });
    env.mar.filter(r => U.same(r.Operation, op)).forEach(r => { const is = K.marche(r, env).filter(i => i.level !== 'info'); if (is.length) res.push({ key: 'marches', rec: r, issues: is }); });
    env.st.filter(r => U.same(r.Operation, op)).forEach(r => { const is = K.entreprise(r, env).filter(i => i.level !== 'info'); if (is.length) res.push({ key: 'entreprises', rec: r, issues: is }); });
    return res;
  };
  K.worst = issues => issues.some(i => i.level === 'error') ? 'error' : (issues.some(i => i.level === 'warn') ? 'warn' : (issues.length ? 'info' : ''));

  /* Net déclaré d'un mois, comme la colonne C du tableau de bord. */
  K.netDeclareMois = function (op, mois) {
    const env = K.env();
    let n = env.pai.filter(r => U.same(r['Opération'], op) && String(r.Mois) === mois).reduce((a, r) => a + U.num(r.montant_ttc_declare), 0);
    env.st.filter(r => U.same(r.Operation, op) && String(r.Avance) === mois).forEach(r => {
      n += U.num(r['Montant avance HT TVA 5,5%']) * 1.055 + U.num(r['Montant avance HT TVA 10%']) * 1.1 + U.num(r['Montant avance HT TVA 20%']) * 1.2;
    });
    return U.round2(n);
  };

  Hepi.K = K;
})();
