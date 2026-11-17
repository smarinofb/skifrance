# Mise en ligne et référencement de Ski France

## Build Netlify

Le projet utilise Node.js 22. Dans Netlify, reliez le dépôt `smarinofb/skifrance`, puis configurez :

- Commande de build : `npm run build`
- Dossier publié : `dist`
- Version Node : `22`

Le build récupère le flux SkiRadar, crée les fiches HTML des stations disposant d’au moins trois informations utiles, les pages par massif, les liens internes, `robots.txt` et `sitemap.xml`. Si l’API est indisponible ou si aucune station qualifiée n’est retournée, le build échoue au lieu de publier un site vide.

## Actualisation hebdomadaire

Le workflow GitHub Actions est prévu chaque lundi à 04:17 UTC. Dans Netlify, créez un Build hook pour le site. Dans GitHub, ajoutez l’URL de ce hook comme secret du dépôt nommé `NETLIFY_BUILD_HOOK_URL` (Settings → Secrets and variables → Actions). Ne publiez jamais cette URL dans un fichier du dépôt.

## Google et Bing

Après le premier déploiement, soumettez `https://skifrance-smarin.netlify.app/sitemap.xml` dans Google Search Console et Bing Webmaster Tools. La soumission facilite la découverte des pages mais ne garantit pas leur indexation ni leur classement.

## Test

`npm run test:build` teste la génération d’une page d’accueil, d’une fiche station, d’une page massif, des liens internes et du sitemap à partir d’un jeu de données de démonstration.

L’audience, l’indexation et les positions doivent ensuite être suivies dans Search Console. Le code ne garantit aucun classement ou volume de visiteurs.
