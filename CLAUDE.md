# Kurvenkumpel

Motorradnavi-App (statisches HTML). Live-Version: https://github.com/wolfganglauer/Kurvenkumpel (Branch main), `index.html` ist immer die aktuellste Version.

## Auto-Push-Hook

Der Auto-Push-Hook ist **global** eingerichtet (nicht projekt-lokal), damit er sich fuer beliebige Claude-Projekte wiederverwenden laesst:
- Skript: `C:\Users\wolfg\.claude\hooks\autopush.ps1`
- Registrierung: `C:\Users\wolfg\.claude\settings.json` (PostToolUse-Hook auf `Write|Edit`)

Er feuert bei jedem Schreiben/Editieren einer `.html`-Datei, ermittelt automatisch das naechstgelegene Git-Repo (naechster Ordner mit `.git`) als Projekt und pusht nur, wenn dieses Repo ein `origin`-Remote konfiguriert hat. Fuer Kurvenkumpel ist das `origin` = https://github.com/wolfganglauer/Kurvenkumpel.git, `index.html` ist immer die aktuellste Version. Log weiterhin lokal: `.claude/hooks/autopush.log`.

Der Hook liefert nach einem erfolgreichen Push (`Status=PUSHED`) eine `additionalContext`-Meldung mit dem Pfad der neuen Versionsdatei, inkl. Anweisung fuer Claude:
1. Kurz im Chat melden: "Dateien auf GitHub hochgeladen und versioniert."
2. Die genannte Versionsdatei per SendUserFile als Download bereitstellen.

Bei `Status=NO_CHANGES` oder `PUSH_FAILED` keine Datei verschicken; bei `PUSH_FAILED` den Fehler kurz erwähnen.

### Fuer ein neues Claude-Projekt aktivieren
1. Im Projektordner: `git init -b main`
2. GitHub-Repo mit **exakt demselben Namen wie der Projektordner** anlegen: `gh repo create <Projektordnername> --private` (oder `--public`)
3. `git remote add origin https://github.com/<user>/<Projektordnername>.git`
4. Erstcommit + Push wie gewohnt
Ab dann greift der globale Hook automatisch fuer `.html`-Dateien in diesem Projekt – kein weiteres Setup noetig.
