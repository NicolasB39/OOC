# Nocturne

Application web installable (PWA) pour jouer des histoires interactives avec une IA. Tout tourne dans le navigateur : les scénarios, l'historique et la mémoire sont stockés localement (IndexedDB), les requêtes partent directement vers le fournisseur d'IA choisi.

## Mise en ligne (GitHub Pages)

1. Déposer à la racine du dépôt tous les fichiers de l'application (voir « Structure du code »).
2. Copier `index.yml` dans `.github/workflows/index.yml`.
3. Réglages du dépôt, Pages, Source : **GitHub Actions**.

Le workflow lance les tests (`npm test`), puis `npm run build`, qui calcule un numéro de version à partir du contenu des fichiers et met à jour tout seul le service worker, les préchargements et les numéros de version. Il échoue si `index.html` contient un identifiant dupliqué, un `label for=` orphelin, si un module vise un élément absent de la page, ou si une règle CSS fixe `display` sur une feuille (`dialog`) sans viser `[open]` : une feuille fermée reprendrait alors sa place dans le flux et allongerait la page.

Le workflow génère aussi `index.json` (liste des fichiers de `scenarios/`) à chaque push. L'application le lit en priorité, ce qui évite la limite de 60 requêtes par heure de l'API GitHub et fonctionne avec un domaine personnalisé. Sans `index.json`, elle interroge l'API GitHub (dépôt déduit de l'URL, ou saisi dans Réglages).

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

Le nom du dossier devient le nom du scénario. Le texte peut contenir `{{user}}` (nom du joueur). N'y écrivez pas de consignes sur le format des blocs `<etat>` ou `<choix>` : voir « Protocole et préambule ».

### Fiches de personnages

Une fiche peut commencer par des lignes d'en-tête, comme le lorebook :

```
résumé: herboriste du village, amie d'enfance du joueur
mots-clés: herboriste, apothicaire
toujours: non

Alice a trente ans, les mains tachées de sève…
```

L'IA reçoit **en permanence** la liste de tous les personnages du monde, une ligne chacun (le `résumé:`, ou à défaut la première ligne de la fiche). Elle sait donc toujours qui existe et peut faire entrer qui elle veut.

La **fiche complète** n'est envoyée que lorsque le personnage est en scène : son nom ou un de ses mots-clés apparaît dans les six derniers messages ou dans le panneau d'état. `toujours: oui` force l'envoi permanent, pour un compagnon de route par exemple. Les codes d'images suivent la même règle : seuls ceux des personnages en scène sont proposés.

Tant que l'ensemble des fiches tient dans un petit budget, aucune n'est filtrée : un scénario à deux ou trois personnages se comporte exactement comme avant.

### Images

Les images de `personnages/<Nom>/` (formats `.png`, `.webp`, `.jpg`, `.jpeg`, `.gif`) sont proposées à l'IA sous le code `nom_fichier` (minuscules, sans extension). L'IA les affiche avec `{{img::alice_sourire}}` seul sur une ligne.

L'application affiche l'image **là où le modèle l'écrit**, en tête, au milieu ou à la fin. C'est donc la consigne qui décide : le protocole demande de la placer à l'endroit du récit qu'elle illustre et de ne pas ouvrir systématiquement la réponse par une image, et la liste des codes envoyée à chaque tour le rappelle. Si un scénario demande lui-même « commence par l'image » dans son prompt système, cette phrase l'emporte, et c'est à elle qu'il faut toucher. Les messages déjà écrits gardent leurs images où elles sont ; seules les nouvelles réponses suivent la nouvelle consigne.

La reconnaissance du code est tolérante : majuscules, accents, espaces, tirets et tirets bas sont équivalents (`alice_sourire heureux`, `alice_sourire_heureux` et `Alice-Sourire-Heureux` désignent le même fichier), et le nom du fichier seul suffit s'il est unique (`sourire_heureux`). Quand un code ne correspond à aucune image, un repère « image introuvable : code » s'affiche à la place, au lieu de ne rien montrer.

Après avoir renommé des images :

- Les anciens messages gardent les anciens codes : ils afficheront le repère « image introuvable ». Modifiez le message ou régénérez la réponse.
- Réglages du scénario (menu « … »), section « Images détectées » : vignettes et codes exacts vus par l'application, avec le bouton « Recharger l'index » pour relire la liste des fichiers sans fermer l'application. L'index lui-même n'est régénéré qu'au déploiement GitHub (quelques dizaines de secondes après le push).

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

Dans les réglages du scénario (menu « … », section « Mémoire et lorebook ») : nombre de messages scannés (défaut 2) et nombre maximum d'entrées injectées.

## Protocole et préambule

L'application est propriétaire du **protocole** : les formats du bloc `<etat>`, du bloc `<choix>` et de la syntaxe `{{img::}}` sont produits par `js/protocol.js`, pas par les scénarios. Un `systeme.md` ne décrit donc plus que la fiction : le monde, la voix, le registre, le rythme.

Conséquences :

- Faire évoluer un format se fait en un seul endroit, pour tous les scénarios à la fois.
- Le protocole peut s'adapter au modèle. Réglages, « Consignes de format » : **Automatique** choisit des consignes détaillées pour les modèles moyens et concises pour les gros, **Détaillées** et **Concises** forcent l'un ou l'autre. Le mode concis raccourcit les consignes et supprime le rappel de fin, ce qui économise environ 250 caractères par requête.
- Si un `systeme.md` contient encore `<choix>`, `<etat>` ou `{{img::`, l'application le signale à l'ouverture de la conversation et dans la feuille Scénario : l'IA recevrait deux versions du même format, et arbitrerait mal. Retirez ces lignes.

