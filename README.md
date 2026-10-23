# Histoires

Application web installable (PWA) pour jouer des histoires interactives avec une IA. Tout tourne dans le navigateur : les scénarios, l'historique et la mémoire sont stockés localement (IndexedDB), les requêtes partent directement vers le fournisseur d'IA choisi.

## Mise en ligne (GitHub Pages)

1. Déposer à la racine du dépôt : `index.html`, `sw.js`, `manifest.json`, les trois icônes.
2. Copier `index.yml` dans `.github/workflows/index.yml`.
3. Réglages du dépôt, Pages, Source : **GitHub Actions**.

Le workflow génère `index.json` (liste des fichiers de `scenarios/`) à chaque push. L'application le lit en priorité, ce qui évite la limite de 60 requêtes par heure de l'API GitHub et fonctionne avec un domaine personnalisé. Sans `index.json`, elle interroge l'API GitHub (dépôt déduit de l'URL, ou saisi dans Réglages IA).

## Structure des scénarios

```
scenarios/
  Mon scenario/
    systeme.md              prompt système (obligatoire)
    cover.webp              couverture (optionnelle)
    etat.md                 champs du panneau d'état (optionnel)
    avatar.md               description du personnage du joueur
    personnages/
      Alice/
        fiche.md            fiche du personnage
        sourire.webp        image, code : alice_sourire
    lorebook/
      dragon.md
```

Le nom du dossier devient le nom du scénario. Le texte peut contenir `{{user}}` (nom du joueur).

### Images

Les images de `personnages/<Nom>/` (formats `.png`, `.webp`, `.jpg`, `.jpeg`, `.gif`) sont proposées à l'IA sous le code `nom_fichier` (minuscules, sans extension). L'IA les affiche avec `{{img::alice_sourire}}` seul sur une ligne.

La reconnaissance du code est tolérante : majuscules, accents, espaces, tirets et tirets bas sont équivalents (`alice_sourire heureux`, `alice_sourire_heureux` et `Alice-Sourire-Heureux` désignent le même fichier), et le nom du fichier seul suffit s'il est unique (`sourire_heureux`). Quand un code ne correspond à aucune image, un repère « image introuvable : code » s'affiche à la place, au lieu de ne rien montrer.

Après avoir renommé des images :

- Les anciens messages gardent les anciens codes : ils afficheront le repère « image introuvable ». Modifiez le message ou régénérez la réponse.
- Réglages du scénario (icône curseurs), section « Images détectées » : vignettes et codes exacts vus par l'application, avec le bouton « Recharger l'index » pour relire la liste des fichiers sans fermer l'application. L'index lui-même n'est régénéré qu'au déploiement GitHub (quelques dizaines de secondes après le push).

### Lorebook

Chaque fichier `.md` commence par des lignes d'en-tête, puis le texte à injecter :

```
mots-clés: dragon*, épée
priorité: 2

Le dragon dort dans la montagne.
```

- `mots-clés:` liste séparée par des virgules, sans accents ni casse. Recherche par mot entier ; `dragon*` accepte `dragons`, `dragonnet`…
- `toujours` : entrée toujours injectée, sans mot-clé.
- `priorité: N` : les valeurs les plus hautes passent en premier (défaut 0).

Dans les réglages du scénario (icône curseurs) : nombre de messages scannés (défaut 2) et nombre maximum d'entrées injectées.

## Apparence

Thème sombre inspiré des applications de fiction interactive : fond noir, accent vert citron, cartes de scénarios avec couverture, onglets de filtre, carte « Reprendre » pour la dernière histoire, choix de réponse sous forme de cartes et feuilles de réglages qui montent du bas.

Pour afficher une couverture, ajoutez une image `cover.webp` (ou `.png`, `.jpg`) dans le dossier du scénario : elle sert de vignette dans la liste et d'en-tête dans la conversation. Sans couverture, un visuel généré à partir du nom est utilisé.

## Lecture

Bouton « T » dans l'en-tête de la conversation (feuille Lecture) :

