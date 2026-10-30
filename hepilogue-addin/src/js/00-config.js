/* Hépilogue – Saisie : configuration du classeur.
 * Tout ce qui dépend de la structure du fichier Excel est ici :
 * noms des tables, en-têtes de colonnes, libellés et mise en page des formulaires.
 * Les colonnes calculées (formules de table) sont détectées automatiquement
 * et ne sont jamais écrites par le panneau.
 */
window.Hepi = window.Hepi || {};

Hepi.VERSION = '1.0.0';

Hepi.TVA = [
  { key: '55', label: '5,5 %', rate: 0.055 },
  { key: '10', label: '10 %', rate: 0.10 },
  { key: '20', label: '20 %', rate: 0.20 }
];

Hepi.MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

Hepi.config = {
  /* Tableau de bord : cellules nommées et repères de colonnes (lus par leur en-tête). */
  dashboard: {
    sheet: 'Tableau de bord',
    nameOperation: 'Nom_operation',
    nameMois: 'Mois_en_cours',
    range: 'A8:BM80',          // en-têtes en ligne 8, données à partir de la ligne 9
    headerRow: 8,
    firstRow: 9,
    monthRows: 24,             // B9:B32 (SEQUENCE(24))
    cols: {
      mois: 'MOIS',
      netDeclareMois: 'NET A PAYER TTC DECLARÉ',
      netValide: 'NET A PAYER TTC VALIDÉ',
      commentaire: 'COMMENTAIRE',
      entreprise: 'NOM ENTREPRISE',
      lot: 'LOT',
      netCalcule: 'NET A PAYER CALCULE',
      netDeclare: 'NET A PAYER DECLARÉ'
    },
    /* Bloc des sous-traitants plus bas dans la feuille : repéré par cet en-tête dans la colonne « NOM ENTREPRISE » */
    stHeader: 'NOM SOUS-TRAITANT'
  },

  /* Valeurs de référence */
  lists: {
    typeEntreprise: ['Mandataire', 'Sous-traitant'],
    typeRevision: ['Révision désactivée', 'Révision simple', 'Révision mixte', 'Actualisation'],
    ouiNon: ['', 'OUI', 'NON'],
    statut: ['', 'À vérifier', 'Corrigé', 'Validé'],
    lotEntrepriseGenerale: 'ENTREPRISE GENERALE'
  },

  tables: {
    paiements: {
      name: 'BDD_Paiements',
      label: 'Paiements',
      key: ['Opération', 'N°_Situation', 'entreprise', 'lot', 'Source_PDF'],
      opField: 'Opération',
      fields: {
        'Opération': { label: 'Opération', type: 'select', options: 'operations', required: true },
        'N°_Situation': { label: 'Situation n°', type: 'int', required: true },
        'Date_Réception': { label: 'Reçue le', type: 'date', required: true, help: 'Détermine le mois de rattachement.' },
        'Date_Document': { label: 'Datée du', type: 'date' },
        'Date_Échéance': { label: 'Échéance', type: 'date' },
        'N°_Facture': { label: 'Facture n°', type: 'text' },
        'entreprise': { label: 'Entreprise', type: 'text', options: 'entreprises', required: true },
        'type_entreprise': { label: 'Rôle', type: 'select', options: 'typeEntreprise', required: true },
        'mandataire': { label: 'Mandataire', type: 'text', options: 'mandataires' },
        'lot': { label: 'Lot', type: 'text', options: 'lotsAndEG', required: true },
        'autoliquidation': { label: 'Autoliquidation de la TVA', type: 'bool' },
        'avancement_total_ht_tva55': { label: 'Avancement total 5,5 %', type: 'money' },
        'avancement_total_ht_tva10': { label: 'Avancement total 10 %', type: 'money' },
        'avancement_total_ht_tva20': { label: 'Avancement total 20 %', type: 'money' },
        'avancement_propre_ht_tva55': { label: 'Part propre 5,5 %', type: 'money' },
        'avancement_propre_ht_tva10': { label: 'Part propre 10 %', type: 'money' },
        'avancement_propre_ht_tva20': { label: 'Part propre 20 %', type: 'money' },
        'avancement_propre_recalcule': { label: 'Part propre recalculée (non lue sur la situation)', type: 'bool' },
        'revision_ht_coefficient': { label: 'Coefficient déclaré', type: 'coef' },
        'revision_ht_tva55': { label: 'Révision 5,5 %', type: 'money' },
        'revision_ht_tva10': { label: 'Révision 10 %', type: 'money' },
        'revision_ht_tva20': { label: 'Révision 20 %', type: 'money' },
        'tva_autoliquidee': { label: 'TVA autoliquidée', type: 'money' },
        'avance_ht_tva55': { label: 'Avance 5,5 %', type: 'money' },
        'avance_ht_tva10': { label: 'Avance 10 %', type: 'money' },
        'avance_ht_tva20': { label: 'Avance 20 %', type: 'money' },
        'avance_ventilation_deduite': { label: 'Ventilation de l’avance déduite du référentiel', type: 'bool' },
        'remboursement_avance': { label: 'Remboursement d’avance (ancien champ)', type: 'money' },
        'retenue_garantie': { label: 'Retenue de garantie', type: 'money', sign: 'neg' },
        'penalite': { label: 'Pénalités', type: 'money', sign: 'neg' },
        'autre_retenue': { label: 'Autres retenues', type: 'money', sign: 'neg' },
        'montant_ttc_declare': { label: 'Montant payé TTC (déclaré)', type: 'money' },
        'Statut': { label: 'Statut', type: 'select', options: 'statut' },
        'Source_PDF': { label: 'Fichier source', type: 'text' }
      },
      layout: [
        { title: 'Identification', items: [
          { row: ['Opération', 'N°_Situation'] },
          { row: ['Date_Réception', 'Date_Document'] },
          { row: ['Date_Échéance', 'N°_Facture'] },
          'entreprise',
          { row: ['type_entreprise', 'autoliquidation'] },
          'mandataire',
          'lot'
        ] },
        { title: 'Montants HT du mois', note: 'Par taux de TVA. Saisissez 1200,50 ou une opération comme =1000*1,2.', items: [
          { matrix: [
            { label: 'Avancement total', hs: ['avancement_total_ht_tva55', 'avancement_total_ht_tva10', 'avancement_total_ht_tva20'] },
            { label: 'Part propre', hs: ['avancement_propre_ht_tva55', 'avancement_propre_ht_tva10', 'avancement_propre_ht_tva20'], hint: 'hors sous-traitants' },
            { label: 'Révision', hs: ['revision_ht_tva55', 'revision_ht_tva10', 'revision_ht_tva20'] },
            { label: 'Avance', hs: ['avance_ht_tva55', 'avance_ht_tva10', 'avance_ht_tva20'], hint: 'reprise en négatif' }
          ] },
          { row: ['revision_ht_coefficient', 'tva_autoliquidee'] },
          'avancement_propre_recalcule',
          'avance_ventilation_deduite'
        ] },
        { title: 'Retenues TTC du mois', note: 'Valeurs négatives.', items: [
          { row: ['retenue_garantie', 'penalite'] },
          { row: ['autre_retenue', 'remboursement_avance'] }
        ] },
        { title: 'Paiement', items: ['montant_ttc_declare', { row: ['Statut', 'Source_PDF'] }] }
      ],
      computedShown: ['Mois', 'Type de révision', 'Mois de référence', 'Mois N - 3', 'Coefficient de révision', 'CLE']
    },

    avancement: {
      name: 'BDD_Avancement',
      label: 'Avancement',
      key: ['Opération', 'N°_Situation', 'Lot', 'Source_PDF', 'Date_Réception'],
      opField: 'Opération',
      fields: {
        'Opération': { label: 'Opération', type: 'select', options: 'operations', required: true },
        'N°_Situation': { label: 'Situation n°', type: 'int', required: true },
        'Date_Réception': { label: 'Reçue le', type: 'date', required: true },
        'Date_Document': { label: 'Datée du', type: 'date' },
        'Lot': { label: 'Lot', type: 'text', options: 'lots', required: true },
        'HT_Periodique_TVA_5_5': { label: 'HT du mois 5,5 %', type: 'money' },
        'HT_Periodique_TVA_10': { label: 'HT du mois 10 %', type: 'money' },
        'HT_Periodique_TVA_20': { label: 'HT du mois 20 %', type: 'money' },
        'Source_PDF': { label: 'Fichier source', type: 'text' }
      },
      layout: [
        { title: 'Identification', items: [
          { row: ['Opération', 'N°_Situation'] },
          { row: ['Date_Réception', 'Date_Document'] },
          'Lot'
        ] },
        { title: 'Travaux réalisés sur le lot ce mois-ci', note: 'Tous intervenants confondus, hors révision et hors avance.', items: [
          { matrix: [
            { label: 'HT du mois', hs: ['HT_Periodique_TVA_5_5', 'HT_Periodique_TVA_10', 'HT_Periodique_TVA_20'] }
          ] }
        ] },
        { title: 'Suivi', items: ['Source_PDF'] }
      ],
      computedShown: ['Mois', 'Type de révision', 'Coefficient de révision', 'HT_Periodique_TVA_5_5 - REVISE', 'HT_Periodique_TVA_10 - REVISE', 'HT_Periodique_TVA_20 - REVISE', 'CLE']
    },

    marches: {
      name: 'BDD_Marches',
      label: 'Lots',
      key: ['Operation', 'Denomination_Lot'],
      opField: 'Operation',
      fields: {
        'Operation': { label: 'Opération', type: 'select', options: 'operations', required: true },
        'Denomination_Lot': { label: 'Dénomination du lot', type: 'text', required: true, help: 'Format habituel : LOT 01 - INTITULÉ. Ce libellé doit être identique partout.' },
        'Montant base HT TVA 5,5%': { label: 'Base HT 5,5 %', type: 'money' },
        'Montant base HT TVA 10%': { label: 'Base HT 10 %', type: 'money' },
        'Montant base HT TVA 20%': { label: 'Base HT 20 %', type: 'money' },
        'Dont Avenant Total HT': { label: 'Dont avenants HT', type: 'money' },
        'Type de révision': { label: 'Type de révision', type: 'select', options: 'typeRevision', required: true },
        "Coefficient d'actualisation": { label: 'Coefficient d’actualisation', type: 'coef', when: r => r['Type de révision'] === 'Actualisation' },
        'MOIS DE REFERENCE': { label: 'Mois de référence (Mo)', type: 'month', when: r => /simple|mixte/i.test(r['Type de révision'] || '') },
        'Indice 1 de révision BT': { label: 'Indice 1', type: 'select', options: 'indexNames', when: r => /simple|mixte/i.test(r['Type de révision'] || '') },
        'Indice 1 coefficient': { label: 'Pondération indice 1', type: 'coef', when: r => /simple|mixte/i.test(r['Type de révision'] || '') },
        'Indice 2 de révision BT': { label: 'Indice 2', type: 'select', options: 'indexNames', when: r => /mixte/i.test(r['Type de révision'] || '') },
        'Indice 2 coefficient': { label: 'Pondération indice 2', type: 'coef', when: r => /mixte/i.test(r['Type de révision'] || '') }
      },
      layout: [
        { title: 'Lot', items: [{ row: ['Operation'] }, 'Denomination_Lot'] },
        { title: 'Montant du marché', items: [
          { matrix: [{ label: 'Base HT', hs: ['Montant base HT TVA 5,5%', 'Montant base HT TVA 10%', 'Montant base HT TVA 20%'] }] },
          'Dont Avenant Total HT'
        ] },
        { title: 'Révision des prix', note: 'Coefficient = 0,15 + 0,85 × (pondérations × BT du mois / BT du Mo).', items: [
          'Type de révision',
          "Coefficient d'actualisation",
          'MOIS DE REFERENCE',
          { row: ['Indice 1 de révision BT', 'Indice 1 coefficient'] },
          { row: ['Indice 2 de révision BT', 'Indice 2 coefficient'] }
        ] }
      ],
      computedShown: ['CLE']
    },

    entreprises: {
      name: 'BDD_ST',
      label: 'Entreprises',
      key: ['Operation', 'Entreprise', 'Denomination_Lot', 'Type'],
      opField: 'Operation',
      fields: {
        'Operation': { label: 'Opération', type: 'select', options: 'operations', required: true },
        'Entreprise': { label: 'Entreprise', type: 'text', required: true, help: 'Libellé de référence : l’extraction et le tableau de bord s’appuient dessus.' },
        'Denomination_Lot': { label: 'Lot', type: 'select', options: 'lotsAndEG', required: true },
        'Nature des prestations ST': { label: 'Nature des prestations', type: 'text' },
        'Type': { label: 'Rôle', type: 'select', options: 'typeEntreprise', required: true },
        'Mandataire': { label: 'Mandataire', type: 'select', options: 'mandatairesOp', when: r => r['Type'] === 'Sous-traitant' },
        'Autoliquidation (OUI/NON)': { label: 'Autoliquidation', type: 'select', options: 'ouiNon', when: r => r['Type'] === 'Sous-traitant' },
        'Montant base HT TVA 5,5%': { label: 'Base HT 5,5 %', type: 'money' },
        'Montant base HT TVA 10%': { label: 'Base HT 10 %', type: 'money' },
        'Montant base HT TVA 20%': { label: 'Base HT 20 %', type: 'money' },
        'Avance': { label: 'Avance versée en', type: 'month', help: 'Mois où l’avance a été payée : elle est ajoutée au net payé de ce mois.' },
        'Montant avance HT TVA 5,5%': { label: 'Avance HT 5,5 %', type: 'money' },
        'Montant avance HT TVA 10%': { label: 'Avance HT 10 %', type: 'money' },
        'Montant avance HT TVA 20%': { label: 'Avance HT 20 %', type: 'money' },
        'RG (OUI/NON)': { label: 'Retenue de garantie', type: 'select', options: 'ouiNon' }
      },
      layout: [
        { title: 'Entreprise', items: [
          { row: ['Operation'] },
          'Entreprise',
          { row: ['Type', 'Autoliquidation (OUI/NON)'] },
          'Mandataire',
          'Denomination_Lot',
          'Nature des prestations ST'
        ] },
        { title: 'Montants', items: [
          { matrix: [
            { label: 'Base HT', hs: ['Montant base HT TVA 5,5%', 'Montant base HT TVA 10%', 'Montant base HT TVA 20%'] },
            { label: 'Avance HT', hs: ['Montant avance HT TVA 5,5%', 'Montant avance HT TVA 10%', 'Montant avance HT TVA 20%'] }
          ] },
          { row: ['Avance', 'RG (OUI/NON)'] }
        ] }
      ],
      computedShown: ['Total base HT', 'Total base TTC', 'Total base HT part propre', 'Total base TTC part propre', 'CLE']
    },

    indices: {
      name: 'IndicesBT',
      label: 'Indices BT',
      key: ['Mois'],
      fields: { 'Mois': { label: 'Mois', type: 'text', required: true } }
      // Les colonnes d’indices (BT01, BT47…) sont ajoutées dynamiquement.
    },

    operations: {
      name: 'Tableau2',
      label: 'Opérations autorisées',
      key: ['Nom des opérations autorisées'],
      fields: { 'Nom des opérations autorisées': { label: 'Opération', type: 'text' } }
    },

    /* Tables créées par le panneau si besoin */
    validations: {
      name: 'BDD_Validations',
      sheet: 'BDD Validations',
      create: true,
      hidden: false,
      label: 'Validations',
      key: ['Opération', 'Mois'],
      headers: ['Opération', 'Mois', 'Net_TTC_Validé', 'Commentaire', 'Validé_par', 'Date_validation'],
      fields: {
        'Opération': { label: 'Opération', type: 'text' },
        'Mois': { label: 'Mois', type: 'text' },
        'Net_TTC_Validé': { label: 'Net à payer TTC validé', type: 'money' },
        'Commentaire': { label: 'Commentaire', type: 'textarea' },
        'Validé_par': { label: 'Validé par', type: 'text' },
        'Date_validation': { label: 'Le', type: 'date' }
      }
    },

    journal: {
      name: 'Journal_Saisie',
      sheet: 'Journal saisie',
      create: true,
      hidden: true,
      label: 'Journal',
      key: [],
      headers: ['Horodatage', 'Utilisateur', 'Action', 'Table', 'Clé', 'Champ', 'Ancienne valeur', 'Nouvelle valeur'],
      fields: {}
    }
  }
};