Le **préambule commun** (Réglages) est votre texte à vous, ajouté au prompt système de tous les scénarios : longueur des réponses, personne, registre, manies de narration. Un scénario peut s'en affranchir avec « Ignorer le préambule commun » dans sa section Narration.

Ce qui reste au scénario : tout ce qui touche à la voix. Ce qui passe à l'application : tout ce qui touche à la forme des blocs.

## Apparence

Thème sombre inspiré des applications de fiction interactive : fond noir, accent laiton, cartes de scénarios avec couverture, onglets de filtre, carte « Reprendre » pour la dernière histoire, choix de réponse sous forme de cartes et feuilles de réglages qui montent du bas.

La conversation, elle, **n'utilise pas de bulles** : chaque tour occupe la largeur de la colonne et un filet le sépare du suivant, pour qu'une longue partie se lise comme une page plutôt que comme une messagerie. Le tour du joueur se distingue par son alignement à droite. Le texte entre astérisques (`*un geste*`) s'affiche en gris, la parole en blanc : c'est le même deux-tons dans le récit et dans les suggestions de réponse.

Les deux ronds en bas à droite sautent d'un tour au précédent ou au suivant ; ils disparaissent dès qu'on atteint le bas du fil, là où ils ne serviraient qu'à masquer les propositions de réponse. Le bouton `✱` du composer encadre la sélection d'astérisques.

Le laiton `#e8b45c` est réservé aux **actions** : bouton « Nouveau », « Reprendre », boutons Enregistrer. Les **états** (onglet actif, badge « Nouveau », avertissement) n'en prennent qu'une version teintée, bordée, sur fond sombre, pour qu'un badge ne pèse pas autant qu'un bouton. Le rouge `#ff6b6b` reste réservé aux erreurs et aux actions destructrices. Les surfaces s'étagent du fond vers les cartes, les champs et les menus, et les contrôles (champ de saisie, listes, cartes de choix) portent une bordure plus claire que les simples séparateurs, pour rester visibles en plein soleil.

La marque est un **croissant posé sur une ligne d'horizon**. Elle vit à trois endroits qui doivent rester d'accord : le symbole `#i-logo` dans `index.html` (en-tête de la liste et écran vide), les cinq `icon-*.png` qui en sont le rendu en laiton sur le fond, et la variable CSS `--ast`, le même tracé en masque, qui dessine le motif des vignettes sans couverture. Si l'accent ou le dessin change, les cinq PNG sont à régénérer, sans quoi l'icône d'accueil jurera avec l'application.

Pour afficher une couverture sur un scénario GitHub, ajoutez une image `cover.webp` (ou `.png`, `.jpg`) dans son dossier. Pour un scénario créé dans l'application, choisissez une image dans ses réglages : elle est réduite à 600 px de large et convertie en WebP avant d'être stockée sur l'appareil. Elle sert de vignette dans la liste et d'en-tête dans la conversation. Sans couverture, un visuel est généré à partir du nom : teinte, position du croissant (quatre géométries) et initiale du titre en grand, pour que deux scénarios voisins ne se ressemblent pas.

Les onglets de filtre affichent le nombre de scénarios qu'ils contiennent, et la navigation entre la liste et une conversation passe par un fondu (`startViewTransition`) là où le navigateur le gère.

Les cartes portent les étiquettes utiles : « Nouveau » pour une histoire jamais jouée, « Brouillon » quand un tour commencé attend dans la saisie, « Épinglé » pour celles qu'on garde en tête de liste (menu « … », Épingler). L'épinglage compte comme une modification : il se synchronise entre appareils.

Au clavier : `/` place le curseur dans la recherche, `Échap` quitte une conversation.

### Police du récit

Le récit est composé en **Literata** (SIL Open Font License, `fonts/LICENSE-Literata.txt`), embarquée dans l'application : deux fichiers variables de 80 ko, romain et italique, sous-ensemble latin complet (Latin-1, latin étendu A et B, additionnel) plus toute la ponctuation générale et les symboles utilisés par l'interface, mis en cache par le service worker. Sans elle, les piles système donnaient Georgia sur Android et Iowan sur iPhone, donc deux rendus différents du même texte. La police sans empattement reste celle du système, car elle ne sert qu'à l'interface.

### Nouveau scénario

« Nouveau » demande un nom, puis propose un point de départ : enquête contemporaine, fantasy de voyage, huis clos, ou page blanche. Le canevas choisi remplit le prompt système, qui s'ouvre aussitôt pour être réécrit. Les canevas ne décrivent que la fiction : aucun ne touche au protocole (voir « Protocole et préambule »).

Tant qu'aucune clé API n'est enregistrée pour le fournisseur courant, un bandeau le signale en haut de la liste et mène aux Réglages.

### Actions d'un message

Sous chaque message restent les actions qu'on utilise en lisant : écouter, et sur le dernier message régénérer, continuer et passer d'une variante à l'autre. Copier, modifier et supprimer à partir d'ici sont regroupés derrière le bouton « … », dans une feuille : moins de boutons au fil du texte, des cibles plus grandes, et plus de « supprimer » collé à « modifier ». La suppression reste annulable pendant quelques secondes.

### État et suggestions