- **Taille du texte** de 14 à 30 px, avec aperçu. Le réglage est conservé sur l'appareil.
- **Défilement pendant la réponse** : par défaut, l'écran ne suit pas le texte pendant que l'IA écrit. Le début de la nouvelle réponse se place en haut de l'écran, puis l'écran ne bouge plus et ne saute pas en bas à la fin. Si vous faites défiler vous-même, l'application ne vous ramène jamais en bas, et le bouton flèche permet d'y aller quand vous voulez. L'option « Suivre le texte pendant l'écriture de l'IA » rétablit le défilement automatique.
- **Mode lecture** : masque les boutons des messages, la saisie, les choix, le panneau d'état et les réglages. Il reste le retour, le bouton Lecture et une barre flottante (lire ou mettre en pause, arrêter, A−, A+, quitter). Le mode lecture n'est pas conservé : il se désactive en quittant la conversation.
- **Lecture à voix haute** : un bouton haut-parleur sous chaque message lit ce message. En mode lecture, toucher un message lit la suite de l'histoire (réponses de l'IA seulement), et le bouton Lire de la barre démarre depuis le haut de l'écran. Le texte lu est nettoyé (sans astérisques, état ni choix) et `{{user}}` est remplacé par le nom du joueur.
- Réglages de la voix : choix de la voix (les voix françaises en premier), vitesse de 0,6 à 1,6, bouton pour écouter un exemple, et lecture automatique des nouvelles réponses.

Limites : la synthèse vocale est celle de l'appareil, donc les voix disponibles et leur qualité varient. Elle se met en pause en coupant puis en relisant le morceau en cours (phrase ou deux), ce qui fonctionne partout. Sur iPhone, le navigateur exige un premier toucher pour parler : la lecture automatique peut rester muette tant que vous n'avez pas lancé une lecture une fois.

## Budget de tokens

Pour un modèle qui refuse les requêtes trop grosses (par exemple 8000 tokens), renseignez dans Réglages IA :

- **Limite de tokens de l'IA** : le maximum accepté par le modèle, entrée et réponse comprises (par exemple 8000).
- **Réserve pour la réponse** : la place gardée pour la réponse de l'IA (1000 par défaut). Si la longueur maximale du scénario est renseignée, elle sert de réserve pour ce scénario. La réserve est plafonnée à la moitié de la limite.

L'entrée est limitée à « limite − réserve » (7000 avec 8000 et 1000). À chaque envoi, l'application garde toujours le prompt système et votre dernier message, puis ajoute les messages récents en partant du plus récent, tant qu'ils tiennent : les plus anciens ne sont pas envoyés. La suite envoyée commence toujours par un message du joueur.

Quand au moins 6 messages ne sont plus envoyés, ils sont résumés dans la mémoire (requête de résumé limitée au même budget), pour que l'IA n'en perde pas le fil. Le compteur sous la conversation indique par exemple « ≈ 6 953 / 7 000 tokens envoyés · 4 anciens messages non envoyés ». Si le prompt de base (système, fiches, lorebook, mémoire) dépasse à lui seul la limite, le compteur passe en rouge : réduisez ces éléments.

Le décompte est une estimation prudente (environ 3,2 caractères par token, plus 4 tokens par message). Si le fournisseur refuse encore des requêtes, baissez un peu la limite.

## Panneau d'état

L'IA peut suivre l'état du jeu (lieu, santé, argent, humeur…). À chaque réponse elle ajoute un bloc `<etat>` (masqué dans le texte) que l'application affiche dans un panneau sous le titre : deux pastilles repliées, tous les champs une fois ouvert, avec une barre pour les valeurs de la forme `72/100`. L'état précédent est renvoyé à l'IA à chaque tour pour assurer la cohérence.

Activation : Réglages du scénario, « Panneau d'état », puis la liste des champs (séparés par des virgules ou des lignes). Pour un scénario GitHub, un fichier `etat.md` (par exemple `Lieu, Santé (0/100), Argent, Humeur`) active le panneau par défaut.

## Fonctions

- Réponses en streaming (avec diagnostic dans les réglages), trois choix de réponse proposés, bouton annuler.
- Variantes de réponse (flèches ‹ ›) en régénérant, bouton « continuer » (double chevron) pour prolonger une réponse coupée.
- Modifier, copier ou supprimer à partir d'un message (corbeille). La suppression est immédiate, avec un bouton « Annuler » pendant 7 secondes tant que la conversation n'a pas changé.
- Le bouton stop (et la sortie de la conversation) conserve le texte déjà reçu, que « Continuer » peut prolonger.
- Mémoire : résumé automatique, souvenirs, note utilisateur (icônes marque-page et crayon). Nombre de souvenirs injectés réglable.
- Température et Top P : globaux (Réglages IA) ou par scénario.
- Liste des modèles du fournisseur (Réglages IA, Lister les modèles).
- Budget de tokens : limite réglable et estimation des tokens envoyés dans le compteur sous la conversation (voir ci-dessous).
- Recherche dans la liste, export d'une histoire en `.md`, sauvegarde JSON (clés API exclues) avec rappel tous les 30 jours, synchronisation en ligne (GitHub ou Google Drive).
- Bouton retour du téléphone géré, fonctionnement hors ligne.

