/* Hépilogue – Saisie : ce qui dépend de la structure du classeur.
 * Pour afficher un champ de plus (ou de moins) dans la fiche d'un paiement,
 * il suffit de modifier les listes ci-dessous. */
window.Hepi = window.Hepi || {};

Hepi.VERSION = '2.0.0';

Hepi.TVA = ['5,5 %', '10 %', '20 %'];

Hepi.MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

Hepi.config = {
  /* Le panneau suit l'opération et le mois choisis dans le tableau de bord. */
  dashboard: { sheet: 'Tableau de bord', nameOperation: 'Nom_operation', nameMois: 'Mois_en_cours' },

  tables: {
    paiements: 'BDD_Paiements',
    marches: 'BDD_Marches',
    entreprises: 'BDD_ST',
    operations: 'Tableau2',     // feuille masquée « Liste des opérations »
    indices: 'IndicesBT'
  },

  /* ---------- Fiche d'un paiement : uniquement les champs corrigés ---------- */
  paiement: {
    // Montants HT du mois, une ligne par nature, une colonne par taux (5,5 / 10 / 20 %)
    matrix: [
      { label: 'Avancement total', cols: ['avancement_total_ht_tva55', 'avancement_total_ht_tva10', 'avancement_total_ht_tva20'] },
      { label: 'Part propre', cols: ['avancement_propre_ht_tva55', 'avancement_propre_ht_tva10', 'avancement_propre_ht_tva20'] },
      { label: 'Révision', cols: ['revision_ht_tva55', 'revision_ht_tva10', 'revision_ht_tva20'] },
      { label: 'Avance', cols: ['avance_ht_tva55', 'avance_ht_tva10', 'avance_ht_tva20'] }
    ],
    fields: [
      { col: 'revision_ht_coefficient', label: 'Coefficient de révision', type: 'coef' },
      { col: 'tva_autoliquidee', label: 'TVA autoliquidée', type: 'money' },
      { col: 'retenue_garantie', label: 'Retenue de garantie TTC', type: 'money' },
      { col: 'penalite', label: 'Pénalités TTC', type: 'money' },
      { col: 'autre_retenue', label: 'Autres retenues TTC', type: 'money' },
      { col: 'remboursement_avance', label: 'Remboursement d’avance', type: 'money' },
      { col: 'montant_ttc_declare', label: 'Montant payé TTC', type: 'money', strong: true }
    ],
    // Champs demandés seulement pour une nouvelle ligne
    identity: [
      { col: 'N°_Situation', label: 'Situation n°', type: 'int', required: true },
      { col: 'Date_Réception', label: 'Reçue le', type: 'date', required: true },
      { col: 'entreprise', label: 'Entreprise', type: 'text', options: 'entreprises', required: true },
      { col: 'type_entreprise', label: 'Rôle', type: 'select', options: ['Mandataire', 'Sous-traitant'], required: true },
      { col: 'mandataire', label: 'Mandataire', type: 'text', options: 'mandataires' },
      { col: 'lot', label: 'Lot', type: 'text', options: 'lots', required: true },
      { col: 'autoliquidation', label: 'Sous-traitant en autoliquidation', type: 'bool' }
    ],
    // Cases à cocher écrites à FAUX sur une ligne créée, comme le fait l'extraction
    falseOnCreate: ['autoliquidation', 'avancement_propre_recalcule', 'avance_ventilation_deduite']
  },

  /* ---------- Formulaires d'ajout au référentiel ---------- */
  revisionTypes: ['Révision désactivée', 'Révision simple', 'Révision mixte', 'Actualisation'],

  lot: [
    { col: 'Denomination_Lot', label: 'Dénomination du lot', type: 'text', required: true, placeholder: 'LOT 01 - INTITULÉ' },
    { col: 'Montant base HT TVA 5,5%', label: 'Base HT 5,5 %', type: 'money', group: 'base' },
    { col: 'Montant base HT TVA 10%', label: 'Base HT 10 %', type: 'money', group: 'base' },
    { col: 'Montant base HT TVA 20%', label: 'Base HT 20 %', type: 'money', group: 'base' },
    { col: 'Type de révision', label: 'Type de révision', type: 'select', options: 'revisionTypes', required: true },
    { col: "Coefficient d'actualisation", label: 'Coefficient d’actualisation', type: 'coef', when: v => v['Type de révision'] === 'Actualisation' },
    { col: 'MOIS DE REFERENCE', label: 'Mois de référence', type: 'select', options: 'months', when: v => /simple|mixte/i.test(v['Type de révision'] || '') },
    { col: 'Indice 1 de révision BT', label: 'Indice 1', type: 'select', options: 'indexNames', when: v => /simple|mixte/i.test(v['Type de révision'] || '') },
    { col: 'Indice 1 coefficient', label: 'Pondération indice 1', type: 'coef', when: v => /simple|mixte/i.test(v['Type de révision'] || '') },
    { col: 'Indice 2 de révision BT', label: 'Indice 2', type: 'select', options: 'indexNames', when: v => /mixte/i.test(v['Type de révision'] || '') },
    { col: 'Indice 2 coefficient', label: 'Pondération indice 2', type: 'coef', when: v => /mixte/i.test(v['Type de révision'] || '') }
  ],

  entreprise: [
    { col: 'Entreprise', label: 'Entreprise', type: 'text', required: true },
    { col: 'Type', label: 'Rôle', type: 'select', options: ['Mandataire', 'Sous-traitant'], required: true },
    { col: 'Mandataire', label: 'Mandataire', type: 'select', options: 'mandataires', when: v => v.Type === 'Sous-traitant', required: true },
    { col: 'Denomination_Lot', label: 'Lot', type: 'select', options: 'lotsEG', required: true },
    { col: 'Nature des prestations ST', label: 'Nature des prestations', type: 'text', when: v => v.Type === 'Sous-traitant' },
    { col: 'Autoliquidation (OUI/NON)', label: 'Autoliquidation', type: 'select', options: ['OUI', 'NON'], when: v => v.Type === 'Sous-traitant' },
    { col: 'Montant base HT TVA 5,5%', label: 'Base HT 5,5 %', type: 'money', group: 'base' },
    { col: 'Montant base HT TVA 10%', label: 'Base HT 10 %', type: 'money', group: 'base' },
    { col: 'Montant base HT TVA 20%', label: 'Base HT 20 %', type: 'money', group: 'base' },
    { col: 'Avance', label: 'Avance versée en', type: 'select', options: 'months' },
    { col: 'Montant avance HT TVA 5,5%', label: 'Avance HT 5,5 %', type: 'money', group: 'avance' },
    { col: 'Montant avance HT TVA 10%', label: 'Avance HT 10 %', type: 'money', group: 'avance' },
    { col: 'Montant avance HT TVA 20%', label: 'Avance HT 20 %', type: 'money', group: 'avance' },
    { col: 'RG (OUI/NON)', label: 'Retenue de garantie', type: 'select', options: ['', 'OUI', 'NON'] }
  ],

  lotEntrepriseGenerale: 'ENTREPRISE GENERALE'
};
