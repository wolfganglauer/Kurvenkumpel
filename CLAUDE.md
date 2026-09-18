# Kurvenkumpel

Motorradnavi-App (statisches HTML). Live-Version: https://github.com/wolfganglauer/Kurvenkumpel (Branch main), `index.html` ist immer die aktuellste Version.

## Auto-Push-Hook

Ein PostToolUse-Hook (`.claude/hooks/autopush.ps1`, konfiguriert in `.claude/settings.json`) pusht nach jedem Schreiben/Editieren einer `.html`-Datei automatisch eine versionierte Kopie plus aktualisierte `index.html` ins GitHub-Repo. Log: `.claude/hooks/autopush.log`.

Der Hook liefert nach einem erfolgreichen Push (`Status=PUSHED`) eine `additionalContext`-Meldung mit dem Pfad der neuen Versionsdatei. Wenn diese Meldung erscheint:
1. Kurz im Chat melden: "Dateien auf GitHub hochgeladen und versioniert."
2. Die genannte Versionsdatei per SendUserFile als Download bereitstellen.

Bei `Status=NO_CHANGES` oder `PUSH_FAILED` keine Datei verschicken; bei `PUSH_FAILED` den Fehler kurz erwähnen.
