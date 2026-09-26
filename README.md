# MeshCore Auto-Pong

Kleines Lesezeichen-Hub-Modul zur Konfiguration der persistenten Firmware-Einstellungen `autopong`, `autopong_loc` und vier Auto-Reply-Regeln per Web Bluetooth. Zusätzlich zeigt es den Repeater-Zustand, das aktuelle Funkprofil und die von der Firmware erlaubten Repeater-Frequenzen an.

## Voraussetzungen

- MeshCore-Companion-Firmware ab `autoreply-v1.0.8`
- Für den vollständigen Hauptnetz-Repeater-Status wird `autoreply-v1.0.21` oder neuer empfohlen
- Bluetooth-Variante der Firmware (`*_companion_radio_ble`)
- Chrome oder Edge unter Windows; das MeshCore-Geraet vorher in Windows unter **Bluetooth & Geraete** koppeln und den PIN eingeben
- Keine andere MeshCore-App darf gleichzeitig per Bluetooth verbunden sein

## Start

Die veröffentlichte WebApp ist unter
[lesezeichen-hub.github.io/meshcore-autopong_location](https://lesezeichen-hub.github.io/meshcore-autopong_location/)
verfügbar.

Im Lesezeichen-Hub unter **Module** ein lokales Modul anlegen und diesen Ordner auswaehlen. Alternativ in diesem Ordner ausfuehren:

```powershell
python -m http.server 8000
```

Danach `http://localhost:8000` in Chrome oder Edge oeffnen.

## Bedienung

1. **Mit MeshCore verbinden** klicken und das gekoppelte Geraet auswaehlen.
2. Auto-Pong aktivieren/deaktivieren.
3. Die Ortsangabe, beispielsweise `01705`, eintragen und **Speichern** klicken.
4. Optional bis zu vier Auto-Reply-Regeln mit Kanal, Schlüsselwort und Antworttext anlegen und **Regeln speichern** klicken.

Der Repeater-Bereich zeigt nach dem Verbinden, ob die Weiterleitung aktiv ist, welches Funkprofil aktuell verwendet wird und welche Frequenzen für den Repeater freigegeben sind. Ein aktiver Repeater mit unpassender Frequenz wird deutlich als Warnung markiert. Das Ein- und Ausschalten erfolgt weiterhin bewusst in der MeshCore-App.

Die Seite liest und schreibt die Firmware-Custom-Variables `autopong` und `autopong_loc` sowie die vier persistenten Auto-Reply-Slots. Alle Werte bleiben auf dem Geraet nach Neustart und Stromverlust erhalten.

## Regel-Syntax

- Kanal: `public` oder `#public`; Groß-/Kleinschreibung wird ignoriert.
- Schlüsselwort: Wird ohne Beachtung der Groß-/Kleinschreibung im gesamten Nachrichtentext gesucht.
- Platzhalter im Antworttext: `{name}` für den Absender, `{plz}` für die gespeicherte Ortsangabe und `{hops}` für die Hop-Anzahl.

Beispiel: `Hallo {name}, Standort {plz}, Nachricht über {hops} Hops empfangen.`

## Lesezeichen-Hub

Die Modulversion folgt dem Lesezeichen-Hub-Schema in `version.json`. Bei einer neuen Version `version` nach Semantic Versioning und `updated_at` gemeinsam aktualisieren.
