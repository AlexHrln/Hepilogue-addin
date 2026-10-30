# Hépilogue – Saisie (complément Excel)

Panneau latéral pour corriger et compléter le suivi des situations sans quitter le tableau de bord.
Il fonctionne dans Excel pour Microsoft 365 sur Mac, Windows et le web, sur le classeur partagé dans SharePoint.

## Ce que fait le panneau

**Saisie**
- *Paiements* (BDD_Paiements) et *Avancement* (BDD_Avancement) de l'opération et du mois affichés, groupés par lot et par mandataire, sous-traitants en retrait.
- Fiche de chaque ligne : cartouche d'identification, montants HT présentés en matrice par taux de TVA (5,5 / 10 / 20 %), retenues, montant payé, statut.
- Saisie à la française (`12 345,67`) ou par calcul (`=1000*1,2`).
- Contrôles en direct, alignés sur les règles des prompts d'extraction : part propre ≤ avancement total, part propre = total − sous-traitants du mois, retenues négatives, montant payé manquant, coefficient déclaré ≠ coefficient calculé, doublons, indices BT manquants.
- Signalement des lignes **invisibles dans le tableau de bord** (couple entreprise / lot ou mandataire / lot absent de BDD Entreprises).
- Vérification du net à payer lue directement dans le tableau de bord (net calculé / net déclaré).
- Créer, dupliquer, ajouter un sous-traitant du mois à partir de la ligne du mandataire, supprimer, afficher la ligne dans Excel.
- Une ligne corrigée passe au statut « Corrigé » (modifiable avant d'enregistrer).

**Référentiel**
- *Lots* (BDD_Marches) et *Entreprises* (BDD_ST) de l'opération.
- Renommer un lot ou une entreprise propose de reporter le nouveau libellé dans toutes les tables de l'opération, pour que rien ne se détache du tableau de bord.
- *Indices BT* : grille éditable ; les cases vides utilisées par des situations sont surlignées.
- *Nouvelle opération* : assistant qui crée les lots, leurs titulaires (mandataires) et l'inscrit dans la liste des opérations reconnues par l'extraction. Une liste de lots peut être collée depuis Excel (Lot ⇥ Base 5,5 % ⇥ Base 10 % ⇥ Base 20 % ⇥ Titulaire).

**Contrôles**
- *Anomalies* du mois ou de toute l'opération, classées « À corriger », « À vérifier », « Pour information » ; un clic ouvre la ligne.
- *Validation du mois* : net à payer validé et commentaire par mois (voir plus bas).

**Journal**
- Chaque écriture est tracée dans la feuille masquée « Journal saisie » : date, initiales, table, ligne, champ, valeur avant et après.
- Une ligne supprimée peut être restaurée depuis le journal.
- L'historique d'une ligne s'affiche aussi en bas de sa fiche.

**Lien avec la sélection Excel**
- Cliquer sur une ligne du tableau de bord (mandataire, sous-traitant ou mois) affiche un bandeau « Modifier » / « Valider ».
- Cliquer dans une ligne d'une table BDD propose de l'ouvrir dans le panneau.

## Ce que le panneau garantit

- Les colonnes calculées (formules de table) ne sont jamais écrites ; les formules sont recopiées sur les lignes créées.
- Avant chaque écriture, la table est relue et la ligne est retrouvée par ses valeurs : un tri ou un ajout de lignes par un collègue ne fait pas écrire au mauvais endroit.
- En co-édition, si quelqu'un a modifié la même valeur pendant votre saisie, le panneau demande laquelle garder.
- Seules les cellules modifiées sont écrites. Les textes qui ressemblent à des nombres ou des dates (n° de facture `25-02-34`, `2605E035`) restent du texte.
- La structure des tables existantes n'est pas modifiée (aucune colonne ajoutée) : le flux Power Automate n'est pas concerné.
- Aucune donnée ne quitte le classeur : le panneau est une page web statique qui lit et écrit dans Excel. **Ne déposez jamais le classeur dans le dossier hébergé.**

Feuilles créées par le panneau : « Journal saisie » (masquée, à la première modification) et « BDD Validations » (seulement si vous activez la validation du mois).

## Contenu du dossier

```
manifest.xml          déclaration du complément (adresse à adapter)
configurer.sh         crée manifest-production.xml avec votre adresse
support.html          page d'aide référencée par le manifeste
assets/               icônes du ruban
src/taskpane.html     le panneau
src/commands.html     page technique exigée par le manifeste
src/css/              mise en forme
src/js/00-config.js   tout ce qui dépend de la structure du classeur
src/js/…              accès Excel, contrôles, écrans
```

## Mise en service

### 1. Héberger les fichiers en HTTPS

Le panneau est un petit site statique. Deux options :

**Option A — GitHub Pages (sans ligne de commande)**
1. Sur github.com, créez un dépôt `hepilogue-addin` (public : seul le code est publié, aucune donnée).
2. « Add file » › « Upload files » : glissez tout le contenu du dossier (assets, src, manifest.xml, support.html…).
3. « Settings » › « Pages » › « Deploy from a branch », branche `main`, dossier `/ (root)`.
4. Votre adresse est `https://<compte>.github.io/hepilogue-addin`. Vérifiez que `…/src/taskpane.html` s'ouvre dans un navigateur (il affiche « Ce complément fonctionne dans Excel »).

**Option B — Azure Static Web Apps (reste dans l'environnement Microsoft)**
1. Portail Azure › Static Web Apps › Créer, plan « Free », source « Other ».
2. Copiez le jeton de déploiement (« Manage deployment token »).
3. Dans le Terminal du Mac, depuis le dossier : `npx @azure/static-web-apps-cli deploy ./ --deployment-token <jeton> --env production`
4. Votre adresse est `https://<nom>.azurestaticapps.net`.

SharePoint ne convient pas à l'hébergement : les bibliothèques SharePoint Online téléchargent les fichiers `.html` au lieu de les afficher.

### 2. Adapter le manifeste

Dans le Terminal :
```
cd ~/Downloads/hepilogue-addin
./configurer.sh https://<compte>.github.io/hepilogue-addin
```
Le fichier `manifest-production.xml` est créé. À défaut, ouvrez `manifest.xml` dans TextEdit et remplacez toutes les occurrences de `https://localhost:3000` par votre adresse.

### 3. Tester sur votre Mac (sur une copie du classeur)

1. Quittez Excel.
2. Finder › Aller › Aller au dossier : `~/Library/Containers/com.microsoft.Excel/Data/Documents/`. Créez-y un dossier `wef` s'il n'existe pas et copiez-y `manifest-production.xml`.
3. Rouvrez Excel et la copie du classeur. Onglet Insertion › Compléments › Mes compléments : « Hépilogue – Saisie » apparaît dans la liste déroulante. Le bouton **Saisie** s'ajoute ensuite à l'onglet Accueil.

### 4. Déployer pour l'équipe

1. admin.microsoft.com › Paramètres › Applications intégrées › Charger des applications personnalisées.
2. Type « Complément Office », chargez `manifest-production.xml`.
3. Choisissez les utilisateurs ou un groupe, acceptez les autorisations, déployez.
4. Le bouton **Saisie** apparaît dans l'onglet Accueil d'Excel pour chacun, sous quelques heures (24 h au plus).
5. Retirez alors le manifeste du dossier `wef` de votre Mac pour éviter un doublon.

Option utile : menu ⋯ du panneau › « Ouvrir le panneau à l'ouverture du classeur ». Le panneau s'ouvrira alors avec ce fichier pour toutes les personnes qui ont le complément.

## Validation du net à payer

Dans le tableau de bord, « NET A PAYER TTC VALIDÉ » et « COMMENTAIRE » (colonnes D et E) sont saisis à la main à côté d'une liste de mois qui dépend de l'opération affichée. En changeant d'opération, ces saisies restent sur les mêmes lignes et se retrouvent en face d'autres mois.

Contrôles › Validation du mois › « Créer la table et relier le tableau de bord » :
- crée la table `BDD_Validations` (Opération, Mois, Net validé, Commentaire, Validé par, Date) ;
- reprend les valeurs déjà saisies pour l'opération affichée (après confirmation) ;
- remplace D9:E32 par des formules qui lisent la table.

Les validations se font ensuite depuis le panneau (ou le bandeau qui apparaît en cliquant sur un mois du tableau de bord).

## Mettre à jour le complément

- **Code du panneau** (`src/`) : remplacez les fichiers hébergés et augmentez le numéro `?v=1.0.0` dans `src/taskpane.html` pour forcer le rechargement. Inutile de redéployer le manifeste.
- **Manifeste** (nom, bouton, adresse) : augmentez `<Version>` (par exemple `1.0.1.0`), puis mettez l'application à jour dans le centre d'administration.
- **Ancienne version affichée sur Mac** : quittez Excel et videz `~/Library/Containers/com.microsoft.Excel/Data/Library/Application Support/Microsoft/Office/16.0/Wef/`.

## Si le classeur évolue

Tout ce qui dépend du classeur est dans `src/js/00-config.js` : noms des tables, libellés des champs, organisation des fiches, repères du tableau de bord.
- Une nouvelle colonne de saisie ajoutée à une table apparaît automatiquement dans la fiche, rubrique « Autres colonnes ».
- Une nouvelle colonne calculée est détectée et laissée intacte.
- Si une table ou une colonne utilisée par le panneau est renommée, reportez le nouveau nom dans ce fichier.

## Bon à savoir

- L'opération et le mois du tableau de bord (C2 et C3) sont partagés entre tous les utilisateurs du fichier. Le panneau les lit ; il ne les modifie que si vous cliquez sur l'icône de lien à côté des listes.
- Les initiales demandées à la première modification sont conservées sur le poste.
- Les alertes n'empêchent pas d'enregistrer : en cas d'erreur, une confirmation est demandée.
- Une cellule Excel en cours de saisie bloque les écritures : validez-la (Entrée) puis réessayez.

## Constats sur le classeur actuel

- **Révision** : dans BDD_Paiements, l'indice 1 est lu au mois N-3 (date de réception − 3 mois) mais l'indice 2 au mois de réception ; dans BDD_Avancement, les deux indices sont lus au mois de réception. À rapprocher des clauses des marchés.
- **Indices BT** : les recherches (`MATCH` sans dernier argument) sont approchées. Un indice non saisi donne 0 et un coefficient de 0,15 sans message d'erreur. Le panneau signale ces cas.
- **Opérations reconnues par l'extraction** : deux des trois opérations présentes dans BDD Marchés manquent dans la feuille masquée « Liste des opérations ». À vérifier si le flux s'appuie encore sur cette liste.
