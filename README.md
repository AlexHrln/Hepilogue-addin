# Hépilogue – Saisie (complément Excel)

Panneau latéral pour corriger ou ajouter les données brutes de paiement du mois, sans aller dans les tables.
Il fonctionne dans Excel pour Microsoft 365 (Mac, Windows, web) sur le classeur partagé dans SharePoint.

## Ce que fait le panneau

**Paiements du mois**
- Le panneau suit l'opération et le mois choisis dans le tableau de bord (cellules nommées `Nom_operation` et `Mois_en_cours`). Si vous les changez, il se met à jour.
- Il liste les lignes de BDD_Paiements de ce mois, mandataire puis sous-traitants, lot par lot.
- Une ligne s'ouvre en fiche avec les champs corrigés :
  - avancement total, part propre, révision et avance HT, par taux de TVA ;
  - coefficient de révision, TVA autoliquidée ;
  - retenue de garantie, pénalités, autres retenues, remboursement d'avance ;
  - montant payé TTC.
- « Ajouter une ligne » crée un paiement pour l'opération affichée. Choisir une entreprise connue remplit son rôle, son mandataire, son lot et l'autoliquidation. La date de réception est proposée dans le mois affiché, puisque c'est elle qui rattache la ligne au mois.

Les montants se saisissent à la française (`12 345,67`) ou par calcul (`=1000*1,2`).

**Référentiel** (ajouts uniquement)
- Ajouter une opération : elle est inscrite dans la liste des opérations reconnues par l'extraction (feuille masquée « Liste des opérations »). Elle apparaît dans le tableau de bord dès son premier lot, que le panneau propose d'ajouter aussitôt.
- Ajouter un lot dans BDD_Marches, avec ses montants et sa révision.
- Ajouter une entreprise dans BDD_ST : mandataire ou sous-traitant, montants, avance.

Pour modifier un élément existant du référentiel, passez par la table.

## Ce que le panneau ne fait pas

Il ne calcule rien et ne contrôle rien. Il écrit dans les tables ; Excel recalcule et le tableau de bord affiche le résultat.

## Sécurités d'écriture

- Les colonnes calculées ne sont jamais écrites. Sur une ligne ajoutée, leurs formules sont recopiées.
- Seules les cellules modifiées sont écrites.
- Avant d'écrire, la table est relue et la ligne retrouvée par ses valeurs. Si un collègue a modifié la même valeur entre-temps, le panneau demande laquelle garder.
- Un texte qui ressemble à un nombre ou à une date (n° de facture `25-02-34`) reste du texte.
- Aucune colonne n'est ajoutée aux tables : le flux Power Automate n'est pas concerné.
- Aucune donnée ne quitte le classeur. **Ne déposez jamais le classeur dans le dossier hébergé.**

## Mise en service

### 1. Héberger les fichiers en HTTPS

**Option A — GitHub Pages**
1. Sur github.com, créez un dépôt `hepilogue-addin` (public : seul le code est publié).
2. « Add file » › « Upload files » : glissez tout le contenu du dossier.
3. « Settings » › « Pages » › « Deploy from a branch », branche `main`, dossier `/ (root)`.
4. Adresse : `https://<compte>.github.io/hepilogue-addin`. Vérifiez que `…/src/taskpane.html` s'ouvre dans un navigateur.

**Option B — Azure Static Web Apps**
1. Portail Azure › Static Web Apps › Créer, plan « Free », source « Other », puis copiez le jeton de déploiement.
2. Dans le Terminal, depuis le dossier : `npx @azure/static-web-apps-cli deploy ./ --deployment-token <jeton> --env production`

SharePoint ne convient pas à l'hébergement : il télécharge les fichiers `.html` au lieu de les afficher.

### 2. Adapter le manifeste

```
cd ~/Downloads/hepilogue-addin
./configurer.sh https://<compte>.github.io/hepilogue-addin
```
Le fichier `manifest-production.xml` est créé. À défaut, remplacez dans `manifest.xml` toutes les occurrences de `https://localhost:3000` par votre adresse.

### 3. Tester sur votre Mac, sur une copie du classeur

1. Quittez Excel.
2. Finder › Aller › Aller au dossier `~/Library/Containers/com.microsoft.Excel/Data/Documents/`. Créez-y un dossier `wef` s'il n'existe pas, puis copiez-y `manifest-production.xml`.
3. Rouvrez Excel. Onglet Insertion › Compléments › Mes compléments : choisissez « Hépilogue – Saisie ». Le bouton **Saisie** apparaît ensuite dans l'onglet Accueil.

### 4. Déployer pour l'équipe

1. admin.microsoft.com › Paramètres › Applications intégrées › Charger des applications personnalisées.
2. Type « Complément Office », chargez `manifest-production.xml`.
3. Choisissez les utilisateurs ou le groupe, puis déployez. Le bouton **Saisie** apparaît sous quelques heures (24 h au plus).
4. Retirez ensuite le manifeste du dossier `wef` de votre Mac.

## Adapter le panneau

Tout est dans `src/js/00-config.js` :
- `paiement.matrix` et `paiement.fields` : les champs affichés dans la fiche d'un paiement (ajouter ou retirer une ligne suffit) ;
- `paiement.identity` : les champs demandés pour une nouvelle ligne ;
- `lot` et `entreprise` : les formulaires d'ajout au référentiel ;
- `tables` et `dashboard` : les noms des tables et des cellules nommées.

Après une modification, remplacez les fichiers hébergés et augmentez le numéro `?v=2.0.0` dans `src/taskpane.html` pour que les postes rechargent la nouvelle version.
Si une ancienne version reste affichée sur Mac, quittez Excel et videz le dossier `~/Library/Containers/com.microsoft.Excel/Data/Library/Application Support/Microsoft/Office/16.0/Wef/`.