L'état renvoyé par le modèle s'affiche en **carte sous chaque tour du narrateur**, avec les variations chiffrées depuis le tour précédent (`▲ +2`) et une jauge pour les valeurs bornées. Sur une longue partie, cela allonge le défilement : pour n'afficher la carte que sur le dernier tour, il suffit d'ajouter une condition `last` dans `stCard`.

Chaque suggestion de réponse se compose d'un crayon à gauche, dans son propre panneau, pour la reprendre dans la saisie, et d'une carte contenant le texte et la flèche d'envoi. Le texte de la carte est cliquable et envoie lui aussi.

Le protocole demande par défaut au modèle d'écrire **les gestes entre astérisques et les paroles en texte simple**, dans la narration comme dans les choix, puisque c'est ce que l'application met en gris et en blanc. La case « Demander les gestes entre astérisques » dans les options du scénario (section Narration) retire cette consigne pour un scénario qui veut imposer son propre style, y compris dans la consigne par défaut des choix.

### Statistiques d'utilisation

Le bouton en forme d'histogramme, dans l'en-tête de la liste, ouvre les **tokens consommés par modèle**, selon trois périodes : *Session* (depuis l'ouverture de l'application, jusqu'à sa fermeture complète), *Jour* et *Mois*. Pour les deux dernières, les flèches parcourent l'historique ; la vue du mois ajoute un histogramme jour par jour. Chaque modèle affiche son total, ses tokens en entrée et en sortie, et son nombre de requêtes, sous le nom du fournisseur.

L'usage est relevé à chaque requête réussie, narration comme mémoire, à partir du décompte renvoyé par le fournisseur. La sortie comprend les tokens de réflexion quand le fournisseur les compte dans son total. Si un fournisseur ne renvoie aucun décompte (c'est fréquent en streaming), la requête est **estimée** avec le même calcul que la jauge, et la feuille le signale (« 3 requêtes sont estimées »). Les requêtes refusées ou annulées sans texte ne comptent pas.

Les statistiques sont enregistrées sur l'appareil, dans un enregistrement à part des réglages, écrit avec un léger différé et à chaque mise en arrière-plan. Elles ne font partie ni de l'export en fichier ni de la sauvegarde en ligne, et ne se synchronisent donc pas entre appareils. « Effacer » les remet à zéro, sans toucher aux histoires. Un jour et un modèle occupent une centaine d'octets : l'historique n'est pas purgé.

### Repères dans le fil

Chaque message est horodaté à l'écriture. Quand plus de six heures ou un changement de jour séparent deux messages, une ligne discrète marque la coupure : une heure pour une reprise dans la journée, « hier », « aujourd'hui » ou la date pour un retour plus tardif. Les histoires écrites avant cette version n'ont pas d'horodatage et n'affichent donc aucune coupure tant qu'on ne les reprend pas.

En quittant une conversation, l'application retient le message en haut de l'écran et y revient à la réouverture, avec un bouton « Aller en bas ». Si vous étiez déjà en bas, rien n'est retenu.

### Pendant la génération

Au bout de trois secondes sans texte, le bloc en cours affiche « Réflexion… 12 s ». C'est surtout utile quand le streaming est coupé ou que le modèle raisonne avant de répondre : sans cela, rien ne bouge. Les messages d'état (pause de débit, mise à jour de la mémoire) s'affichent en pastille au bas du fil, par-dessus le texte, pour ne pas changer la hauteur de la zone de lecture ; seules les erreurs prennent leur place sous le fil. Un message d'état invisible, destiné aux lecteurs d'écran, annonce le début et la fin de la réponse, et l'auteur de chaque message est annoncé avant son texte.

## Personnages

Le bouton en forme de silhouettes, dans l'en-tête de la conversation, ouvre la fenêtre **Personnages** : une ligne par personnage du scénario, avec son portrait (sa première image, ou une pastille à son initiale), son nom et son résumé. Ceux qui sont nommés dans les six derniers messages passent en tête, avec l'étiquette « En scène », et le premier d'entre eux est déplié.

Toucher une ligne la déplie : la galerie de ses images (chacune s'ouvre en grand, avec le nom de l'expression tiré du nom de fichier) et **votre relation avec lui**, telle que la mémoire l'a retenue. Seul le résumé de la fiche (`résumé:`) est montré, jamais la fiche complète, qui est écrite pour l'IA et peut contenir des secrets.

En bas, **Personnes croisées** liste les relations mémorisées avec des gens qui n'ont pas de fiche, par exemple un aubergiste inventé par le modèle en cours de partie. Un scénario créé dans l'application, qui n'a pas de fiches, n'affiche que cette section.

Cette fenêtre ne coûte rien : elle n'interroge pas l'IA et ne change pas le prompt.

## Lecture

Section « Lecture » des Réglages (roue dentée de la liste, ou menu « … » de la conversation, puis Réglages). Ces réglages s'appliquent et s'enregistrent immédiatement, sans passer par « Enregistrer », et la ligne d'aperçu permet d'en juger, puisque la feuille floute la conversation derrière elle :

