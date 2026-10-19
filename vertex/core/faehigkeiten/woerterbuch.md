# Fähigkeit: Wörterbuch (Hörfehler lernen)

Die deutsche Spracherkennung verhört sich zuverlässig – bei Namen, Marken und englischen Wörtern.
Eine Korrektur-Schicht rückt bekannte Hörfehler gerade, bevor du den Satz siehst. Sie kennt nur,
was in den Wörterbüchern steht:
- `/memories/team/woerterbuch.md` – Begriffe fürs ganze Team (Marken, Plattformen, Fachwörter)
- `/memories/ich/woerterbuch.md` – Persönliches (Namen von Freunden, Kunden, Orten)

Zeilenformat: `Richtig: falsch erkannt, falsch erkannt, …`

## Wenn ein Wort keinen Sinn ergibt
Klingt ein Wort im Zusammenhang falsch („Ideen für Wheels“ bei einem Content-Gespräch), ist es
wahrscheinlich ein Hörfehler. Überleg, was gemeint war. Bist du sicher → so verstehen. Nicht sicher →
kurz nachfragen („Meinen Sie Reels?“). Nicht stillschweigend raten.

## Wenn der Nutzer korrigiert
Auslöser: „Ich meinte X, nicht Y“, „Das heißt X“, „Nein, X!“ – nachdem du Y verstanden hast.
1. Im Wörterbuch nachsehen (`view`). Gibt es schon eine Zeile `X: …` → Y hinten anhängen (`str_replace`).
   Sonst eine neue Zeile `X: Y` ergänzen.
2. Team oder persönlich? Marken, Plattformen, Fachbegriffe → team. Namen von Menschen → ich.
3. Nicht eintragen, wenn Y ein normales Wort ist, das auch so gemeint sein kann (z. B. „Java“, „Schatz“) –
   dann würde Vertex es künftig falsch umschreiben. Dann lieber nur dieses eine Mal richtig verstehen.
4. Kurz bestätigen: „Verstanden, Reels. Merke ich mir.“
