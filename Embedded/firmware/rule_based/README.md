# Rule-based Firmware (ESP32 DevKit V1)

This folder contains a non-blocking, rule-based ESP32 firmware that:
- Reads soil moisture (analog), DHT11 (temp/humidity)
- Applies sliding-window and hysteresis logic for relay control
- Posts snapshots to backend `POST /api/sensor` with header `X-Device-Token`
- Queues unsent snapshots to LittleFS at `/queue.jsonl` when offline
- Periodically tries to sync queue to `POST /api/sync`
- Polls control commands via `GET /api/control?device=DEVICE_ID`

Wiring (default pins):
- Soil moisture sensor analog → GPIO 33
- Relay IN → GPIO 25
- DHT11 data → GPIO 4

Setup
1) Install libraries in Arduino IDE or PlatformIO:
   - ArduinoJson
   - DHT sensor library (Adafruit)
   - LittleFS for ESP32
2) Copy `config.example.h` to `config.h` and set:
   - WIFI_SSID, WIFI_PASSWORD
   - BACKEND_HOST (PC LAN IP) and BACKEND_PORT (default 5000)
   - DEVICE_ID, DEVICE_ZONE, DEVICE_TOKEN
3) Flash to ESP32 DevKit V1.

PlatformIO (optional)
- See `../../platformio.ini` for an example environment. Run:
  pio run --target upload -e esp32dev

Troubleshooting
- If LittleFS mount fails, ensure the ESP32 LittleFS library is installed. You can temporarily disable queueing.
- If HTTP fails, check that your PC firewall allows access to the backend port.

