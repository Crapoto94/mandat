# Suivi des engagements du mandat — Ville d'Ivry-sur-Seine

Application de suivi des 55 engagements du mandat : état d'avancement, rôles des
directions, sujets de coordination transversaux, et synthèse pour les temps de
travail en groupe / restitution en plénière.

Construite selon les conventions Ville décrites dans
[`GUIDE_NOUVELLE_APP_VILLE.md`](./GUIDE_NOUVELLE_APP_VILLE.md) : backend
Node/Express + PostgreSQL (schéma dédié `mandat`), frontend React/Vite/TS/Tailwind,
API centrale APM pour l'authentification AD / mail / SMS.

## Fonctionnement général

- **55 engagements** (feuille `Feuil1` du fichier de suivi), répartis en **3 groupes
  de travail** CODIR :
  - **G1** : DDAC – DCCAS – DRH – DAJCP
  - **G2** : DEP – DAC – DBC – DSPORT
  - **G3** : DDU – DCOM – DJEUN – DSALE – DSI
  - 1 engagement (n°14, piloté par le Cabinet) reste **hors groupe** — il est
    quand même suivi, mais n'est pas éligible au marquage « prioritaire plénière ».
- Chaque engagement porte : axe du projet, contenu, pilotage, contributions,
  échéance, état d'avancement, description du point atteint, prochaines étapes,
  et un champ libre **« rôles précisés »** pour clarifier la répartition entre
  directions quand nécessaire.
- **Sujets de coordination** transversaux : pour un point de coordination qui
  dépasse un seul engagement (peut lier plusieurs engagements / directions,
  statut à trancher / en discussion / réglé).
- **Fil de commentaires** par engagement, pour tracer les échanges sans réécrire
  la fiche à chaque fois.
- **Marquage « prioritaire plénière »** (2 à 3 par groupe max., avec une note)
  pour préparer la restitution en plénière — page dédiée `/plenaire`.
- **Historique** de toutes les modifications (qui a changé quoi, et quand).

## Authentification

Deux mécanismes, cf. [`middleware/auth.js`](./backend/middleware/auth.js) :

1. **Connexion agent** (`/connexion`) : identifiants Ville, vérifiés par bind LDAP
   via l'API centrale APM (`POST /api/v1/ad/authenticate`). Tout agent authentifié
   peut consulter et modifier l'ensemble des engagements (pas de restriction fine
   par direction dans cette première version).
2. **Accès de secours admin** : compte **local**, indépendant de l'Active
   Directory, à utiliser si l'AD/l'APM est indisponible. Permet aussi de gérer
   les comptes de secours et de relancer un import des fichiers Excel sources
   depuis `/admin`.

## Démarrage (développement local)

### 1. Base de données

```bash
docker compose up -d db
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Renseigner au minimum SEED_ADMIN_PASSWORD (8 caractères min.).
# APM_API_KEY / HUBDSI_API_KEY peuvent rester vides pour l'instant (voir plus bas).
npm install
npm run migrate        # crée le schéma `mandat` et ses tables
npm run seed-admin      # crée le compte admin de secours (SEED_ADMIN_USERNAME/PASSWORD)
npm run import -- --suivi "../260904 Engagements du mandat.xlsx" \
                   --repartition "../260907 CODIR Repartition_engagements_3_groupes_V4.xlsx"
npm run dev              # démarre l'API sur http://localhost:5151 (Swagger : /api-docs)
```