- **Taille du texte** de 14 à 30 px, **interlignage** de 1,4 à 2,1, **police du récit** (serif ou sans serif), **largeur de colonne** et **paragraphes**, avec aperçu. Les réglages sont conservés sur l'appareil.
- La largeur de colonne est une vraie mesure : elle vaut le nombre choisi multiplié par la taille du texte, donc agrandir le texte élargit la colonne et le nombre de caractères par ligne reste constant.
- **Paragraphes** : *Espacés* laisse un blanc entre les paragraphes, *Alinéa* les colle et décale la première ligne, comme dans un livre imprimé. Le récit est découpé en vrais paragraphes par l'application, l'espacement ne dépend donc plus des lignes vides écrites par le modèle. Les images portent une marge nulle : l'écart vient de leurs voisins, 3 px côté texte (qui s'ajoutent au demi-interligne de la ligne voisine) et 10 px entre deux images consécutives, pour qu'elles ne se touchent pas.
- **Défilement pendant la réponse** : par défaut, l'écran ne bouge pas pendant que l'IA écrit. À l'envoi, le fil descend une seule fois pour montrer votre message et l'indicateur de réflexion ; la réponse s'écrit ensuite en dessous, et le message définitif prend la place du texte provisoire sans décaler l'écran, images comprises. Le bouton flèche permet de descendre quand vous voulez. L'option « Suivre le texte pendant l'écriture de l'IA » rétablit le défilement automatique.
- **Mode lecture** (menu « … » de la conversation) : masque les boutons des messages, la saisie, les choix et les cartes d'état. Il reste l'en-tête et une barre flottante (lire ou mettre en pause, arrêter, A−, A+, quitter). Le mode lecture n'est pas conservé : il se désactive en quittant la conversation.
- **Lecture à voix haute** : un bouton haut-parleur sous chaque message lit ce message. En mode lecture, toucher un message lit la suite de l'histoire (réponses de l'IA seulement), et le bouton Lire de la barre démarre depuis le haut de l'écran. Le texte lu est nettoyé (sans astérisques, état ni choix) et `{{user}}` est remplacé par le nom du joueur.
- Réglages de la voix : choix de la voix (les voix françaises en premier), vitesse de 0,6 à 1,6, bouton pour écouter un exemple, et lecture automatique des nouvelles réponses.

Limites : la synthèse vocale est celle de l'appareil, donc les voix disponibles et leur qualité varient. Elle se met en pause en coupant puis en relisant le morceau en cours (phrase ou deux), ce qui fonctionne partout. Sur iPhone, le navigateur exige un premier toucher pour parler : la lecture automatique peut rester muette tant que vous n'avez pas lancé une lecture une fois.

## Budget de tokens

Les Réglages sont groupés : fournisseur, clé et modèles en haut, puis « Narration », « Budget de tokens » et « GitHub et sauvegarde » dans des sections repliées.

Pour un modèle qui refuse les requêtes trop grosses (par exemple 8000 tokens), renseignez dans « Budget de tokens » :

- **Limite de tokens de l'IA** : le maximum accepté par le modèle, entrée et réponse comprises (par exemple 8000).
- **Réserve pour la réponse** : la place gardée pour la réponse de l'IA (1000 par défaut). Si la longueur maximale du scénario est renseignée, elle sert de réserve pour ce scénario. La réserve est plafonnée à la moitié de la limite.

L'entrée est limitée à « limite − réserve » (7000 avec 8000 et 1000). À chaque envoi, l'application garde toujours le prompt système et votre dernier message, puis ajoute les messages récents en partant du plus récent, tant qu'ils tiennent : les plus anciens ne sont pas envoyés. La suite envoyée commence toujours par un message du joueur.

### Placement dans le prompt et cache du fournisseur

Les fournisseurs qui pratiquent le cache de prompt réutilisent le calcul d'un **préfixe exact**. Dès le premier caractère qui diffère, tout ce qui suit est recalculé. Chez certains, les tokens servis depuis le cache ne comptent pas dans la limite par minute, ce qui en fait le levier principal sur une offre gratuite.

L'application range donc le prompt par volatilité croissante :

```
système  prompt du scénario, préambule, casting, protocole, avatar
         résumé, lignes récentes, souvenirs, note        ← change par paliers
historique
queue    dernier message, lorebook, fiches, état précédent, rappel
```

Le choix du niveau suit un arbitrage simple. Un bloc placé avant l'historique est gratuit les tours où il ne bouge pas, mais le tour où il change, il invalide aussi tout l'historique. Pour un bloc de C tokens qui change tous les K tours avec un historique de H tokens, le remonter vaut le coup si `(C + H) / K < C`.

La mémoire change par paliers d'une dizaine de messages : elle est en haut, et les souvenirs partent tous (les plus récents, plafonnés par « Souvenirs injectés ») plutôt que triés par pertinence, pour qu'ils ne varient pas d'un tour à l'autre. Le lorebook et les fiches de personnages se déclenchent sur mots-clés et changent bien plus souvent : ils restent en queue, où ils n'invalident rien. L'état précédent et le rappel changent à chaque tour par nature.

Si votre fournisseur ne pratique pas le cache, ce placement ne change rien au total envoyé. Vous pouvez alors baisser « Souvenirs injectés » à 3 pour revenir à l'ancien volume.

La fenêtre n'avance pas d'un message à la fois : quand le budget est dépassé, elle recule d'un bloc, puis ne bouge plus pendant plusieurs tours. Le début du prompt reste ainsi identique d'un tour à l'autre, ce que les fournisseurs facturent moins cher et comptent moins dans les quotas par minute.

