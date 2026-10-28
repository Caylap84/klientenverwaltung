# Windows-Programm (EXE) bauen und prüfen

## EXE erzeugen
1. Auf GitHub das Projekt öffnen und oben auf **Actions** klicken.
2. Links **Windows-Build** wählen, rechts **Run workflow** und bestätigen.
3. Nach einigen Minuten (grüner Haken) den Lauf öffnen. Unten unter **Artifacts** liegen:
   - `klientenverwaltung-installer` – Installationsprogramm (.exe)
   - `klientenverwaltung-portable` – direkt startbare `klientenverwaltung.exe`
   - `web-dist` – die Web-Version (nur für Entwickler)

Installer und portable EXE sind Alternativen: Verwende nur eine von beiden. Beide nutzen
denselben Datenordner, die Daten sind also in beiden dieselben.

Achtung beim Deinstallieren: Wird dabei „App-Daten löschen“ angehakt, werden alle Klientendaten
auf diesem Rechner gelöscht. Vorher unbedingt unter **Sicherung → Exportieren** sichern.

Der Build startet auch automatisch, wenn ein Tag wie `v0.1.0` hochgeladen wird.

## Hinweis zu SmartScreen
Die EXE ist nicht digital signiert. Windows SmartScreen kann deshalb warnen
("Der Computer wurde durch Windows geschützt"). Auf **Weitere Informationen**
und dann **Trotzdem ausführen** klicken. Das ist bei selbst gebauten Programmen normal.

## Erste Prüfung auf Windows
Diese Punkte konnten nicht automatisch geprüft werden. Bitte einmal durchgehen:

1. Das Programm startet und zeigt die Klientenverwaltung.
2. Einen Klienten anlegen, Programm schließen, wieder öffnen – der Klient ist noch da.
3. **Sicherung → Exportieren** speichert eine Datei (je nach Windows meist im
   Ordner "Downloads" oder über einen Speichern-Dialog). Passiert nichts,
   bitte dem Entwickler Bescheid geben.
4. Genau diese Datei unter **Sicherung → Importieren** wieder einlesen – die Daten sind vollständig.
5. Bei einem Klienten ein PDF hinzufügen und es mit **Öffnen** ansehen.
6. Unter **Sicherung** den Speicherstatus ansehen („Speicher: dauerhaft gesichert“ oder
   „vom Browser nicht garantiert“) und dem Entwickler mitteilen, was dort steht.