> `npm run import -- --dry-run --suivi ...` permet de prévisualiser le parsing
> sans rien écrire en base.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5150, proxifié vers l'API backend en dev
```

Connectez-vous avec le compte de secours créé à l'étape précédente (identifiant
`SEED_ADMIN_USERNAME`, par défaut `admin`) tant que l'annuaire AD n'est pas
branché.

## Jetons à demander (à brancher dans `backend/.env`)

| Variable | Fournisseur | Usage |
|---|---|---|
| `POSTGRES_HOST` / `_USER` / `_PASSWORD` | Équipe DSI | Bascule du Postgres de dev vers la base partagée Ville |
| `APM_API_KEY` | Admin APM | Auth AD (`ad_auth`, `ad_read`), envoi mail (`mail_send`), SMS (`sms_send`) |
| `HUBDSI_API_KEY` | Admin Hub DSI | Référentiel `directions-services` (scope `ville`), lecture seule, optionnel |

Tant que `APM_API_KEY` n'est pas renseignée, la connexion agent échoue proprement
(message d'erreur explicite) — **l'accès de secours admin reste utilisable** pour
continuer à travailler sur le suivi en attendant.

## Réimporter les fichiers Excel sources

Si les fichiers de suivi / répartition sont mis à jour, deux options :

- **CLI** : `npm run import -- --suivi <fichier> --repartition <fichier>`
  (depuis `backend/`).
- **Interface admin** (`/admin`, réservé aux comptes de secours) : upload direct
  des deux fichiers `.xlsx`.

Dans les deux cas, l'import **préserve les données déjà saisies** (état
d'avancement, description, prochaines étapes, rôles précisés, marquage
prioritaire) : seuls le contenu de référence (axe, contenu, pilotage,
contributions, échéance) et l'affectation aux groupes sont mis à jour.

## Déploiement

**Un seul `docker-compose.yml`, pour dev local comme pour le serveur — seuls
les fichiers `.env` changent** (rien à éditer dans le compose lui-même).
Deux profils :

| | Local (test rapide) | Serveur (derrière nginx, `mandat.ivry.local`) |
|---|---|---|
| `.env` (racine) | `APP_API_URL=http://localhost:5151` (ou absent — c'est le défaut) | `APP_API_URL=` **(vide)** — le front appelle des chemins relatifs `/api/…`, résolus par nginx |
| `backend/.env` → `CORS_ORIGIN` | `http://localhost:5150` | `https://mandat.ivry.local` (même origine que le front via nginx — cette valeur ne sert alors qu'en secours) |
| `backend/.env` → `POSTGRES_HOST` | Postgres local (`db` du compose, ou un Postgres de dev) | Postgres partagé de la Ville |
| Commande | `docker compose up -d --build` | `docker compose up -d --build backend frontend` (sans `db`) |

```bash
cp .env.example .env   # à la racine — adapter APP_API_URL selon le profil ci-dessus
docker compose up -d --build backend frontend   # sans `db` si POSTGRES_HOST (backend/.env) pointe déjà vers la base Ville
```

> ⚠️ **`APP_API_URL`** est lue **au moment du build** de l'image frontend :
> après l'avoir changée, refaire `docker compose build --no-cache frontend &&
> docker compose up -d --force-recreate frontend`. Ne jamais y mettre
> `localhost` dès que l'appli est servie ailleurs que sur le poste de dev
> (`localhost` désignerait alors le poste de l'utilisateur, pas le serveur —
> *Network Error* au login). La variable accepte explicitement une valeur
> **vide** (chemins relatifs, cas nginx same-origin ci-dessus) : le compose
> utilise `${APP_API_URL-défaut}` (sans `:`), qui ne retombe sur le défaut
> que si la variable est absente de `.env`, jamais si elle y est mais vide.
>
> **`CORS_ORIGIN`** (dans `backend/.env`) doit être l'origine exacte du
> frontend **telle que vue par le navigateur**. En dev local le proxy Vite
> masque le problème (tout passe par la même origine) ; sans nginx unifiant
> front et back sous un seul nom d'hôte, une mauvaise valeur ici bloque
> silencieusement TOUTES les requêtes API (symptôme : "le front n'a pas
> accès au back" sur toutes les pages, pas juste une).
>
> **Reverse-proxy nginx recommandé** (front et back sous le même hôte,
> distingués par chemin — évite le CORS entièrement) :
> ```nginx
> server {
>     listen 443 ssl;
>     server_name mandat.ivry.local;
>     location /api/ { proxy_pass http://<hôte-docker>:5151; proxy_set_header Host $host; }
>     location /     { proxy_pass http://<hôte-docker>:5150; proxy_set_header Host $host; }
> }
> ```

## Structure du repo

```
backend/            API Express (modules/, services/apm.js, services/hubdsi.js, migrations/, scripts/)
frontend/           React + Vite + TypeScript + Tailwind
docker-compose.yml
GUIDE_NOUVELLE_APP_VILLE.md   Conventions techniques Ville (référence)
```
