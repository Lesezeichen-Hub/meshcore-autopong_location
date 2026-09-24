# MeshCore Auto-Pong

Kleines Lesezeichen-Hub-Modul zur Konfiguration der persistenten Firmware-Einstellungen `autopong` und `autopong_loc` per Web Bluetooth.

## Voraussetzungen

- MeshCore-Companion-Firmware ab `autoreply-v1.0.5`
- Bluetooth-Variante der Firmware (`*_companion_radio_ble`)
- Chrome oder Edge unter Windows; das MeshCore-Geraet vorher in Windows unter **Bluetooth & Geraete** koppeln und den PIN eingeben
- Keine andere MeshCore-App darf gleichzeitig per Bluetooth verbunden sein

## Start

Im Lesezeichen-Hub unter **Module** ein lokales Modul anlegen und diesen Ordner auswaehlen. Alternativ in diesem Ordner ausfuehren:

```powershell
python -m http.server 8000
```

Danach `http://localhost:8000` in Chrome oder Edge oeffnen.

## Bedienung

1. **Mit MeshCore verbinden** klicken und das gekoppelte Geraet auswaehlen.
2. Auto-Pong aktivieren/deaktivieren.
3. Die Ortsangabe, beispielsweise `01705`, eintragen und **Speichern** klicken.

Die Seite liest und schreibt die Firmware-Custom-Variables `autopong` und `autopong_loc`. Die Werte bleiben auf dem Geraet nach Neustart und Stromverlust erhalten.

## Lesezeichen-Hub

Die Modulversion folgt dem Lesezeichen-Hub-Schema in `version.json`. Bei einer neuen Version `version` nach Semantic Versioning und `updated_at` gemeinsam aktualisieren.
