# Zeiterfassung (PWA)

Einfache, für das Smartphone optimierte Arbeitszeiterfassung. Alle Daten bleiben
ausschließlich lokal im Browser des Geräts (`localStorage`) – es gibt keinen Server.

- **Erfassen:** Datum (Standard: heute), Beginn und Ende eintragen → „Zeit eintragen“.
  Ende vor Beginn wird als Schicht über Mitternacht gewertet.
  Wird nur der Beginn eingetragen, ist der Eintrag offen; das Formular zeigt ihn an und
  man trägt später im selben Formular das Ende nach. Es gibt immer höchstens einen offenen Eintrag.
- **Woche:** Unter dem Formular steht die Woche des gewählten Datums mit Wochensumme.
- **Übersicht:** Alle Einträge gruppiert nach Kalenderwoche (ISO, Mo–So) mit Wochensumme.
  Über das Datumsfeld oben springt man direkt zu einem Tag.

## Backup

- **Automatisch:** Beim ersten Öffnen der App an einem Tag wird eine Kopie der Daten
  im Browser-Speicher (IndexedDB) abgelegt. Es werden die letzten 30 Tage aufbewahrt.
  Wiederherstellen über **⋯ → Automatische Backups**.
- **Manuell:** **⋯ → Backup speichern** erzeugt eine JSON-Datei (auf dem Smartphone über
  den Teilen-Dialog, z. B. in „Dateien“ oder Google Drive). **⋯ → Backup aus Datei laden**
  übernimmt Einträge aus einer solchen Datei; vorhandene Einträge bleiben erhalten.

Die automatischen Backups liegen auf demselben Gerät wie die Daten. Gegen Verlust des
Geräts oder Löschen der App hilft nur ein gespeichertes Datei-Backup.

## Auf GitHub Pages bereitstellen

1. Repository auf GitHub anlegen und diese Dateien in den `main`-Branch pushen.
2. Auf GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   Branch `main`, Ordner `/ (root)` → Save.
3. Nach ca. 1 Minute ist die App unter `https://<user>.github.io/<repo>/` erreichbar.
4. Auf dem Smartphone öffnen und „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ wählen.

Nach Änderungen an den Dateien in `sw.js` die `CACHE`-Version erhöhen.

> Hinweis: Wird die App bzw. der Browser-Speicher gelöscht, sind auch die Daten weg.

## Lokal testen

```bash
npx http-server -p 8080 -c-1 .
```