Quand au moins 6 messages ne sont plus envoyés, ils sont résumés dans la mémoire, pour que l'IA n'en perde pas le fil. Le compteur sous la conversation indique par exemple « ≈ 6 953 / 7 000 tokens envoyés (réel : 7 012) · 10 messages envoyés sur 16 », et une ligne « l'IA lit à partir d'ici » marque la limite dans le fil. Si le prompt de base dépasse à lui seul la limite, le compteur passe en rouge.

Le compteur et la jauge de débit sont **masqués par défaut** : on lit une histoire, pas un tableau de bord. « Afficher les compteurs sous la conversation » (Réglages, section « Budget de tokens ») les rend permanents. Masqués, ils réapparaissent d'eux-mêmes dans les deux cas où ils servent : prompt de base au-dessus de la limite, et envoi qui doit attendre la minute suivante.

### Jauge de débit

Sous le compteur, une barre indique les tokens restants dans la minute en cours : « 2 400 / 8 000 tokens par minute · prochain tour dans ~7 s ». Elle passe en rouge quand le tour suivant ne tient pas dans ce qui reste.

Deux sources, dans cet ordre. Si le fournisseur expose ses en-têtes `x-ratelimit-*` au navigateur, la jauge part de son chiffre exact et mémorise la limite. Entre deux réponses, elle ne recrédite que les tokens de vos propres requêtes qui viennent réellement de sortir de la fenêtre de soixante secondes, jamais un réapprovisionnement théorique. Sinon elle retombe sur une fenêtre glissante de soixante secondes calculée à partir des `usage` de vos propres requêtes, et le signale par « estimation locale ». Dans ce cas, renseignez « Tokens par minute du fournisseur » dans Réglages pour lui donner un plafond ; la valeur se corrigera toute seule si un jour les en-têtes arrivent.

Quand le tour suivant ne tient pas dans ce qui reste, l'application **attend d'elle-même** au lieu de partir dans une erreur de limite. Le décompte s'affiche sous la conversation (« envoi dans 55 s… »), rien n'est envoyé pendant ce temps, et le bouton d'arrêt annule l'attente et vous rend la main. Votre message reste dans la conversation, prêt à être renvoyé. L'attente s'applique aussi à la requête de mémoire, dont les tokens sont décomptés comme les autres.

Le compteur affiche aussi les tokens servis depuis le cache du fournisseur quand il les rapporte. C'est le moyen de vérifier que le préfixe stable du prompt est bien réutilisé : chez certains fournisseurs, les tokens en cache ne comptent pas dans la limite par minute.

Le suivi est tenu **par modèle**, parce que les limites le sont aussi : confier les résumés à un autre modèle lui donne son propre compteur, et la jauge de la narration n'en voit rien.

En cas de refus pour dépassement (429), l'application relance jusqu'à trois fois. Le délai est lu dans le message du fournisseur (« Please try again in 4.2s » ou « in 340ms »), à défaut dans l'en-tête `retry-after` ou `x-ratelimit-reset-tokens`, avec un minimum de 3 secondes et un plafond de 90. Le décompte est affiché pendant l'attente, y compris pour la requête de mémoire.

Deux messages distincts selon l'origine de l'attente : « Pause pour respecter la limite de débit du fournisseur » quand l'application temporise d'elle-même, avant l'envoi, parce que le tour ne tiendrait pas dans ce qui reste de la minute ; « Le fournisseur a refusé l'envoi » quand il a réellement répondu 429. Après un refus, la jauge est remise à zéro le temps de l'attente, puis rétablie dès qu'une réponse passe, même si le fournisseur n'expose pas ses en-têtes de débit.

Le décompte part de 3,4 caractères par token, puis **se calibre tout seul** : chaque réponse du fournisseur indique le nombre réel de tokens de l'entrée, et l'application ajuste son rapport caractères/token. La valeur courante s'affiche dans Réglages. Au bout de quelques messages, l'estimation colle au modèle que vous utilisez.

## Mémoire

La mémoire tient sur trois étages, du plus détaillé au plus condensé :

- **La fenêtre** : les derniers messages, envoyés mot pour mot.
- **Les lignes récentes** : une phrase par message sorti de la fenêtre, pour garder le détail immédiat sans payer le texte intégral. Les plus anciennes disparaissent au fur et à mesure, une fois absorbées par le résumé.
- **Le résumé** : le récit condensé de tout ce qui précède, plafonné pour ne pas gonfler avec le temps. Il est écrit en deux parties, « Événements » et « Situation actuelle » ; les souvenirs, les relations et l'objectif ont leurs propres champs et ne doivent pas y figurer.

À côté, deux listes : les **souvenirs** (faits durables) et les **relations** (une ligne par personnage, envoyée avec sa fiche quand il entre en scène). Les relations se consultent dans la fenêtre Personnages, pas dans la feuille Mémoire.

Les modèles reformulent : « Alice », « alice », « Alice, l'herboriste » désignent la même personne, et « la fiole est verte » revient sous la forme « La fiole verte est importante ». L'application rapproche donc les noms dont les mots se recouvrent, et les souvenirs dont le vocabulaire se recouvre à plus de 60 %. Dans les deux cas la formulation la plus récente remplace l'ancienne au lieu de s'y ajouter.

Les deux listes sont plafonnées : 12 relations, 60 souvenirs. Au-delà, les entrées les moins récemment mises à jour disparaissent, sauf les personnages qui ont une fiche dans `personnages/`, qui ne sont jamais évincés. Les figurants de passage finissent donc par sortir d'eux-mêmes. Le résumeur reçoit en plus la liste de ce qu'il connaît déjà, avec la consigne de reprendre les noms tels quels et de ne pas répéter les souvenirs acquis.

