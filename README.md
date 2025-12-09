# 🎮 CLASH ARENA - Guide d'installation

## 📁 Structure du projet

```
clash-arena/
├── backend/          ← Le serveur (Node.js)
│   ├── models/       ← Les modèles de données
│   ├── server.js     ← Le code principal du serveur
│   ├── package.json  ← Les dépendances
│   └── .env.example  ← Exemple de configuration
│
└── frontend/         ← Le site web (React)
    ├── public/       ← Fichiers statiques
    ├── src/          ← Code source React
    ├── package.json  ← Les dépendances
    └── .env.example  ← Exemple de configuration
```

---

## 🚀 ÉTAPE 1 : Configurer MongoDB Atlas

### 1.1 - Créer la base de données

1. Va sur **mongodb.com** et connecte-toi
2. Clique sur **"Build a Database"**
3. Choisis **"M0 FREE"** (gratuit)
4. Région : **Paris (eu-west)** ou la plus proche
5. Clique **"Create"**

### 1.2 - Créer un utilisateur

1. Dans le menu gauche, clique sur **"Database Access"**
2. Clique **"Add New Database User"**
3. Choisis un nom d'utilisateur (ex: `clash-admin`)
4. Choisis un mot de passe (ex: `MonMotDePasse123`)
5. **IMPORTANT** : Note ces identifiants !
6. Clique **"Add User"**

### 1.3 - Autoriser les connexions

1. Dans le menu gauche, clique sur **"Network Access"**
2. Clique **"Add IP Address"**
3. Clique **"Allow Access from Anywhere"** (0.0.0.0/0)
4. Clique **"Confirm"**

### 1.4 - Récupérer la connection string

1. Retourne sur **"Database"** dans le menu
2. Clique **"Connect"** sur ton cluster
3. Choisis **"Connect your application"**
4. Copie la chaîne qui ressemble à :
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Remplace `<password>` par ton vrai mot de passe
6. Ajoute le nom de la base après `.net/` :
   ```
   mongodb+srv://clash-admin:MonMotDePasse123@cluster0.xxxxx.mongodb.net/clash-arena?retryWrites=true&w=majority
   ```

---

## 💻 ÉTAPE 2 : Installer le projet en local

### 2.1 - Télécharger le code

1. Ouvre **Visual Studio Code**
2. Ouvre un nouveau terminal (Menu > Terminal > New Terminal)
3. Tape ces commandes :

```bash
cd Desktop
mkdir clash-arena
cd clash-arena
```

4. Copie tous les fichiers du projet dans ce dossier

### 2.2 - Configurer le backend

1. Ouvre un terminal dans le dossier `backend`
2. Crée le fichier `.env` :

```bash
cd backend
```

3. Crée un fichier `.env` avec ce contenu (utilise le Bloc-notes ou VS Code) :

```
MONGODB_URI=mongodb+srv://TON_USER:TON_PASSWORD@cluster0.xxxxx.mongodb.net/clash-arena?retryWrites=true&w=majority
PORT=3001
FRONTEND_URL=http://localhost:3000
```

4. Installe les dépendances :

```bash
npm install
```

5. Lance le serveur :

```bash
npm start
```

Tu dois voir : `Serveur demarre sur le port 3001` et `Connecte a MongoDB`

### 2.3 - Configurer le frontend

1. Ouvre un **nouveau terminal** (garde l'autre ouvert !)
2. Va dans le dossier frontend :

```bash
cd frontend
```

3. Installe les dépendances :

```bash
npm install
```

4. Lance le site :

```bash
npm start
```

5. Ton navigateur s'ouvre sur **http://localhost:3000**

---

## 🌐 ÉTAPE 3 : Mettre en ligne (Railway)

### 3.1 - Préparer le code pour GitHub

1. Va sur **github.com** et connecte-toi
2. Clique sur **"New"** (nouveau repository)
3. Nom : `clash-arena`
4. Laisse en **Public**
5. Clique **"Create repository"**

### 3.2 - Envoyer le code

Dans le terminal de VS Code, depuis le dossier `clash-arena` :

```bash
git init
git add .
git commit -m "Premier commit"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/clash-arena.git
git push -u origin main
```

### 3.3 - Déployer le Backend sur Railway

1. Va sur **railway.app** et connecte-toi avec GitHub
2. Clique **"New Project"**
3. Choisis **"Deploy from GitHub repo"**
4. Sélectionne **clash-arena**
5. Clique **"Add variables"** et ajoute :
   - `MONGODB_URI` = ta connection string MongoDB
   - `FRONTEND_URL` = (laisse vide pour l'instant)
6. Dans les settings, change le **Root Directory** en `backend`
7. Railway va automatiquement déployer !
8. Copie l'URL de ton backend (ex: `https://clash-arena-backend.railway.app`)

### 3.4 - Déployer le Frontend sur Railway

1. Dans Railway, clique **"New"** > **"Service"**
2. Choisis le même repo GitHub
3. Dans les settings, change le **Root Directory** en `frontend`
4. Ajoute la variable :
   - `REACT_APP_API_URL` = URL de ton backend (de l'étape précédente)
5. Railway déploie le frontend !

### 3.5 - Finaliser

1. Copie l'URL de ton frontend
2. Retourne dans les variables du backend
3. Ajoute `FRONTEND_URL` = URL de ton frontend

**C'est terminé ! 🎉**

---

## 🧪 Tester le site

1. Ouvre l'URL de ton frontend
2. Crée un compte
3. Ouvre une 2ème fenêtre en navigation privée
4. Crée un 2ème compte
5. Les deux cliquent sur "Trouver un match"
6. Magie ! 🪄

---

## ❓ Problèmes fréquents

### "Erreur de connexion au serveur"
- Vérifie que le backend est lancé
- Vérifie l'URL dans le fichier `.env` du frontend

### "Erreur MongoDB"
- Vérifie ta connection string
- Vérifie que tu as autorisé 0.0.0.0/0 dans Network Access

### Le matchmaking ne trouve personne
- Il faut 2 joueurs connectés en même temps
- Teste avec 2 navigateurs différents

---

## 📞 Besoin d'aide ?

Reviens me voir avec :
1. Le message d'erreur exact
2. Ce que tu essayais de faire
3. À quelle étape tu es bloqué

Bonne chance ! 🎮
