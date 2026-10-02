# Kurvenkumpel – Roadmap / Feature-Ideen

Sammlung von Featureideen, die noch nicht umgesetzt sind. Jeder Eintrag: kurze Beschreibung, Datum der
Aufnahme, grober Status. Kein Zeitplan, keine Priorisierung – einfach ein Gedächtnis für Ideen, die
später aufgegriffen werden können, statt sie im Chat-Verlauf verloren gehen zu lassen.

## Offen

### Nutzer-Einträge für Bikertreffs
**Aufgenommen:** 02.10.2026
Die aktuelle Bikertreff-Liste (`BIKER_MEETUPS` in `index.html`) ist fest im Code hinterlegt und von mir
recherchiert/kuratiert. Später soll es Nutzern möglich sein, eigene Bikertreffs vorzuschlagen oder
einzutragen (z. B. über ein einfaches Formular, das an den Cloudflare Worker geht und in einer
Datenbank landet statt im Code). Offene Fragen für die Umsetzung: Moderation/Prüfung vor
Veröffentlichung (Spam-/Missbrauchsschutz), ob Einträge sofort live gehen oder erst nach Freigabe,
und ob das in dieselbe POI-Datenbank (D1) einfließt, die gerade für Café/Tankstelle/Straßendaten
aufgebaut wird, oder eine eigene Tabelle braucht.

---

## Format für neue Einträge

```
### Kurzer Feature-Titel
**Aufgenommen:** TT.MM.JJJJ
1-3 Sätze: was die Idee ist, warum sie nützlich wäre, offene Fragen/Risiken falls bekannt.
```
