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

Les images de `personnages/<Nom>/` sont proposées à l'IA sous le code `nom_fichier` (minuscules). L'IA les affiche avec `{{img::alice_sourire}}` seul sur une ligne.

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

Dans ✎ (réglages du scénario) : nombre de messages scannés (défaut 2) et nombre maximum d'entrées injectées.

## Fonctions

- Réponses en streaming, trois choix de réponse proposés, bouton annuler.
- Variantes de réponse (‹ ›) en régénérant ↻, bouton » pour continuer une réponse coupée.
- Modifier, copier ou supprimer à partir d'un message (🗑) pour revenir en arrière.
- Mémoire : résumé automatique, souvenirs, note utilisateur (🧠, 📝). Nombre de souvenirs injectés réglable.
- Température et Top P : globaux (Réglages IA) ou par scénario.
- Liste des modèles du fournisseur (Réglages IA, Lister les modèles).
- Estimation des tokens envoyés, avec alerte si la fenêtre de contexte saisie est presque pleine.
- Recherche dans la liste, export d'une histoire en `.md`, sauvegarde JSON (clés API exclues) avec rappel tous les 30 jours.
- Bouton retour du téléphone géré, fonctionnement hors ligne.

## Sécurité

La clé API est stockée en clair dans le navigateur de l'appareil et envoyée uniquement au fournisseur choisi. Ne l'utilisez pas sur un appareil partagé. Elle n'est jamais incluse dans les sauvegardes.