Certains modèles recopient pourtant ces sections dans le résumé, surtout quand ils décorent leurs intitulés (`**Souvenirs**`, `## Relations`). Comme le résumé est renvoyé au modèle à chaque mise à jour, l'erreur s'entretenait d'elle-même, et les mêmes souvenirs et relations partaient deux fois dans le prompt. L'application coupe désormais le résumé au premier intitulé Souvenirs, Relations, Lignes ou Objectif, y compris sous une forme qualifiée (« Lignes récentes », « Objectif actuel », « Souvenirs durables »…), et verse les souvenirs et relations trouvés dans leurs listes (les doublons sont fusionnés comme d'habitude) ; Lignes et Objectif sont simplement écartés. Cela s'applique à la réponse du modèle comme au résumé existant, qui est nettoyé à la prochaine mise à jour de la mémoire. Une phrase qui commence par « Relations tendues… » sans être un intitulé est laissée intacte.

Une relation enregistrée peut dater : la mémoire ne résume les messages qu'avec un retard de 30 à 40 messages (par lots d'une dizaine), et l'IA lit pourtant la relation en fin de prompt, juste avant d'écrire. Pour qu'elle ne l'emporte pas sur une évolution récente, la ligne est envoyée sous la forme « Relation (état enregistré, peut dater ; les événements récents priment) : … », et le bloc des personnes sans fiche porte la même mise en garde en tête. Elle compte quelques tokens par personnage en scène.

Le résumé et les souvenirs restent modifiables à la main dans la feuille Mémoire. Les relations, elles, n'y figurent plus : elles sont mises à jour par le modèle et affichées en lecture seule dans la fenêtre Personnages. Enregistrer la feuille Mémoire ne les touche pas.

L'objectif courant ne vit pas dans la mémoire mais dans le panneau d'état, qui est mis à jour à chaque tour. Ajoutez simplement un champ `Objectif` à la liste.

Tout est régénéré par une requête de résumé lancée pendant que vous lisez la réponse précédente. Dans Réglages, « Modèle pour la mémoire » permet de confier ce travail à un modèle plus petit que celui de la narration.

Cette requête demande une réponse **en JSON**, avec `response_format` quand le fournisseur le gère. La narration, elle, reste en texte balisé : le JSON empêcherait l'affichage au fil de l'eau et abîmerait l'écriture, alors que la mémoire n'est jamais affichée telle quelle et gagne beaucoup en fiabilité. Trois filets successifs : si le fournisseur refuse le paramètre, la requête est rejouée sans lui et la note des Réglages le signale ; si la réponse n'est pas du JSON exploitable, l'application retombe sur le format balisé ; si rien ne passe, la mémoire reste inchangée et l'essai reprend au tour suivant.

Avec un modèle **à raisonnement**, trois précautions. Le JSON est cherché à plusieurs endroits du texte, et non plus seulement à partir de la première accolade : un modèle qui cite le schéma dans sa réflexion (`{"resume": …}`) ne fait plus échouer la lecture. Une balise `</think>` isolée, sans balise ouvrante, est traitée comme la fin de la réflexion et tout ce qui la précède est écarté, ce qui vaut aussi pour la narration. Enfin, cette requête n'est pas diffusée, donc son délai maximal est de 5 minutes au lieu de 2. Si le modèle épuise sa limite de jetons en réfléchissant et ne répond rien, le message indique de choisir un modèle sans raisonnement dans « Modèle pour la mémoire ».

## Panneau d'état

L'IA peut suivre l'état du jeu (lieu, santé, argent, humeur…). À chaque réponse elle ajoute un bloc `<etat>` (masqué dans le texte) que l'application affiche dans un panneau sous le titre : deux pastilles repliées, tous les champs une fois ouvert, avec une barre pour les valeurs de la forme `72/100`. L'état précédent est renvoyé à l'IA à chaque tour pour assurer la cohérence.

Activation : menu « … » de la conversation, Réglages du scénario, section Narration, « Panneau d'état », puis la liste des champs (séparés par des virgules ou des lignes). Pour un scénario GitHub, un fichier `etat.md` (par exemple `Lieu, Santé (0/100), Argent, Humeur`) active le panneau par défaut.

## Repères dans la conversation

- **Limite de contexte** : une ligne « l'IA lit à partir d'ici » traverse le fil à l'endroit où commence la fenêtre envoyée. Au-dessus, l'IA ne dispose que du résumé. C'est la version visible du compteur de tokens.
- **Sommaire** (menu « … ») : la liste des lignes récentes produites par la mémoire, une par message déjà résumé. Touchez-en une pour sauter au message, qui clignote à l'arrivée.
- **Recherche dans l'histoire** (menu « … ») : cherche dans tous les messages, affiche un extrait autour de chaque occurrence et saute au message choisi, même s'il est au-delà des messages affichés.
- **Panneau d'état** : chaque valeur numérique affiche sa variation depuis le tour précédent (▲ +1, ▼ −4).
- **Images** : touchez une image pour l'ouvrir en plein écran.

## Gestes

- Toucher une suggestion l'envoie directement. Le crayon à sa gauche la place dans la zone de saisie pour la modifier avant d'envoyer.
- Balayer horizontalement la dernière réponse passe d'une variante à l'autre, comme les chevrons.

## Fonctions