## Sauvegarde en ligne

Les histoires restent d'abord sur l'appareil. La sauvegarde en ligne les copie dans un fichier JSON et les synchronise entre vos appareils. Réglages IA, Sauvegarde en ligne (ou icône nuage de la liste).

Fonctionnement : à chaque synchronisation, l'application télécharge le fichier distant, garde pour chaque scénario la version la plus récente, applique les suppressions, puis renvoie le résultat. Rien n'est écrasé à l'aveugle. Un fichier distant illisible n'est jamais remplacé. Les clés API ne sont pas sauvegardées. La synchronisation se lance à l'ouverture, en quittant une conversation, en quittant l'application et au toucher du nuage. Elle repose sur l'horloge des appareils : gardez-les à l'heure.

### En cas d'erreur ou de mauvaise configuration

- Si la dernière synchronisation a échoué, un **point rouge** apparaît sur le nuage. Touchez le nuage : le message d'erreur propose « Modifier la configuration ».
- Après « Enregistrer », la synchronisation se lance tout de suite et affiche son résultat (« Sauvegarde à jour » ou l'erreur).
- La configuration est aussi accessible par la roue dentée (Réglages IA), premier bouton « Sauvegarde en ligne… ».
- « Effacer la configuration » remet le service, le jeton et la connexion Google à zéro sur l'appareil. Les histoires et le fichier de sauvegarde en ligne ne sont pas touchés.

### GitHub (recommandé)

1. Créez un dépôt **privé** dédié, par exemple `sauvegardes`, avec un fichier README pour l'initialiser.
2. GitHub, Settings, Developer settings, Personal access tokens, Fine-grained tokens : créez un jeton limité à ce seul dépôt, permission **Contents : Read and write**.
3. Dans l'application : service GitHub, dépôt `proprietaire/sauvegardes`, jeton, Enregistrer.

Le jeton est stocké en clair dans le navigateur de l'appareil, comme les clés API. Un jeton limité à un dépôt de sauvegarde ne donne accès à rien d'autre. Chaque synchronisation avec changement crée un commit dans ce dépôt.

### Google Drive

Le fichier est placé dans le dossier caché de l'application sur votre Drive.

1. Google Cloud Console : créez un projet et activez **Google Drive API**.
2. Écran de consentement OAuth : type Externe, ajoutez votre compte comme utilisateur de test, scope `.../auth/drive.appdata`.
3. Identifiants, Créer des identifiants, ID client OAuth, Application Web. Dans Origines JavaScript autorisées, ajoutez l'adresse de l'application (`https://proprietaire.github.io`).
4. Copiez l'ID client dans l'application : service Google Drive, Enregistrer, puis touchez le nuage.

Limites : la connexion Google dure environ une heure, au-delà de laquelle il faut toucher le nuage pour se reconnecter, et la synchronisation automatique à l'ouverture ne fonctionne que si la connexion est encore valide. Dans une application installée sur iPhone, la fenêtre de connexion Google peut ne pas s'ouvrir : préférez GitHub.

## Structure du code

```
index.html          structure de la page (aucun style ni script en ligne)
css/style.css       tout le style
js/
  main.js           point d'entrée : charge les modules, démarre l'application
  state.js          réglages (S), scénario ouvert et état de l'interface (app), contexte (ctx), images (IMG)
  util.js           petits outils : sélecteur $, échappement, dates, boîtes de dialogue, notifications
  store.js          base locale (IndexedDB) : scénarios, réglages, import validé
  scenarios.js      scénarios GitHub : arbre de fichiers, couvertures, personnages, images, lorebook
  prompt.js         construction du prompt : mémoire, lorebook, consignes de choix
  ai.js             appel au fournisseur d'IA (streaming) et résumé de mémoire
  format.js         mise en forme du texte (Markdown léger, images, choix, état)
  read.js           lecture : taille du texte, mode lecture, lecture à voix haute
  chat.js           conversation : affichage, envoi, variantes, suppression, continuation
  list.js           liste des scénarios : recherche, onglets, menu, création
  nav.js            navigation (bouton retour du téléphone)
  settings.js       réglages du scénario, mémoire, note, réglages IA, import
  backup.js         export, synchronisation GitHub / Google Drive
  boot.js           garde-fou de démarrage : alerte et bouton Réparer si un fichier manque
  reparer.js        script de la page reparer.html
reparer.html        page de réparation (vide les caches, garde les histoires)
sw.js               service worker (hors ligne)
```

Règles du projet :

- Les fichiers sont des modules ES (`import` / `export`) : chacun déclare ce qu'il utilise. Aucun script en ligne.
- L'état partagé qui change vit dans `state.js` (`app.cur`, `app.busy`…). Les autres variables restent locales à leur module.
- Un module ne doit appeler aucune fonction d'un autre module au moment du chargement, seulement dans des gestionnaires d'événements ou des fonctions. Cela permet aux modules de se référencer entre eux (par exemple `list.js` et `nav.js`) sans erreur.
- Pour tester en local, servez le dossier avec un serveur HTTP (`python3 -m http.server`), car les modules ne se chargent pas depuis `file://`.
- Quand vous ajoutez un fichier JavaScript, ajoutez-le à la liste de `sw.js` et aux balises `modulepreload` de `index.html`.
- À chaque déploiement, changez ensemble le numéro de cache de `sw.js` (`histoires-vN`), `app-version` dans `index.html` et `VERSION` dans `js/main.js`. Les fichiers de l'application sont servis depuis le cache puis mis à jour en arrière-plan : sans nouveau numéro, les changements n'apparaissent qu'au deuxième chargement.

## Déploiement et dépannage

**Déployez toujours tous les fichiers ensemble**, y compris les nouveaux : `index.html`, `sw.js`, `manifest.json`, les icônes, `reparer.html`, le dossier `css/` et tout le dossier `js/`. L'application est découpée en modules : il suffit qu'un seul fichier manque ou ne soit pas à jour pour que rien ne démarre (page vide, boutons sans effet).

Protections intégrées :

- Si un fichier est introuvable, une alerte « L'application ne démarre pas correctement » nomme le fichier fautif et propose **Réparer**.
- Si la page et les scripts sont de versions différentes, une alerte « Mise à jour incomplète » le signale et l'application reste utilisable autant que possible.
- Le service worker refuse d'installer une nouvelle version dont un fichier manque : l'ancienne version continue de fonctionner.

Si l'application ne répond plus malgré tout :

1. Vérifiez sur GitHub que tous les fichiers sont présents (ouvrez `js/read.js`, `js/boot.js`… dans votre dépôt) et que le déploiement est terminé.
2. Ouvrez `https://votre-adresse/reparer.html` et touchez **Réparer** : cela supprime les copies d'application en cache sur l'appareil puis rouvre l'application. **Vos histoires et vos réglages ne sont pas effacés.**
3. N'utilisez pas « Effacer les données du site » dans le navigateur : cela supprime aussi vos histoires stockées sur l'appareil (sauvegardez-les d'abord avec la synchronisation ou l'export).

## Politique de sécurité (CSP)

`index.html` contient une politique de sécurité qui limite les scripts à ceux de l'application et les connexions réseau aux services connus (fournisseurs d'IA, GitHub, Google). Conséquence : pour ajouter un fournisseur d'IA ou un autre service, ajoutez son adresse à `connect-src` dans cette balise, sinon le navigateur bloquera les requêtes. Une erreur « Refused to connect » dans la console du navigateur indique ce cas.

## Streaming

Le texte s'affiche au fur et à mesure quand le fournisseur le diffuse. Si ce n'est pas le cas, Réglages IA indique comment la dernière réponse est arrivée : diffusée en N morceaux, reçue d'un seul bloc (le service ne diffuse pas) ou streaming désactivé. Les modèles « à raisonnement » réfléchissent avant de répondre : l'application affiche alors « Réflexion… » et le texte n'apparaît qu'ensuite.

## Sécurité

La clé API est stockée en clair dans le navigateur de l'appareil et envoyée uniquement au fournisseur choisi. Ne l'utilisez pas sur un appareil partagé. Elle n'est jamais incluse dans les sauvegardes.
