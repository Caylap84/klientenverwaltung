# Web-App veröffentlichen (GitHub Pages)

Damit sich die App auf dem Handy installieren lässt, muss sie unter einer HTTPS-Adresse erreichbar sein.
GitHub Pages übernimmt das kostenlos (bei öffentlichen Repositories). Die Daten deiner Klienten
werden dabei **nicht** hochgeladen: Sie bleiben im Browser bzw. in der App auf deinem Gerät.

## Einmalig einrichten

1. Auf github.com das Repository öffnen → **Settings** → **Pages**.
2. Unter **Build and deployment** bei **Source** die Option **GitHub Actions** wählen.
3. Den Stand der App auf den Zweig `master` bringen (Push). Der Workflow „Web-App veröffentlichen
   (GitHub Pages)“ startet automatisch. Alternativ: **Actions** → diesen Workflow wählen → **Run workflow**.
4. Nach dem ersten erfolgreichen Lauf steht die Adresse im Workflow-Lauf (Schritt „deploy“) und unter
   Settings → Pages, in der Regel `https://<Besitzer>.github.io/<Repository-Name>/`.

## Auf dem Handy installieren (Android)

1. Die Adresse in **Chrome** öffnen.
2. Menü (⋮) → **App installieren** (oder „Zum Startbildschirm hinzufügen“).

## Wichtig

- **Die Daten gehören zur Adresse.** Ändert sich die Adresse (z. B. anderer Repository-Name oder
  eigene Domain), startet die App dort leer. Vorher unter **Sicherung** exportieren, danach importieren.
- **Neue Versionen:** Nach jedem Push auf `master` wird die App neu veröffentlicht. Die installierte App
  zeigt dann den Hinweis „Eine neue Version ist verfügbar“ und aktualisiert sich nur nach Klick.
- **Jedes Gerät hat eigene Daten** (Handy, Windows-App, Browser am PC). Übertragen wird nur über die
  Sicherungsdatei.
- Das Veröffentlichen läuft nur, wenn Lint und Tests bestehen.