- Réponses en streaming (avec diagnostic dans les réglages), trois suggestions de réponse (envoi direct ou crayon pour modifier), bouton annuler.
- Variantes de réponse (flèches ‹ ›) en régénérant, bouton « continuer » (double chevron) pour prolonger une réponse coupée.
- Modifier, copier ou supprimer à partir d'un message (feuille « … » sous le message). La suppression est immédiate, avec un bouton « Annuler » pendant 7 secondes tant que la conversation n'a pas changé. Les lignes récentes des messages supprimés sont retirées de la mémoire ; si la suppression touche des messages déjà résumés, la notification prévient que le résumé en garde la trace.
- Le bouton stop (et la sortie de la conversation) conserve le texte déjà reçu, que « Continuer » peut prolonger.
- Mémoire à trois étages : résumé et souvenirs éditables (ajout et retrait à l'unité), lignes récentes consultables dans le Sommaire, note utilisateur (menu « … » de la conversation), et relations par personnage, consultables dans la fenêtre Personnages. Nombre de souvenirs injectés réglable (0 : aucun).
- Température et Top P : globaux (Réglages) ou par scénario.
- Modèle distinct pour les résumés de mémoire.
- Protocole de sortie centralisé, adapté au modèle, et préambule commun à tous les scénarios.
- Liste des modèles du fournisseur (Réglages, Lister les modèles).
- Budget de tokens : limite réglable et estimation des tokens envoyés dans le compteur sous la conversation (voir ci-dessous).
- Recherche dans la liste, export d'une histoire en `.md`, sauvegarde JSON (clés API exclues) avec rappel tous les 30 jours, synchronisation en ligne (GitHub ou Google Drive).
- Bouton retour du téléphone géré, fonctionnement hors ligne.

## Sauvegarde en ligne

Les histoires restent d'abord sur l'appareil. La sauvegarde en ligne les copie dans un fichier JSON et les synchronise entre vos appareils. Réglages, Sauvegarde en ligne (ou icône nuage de la liste).

Fonctionnement : à chaque synchronisation, l'application télécharge le fichier distant, garde pour chaque scénario la version la plus récente, applique les suppressions, puis renvoie le résultat. Rien n'est écrasé à l'aveugle. Si la même histoire a été jouée des deux côtés depuis la dernière synchronisation, la version la plus ancienne n'est pas perdue : elle est conservée à part sous le même nom suivi de « (conflit) », à vous de choisir laquelle garder. Un fichier distant illisible n'est jamais remplacé. Les clés API ne sont pas sauvegardées. La synchronisation se lance à l'ouverture, en quittant une conversation, en quittant l'application et au toucher du nuage. Elle attend la fin d'une réponse en cours. Si elle rapporte une version plus récente de l'histoire ouverte, l'écran est rechargé avec cette version, pour que le tour suivant ne l'écrase pas ; si l'histoire a été supprimée ailleurs, la conversation se ferme. Elle repose sur l'horloge des appareils : gardez-les à l'heure.

### En cas d'erreur ou de mauvaise configuration

- Si la dernière synchronisation a échoué, un **point rouge** apparaît sur le nuage. Touchez le nuage : le message d'erreur propose « Modifier la configuration ».
- Après « Enregistrer », la synchronisation se lance tout de suite et affiche son résultat (« Sauvegarde à jour » ou l'erreur).
- La configuration est aussi accessible par la roue dentée (Réglages), section « GitHub et sauvegarde », bouton « Configurer… ».
- « Effacer la configuration » remet le service, le jeton et la connexion Google à zéro sur l'appareil. Les histoires et le fichier de sauvegarde en ligne ne sont pas touchés.
- Réglages, section « GitHub et sauvegarde », indique l'espace occupé sur l'appareil et si le navigateur a accordé la **conservation** des données. Sans elle, le navigateur peut effacer les histoires quand l'espace manque : c'est la vraie raison de configurer une sauvegarde en ligne.

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
fonts/              Literata (récit), romain et italique variables, sous-ensemble latin
js/
  main.js           point d'entrée : charge les modules, démarre l'application
  state.js          réglages (S), scénario ouvert et état de l'interface (app), contexte (ctx), images (IMG)
  util.js           petits outils : sélecteur $, échappement, dates, boîtes de dialogue, notifications
  store.js          base locale (IndexedDB) : scénarios, réglages, import validé
  scenarios.js      scénarios GitHub : arbre de fichiers, couvertures, personnages, images, lorebook
  rate.js           suivi du débit : en-têtes du fournisseur ou fenêtre locale
  prompt.js         assemblage du prompt : casting, mémoire, lorebook, budget
  protocol.js       formats de sortie imposés par l'application (état, choix, images)
  ai.js             appel au fournisseur d'IA (streaming) et résumé de mémoire
  format.js         mise en forme du texte (Markdown léger, images, choix, état)
  read.js           lecture : taille du texte, mode lecture, lecture à voix haute
  cast.js           fenêtre Personnages
  chat.js           conversation : affichage, envoi, variantes, suppression, continuation
  list.js           liste des scénarios : recherche, onglets, menu, création
  nav.js            navigation (bouton retour du téléphone)
  settings.js       réglages du scénario, mémoire, note, réglages IA, import
  backup.js         export, synchronisation GitHub / Google Drive
  merge.js          fusion des sauvegardes (sans DOM, testé unitairement)
  memory.js         mémoire longue : fusion des souvenirs et des relations
  stats.js          statistiques d'usage en tokens (sans DOM, testé unitairement)
  statview.js       feuille Statistiques
  boot.js           garde-fou de démarrage : alerte et bouton Réparer si un fichier manque
  reparer.js        script de la page reparer.html
reparer.html        page de réparation (vide les caches, garde les histoires)
sw.js               service worker (hors ligne)
tools/build.mjs     numérotation de version, liste du service worker, contrôles
test/               tests unitaires (node --test), sans aucune dépendance
```

En local : `npm test` lance les tests, `npm run build` régénère les numéros de version.

Règles du projet :

- Les fichiers sont des modules ES (`import` / `export`) : chacun déclare ce qu'il utilise. Aucun script en ligne.
- **Aucune construction de HTML par chaîne de caractères.** Tout passe par `el(balise, propriétés, enfants)` dans `util.js`, qui crée de vrais nœuds. Le texte est posé en `textContent`, jamais interprété : une injection depuis un scénario, un lorebook ou une réponse d'IA est impossible par construction, et il n'y a plus d'échappement à ne pas oublier.
- `render()` ne reconstruit pas la conversation à chaque tour : il compare les nœuds existants à l'état voulu et ne remplace que ceux qui ont changé. Un message ajouté laisse les précédents en place, avec leur sélection de texte et leurs images déjà chargées.
- L'état partagé qui change vit dans `state.js` (`app.cur`, `app.busy`…). Les autres variables restent locales à leur module.
- Un module ne doit appeler aucune fonction d'un autre module au moment du chargement, seulement dans des gestionnaires d'événements ou des fonctions. Cela permet aux modules de se référencer entre eux (par exemple `list.js` et `nav.js`) sans erreur.
- Pour tester en local, servez le dossier avec un serveur HTTP (`python3 -m http.server`), car les modules ne se chargent pas depuis `file://`.
- Quand vous ajoutez un fichier JavaScript dans `js/`, il est repris automatiquement par `npm run build` (service worker et `modulepreload`). Rien à déclarer à la main.
- Les numéros de version sont calculés à partir du contenu des fichiers par `npm run build`, lancé par le workflow à chaque déploiement. Ne les modifiez pas à la main.
- La logique sans DOM (fusion, validation, construction du prompt) doit rester testable : ajoutez un test dans `test/` quand vous la touchez.

## Déploiement et dépannage

**Déployez toujours tous les fichiers ensemble**, y compris les nouveaux : `index.html`, `sw.js`, `manifest.json`, les icônes, `reparer.html`, `package.json`, les dossiers `css/`, `js/`, `tools/` et `test/`. L'application est découpée en modules : il suffit qu'un seul fichier manque ou ne soit pas à jour pour que rien ne démarre (page vide, boutons sans effet).

Protections intégrées :

- `npm run build` refuse de produire une version incohérente (identifiant dupliqué, sélecteur pointant dans le vide) et les tests tournent avant chaque déploiement.
- Si un fichier est introuvable, une alerte « L'application ne démarre pas correctement » nomme le fichier fautif et propose **Réparer**.
- Si la page et les scripts sont de versions différentes, une alerte « Mise à jour incomplète » le signale et l'application reste utilisable autant que possible.
- Le service worker refuse d'installer une nouvelle version dont un fichier manque : l'ancienne version continue de fonctionner.
- Une nouvelle version ne prend jamais la main sous vos pieds. Elle s'installe en arrière-plan, puis une notification « Nouvelle version prête — Recharger » attend votre accord ; la page se recharge alors d'un bloc. C'est ce qui évite l'essentiel des « mises à jour incomplètes », où une page déjà ouverte se retrouvait à mélanger l'ancien HTML et les nouveaux scripts.

Si l'application ne répond plus malgré tout :

1. Vérifiez sur GitHub que tous les fichiers sont présents (ouvrez `js/read.js`, `js/boot.js`… dans votre dépôt) et que le déploiement est terminé.
2. Ouvrez `https://votre-adresse/reparer.html` et touchez **Réparer** : cela supprime les copies d'application en cache sur l'appareil puis rouvre l'application. **Vos histoires et vos réglages ne sont pas effacés.**
3. N'utilisez pas « Effacer les données du site » dans le navigateur : cela supprime aussi vos histoires stockées sur l'appareil (sauvegardez-les d'abord avec la synchronisation ou l'export).

## Politique de sécurité (CSP)

`index.html` contient une politique de sécurité qui limite les scripts à ceux de l'application et les connexions réseau aux services connus (fournisseurs d'IA, GitHub, Google). Conséquence : pour ajouter un fournisseur d'IA ou un autre service, ajoutez son adresse à `connect-src` dans cette balise, sinon le navigateur bloquera les requêtes. Une erreur « Refused to connect » dans la console du navigateur indique ce cas.

## Streaming

Le texte s'affiche au fur et à mesure quand le fournisseur le diffuse. Si ce n'est pas le cas, Réglages indique comment la dernière réponse est arrivée : diffusée en N morceaux, reçue d'un seul bloc (le service ne diffuse pas) ou streaming désactivé. Les modèles « à raisonnement » réfléchissent avant de répondre : l'application affiche alors « Réflexion… » et le texte n'apparaît qu'ensuite.

## Sécurité

La clé API est stockée en clair dans le navigateur de l'appareil et envoyée uniquement au fournisseur choisi. Ne l'utilisez pas sur un appareil partagé. Elle n'est jamais incluse dans les sauvegardes.
