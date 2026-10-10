# Seelenfrüchte – Info-Webseite

Info-Seite für das Roblox-Spiel **Seelenfrüchte (Soul Fruits)**. Alles steckt in einer einzigen Datei: `index.html`.

## Links eintragen

Oben im `<script>`-Bereich von `index.html`:

```js
const ROBLOX_LINK = "";   // Link zu deinem Spiel auf roblox.com
const DISCORD_LINK = "";  // Discord-Einladung (leer = Button versteckt)
```

## Kostenlos online stellen (GitHub Pages)

1. Auf GitHub im Repo: **Settings → Pages**
2. Unter „Build and deployment“: Source **Deploy from a branch**
3. Branch wählen (z. B. `main`), Ordner `/ (root)`, **Save**
4. Nach ca. 1 Minute ist die Seite unter `https://<dein-name>.github.io/Vertex/` erreichbar.

## Inhalte ändern

- Früchte: `FRUITS` im Script
- Inseln und Bosse: `ISLANDS` im Script
- Steuerung: `CONTROLS` im Script
- Alles andere steht direkt als Text im HTML.
