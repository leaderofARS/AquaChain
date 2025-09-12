# Embedded (ESP32) — Milestone 2

This folder contains two firmware variants:
- Baseline (simple sensors + relay): src/main.ino
- Networked M2 (queue + control + HTTP): src/m2_main.ino

Quick start
1) Install PlatformIO (already set up by earlier steps).
2) Copy config.h.example to config.h and fill in Wi‑Fi and backend details.
   - Use your PC's LAN IP for BACKEND_HOST (not localhost)
   - Set DEVICE_ID and DEVICE_TOKEN to match your backend allowlist
3) Connect ESP32 via USB; ensure it appears as COM3 (or adjust in platformio.ini).
4) Build and upload the M2 firmware:
   - Build: platformio run -d embedded -e esp32dev_m2
   - Upload: platformio run -d embedded -e esp32dev_m2 --target upload
   - Monitor: platformio device monitor -d embedded -e esp32dev_m2 --baud 115200

Wiring (same as baseline)
- Soil moisture sensor (capacitive): AO → GPIO33 (ADC1), VCC 3.3V (preferred), GND common
- DHT11: Data → GPIO4 (+ 10k pull‑up to 3.3V if breakout lacks it), VCC 3.3V, GND common
- Relay module: IN → GPIO25, VCC and GND per module specs (active‑LOW modules invert logic; adjust later if needed)

Behavior
- Samples every SAMPLE_INTERVAL_MS; computes a sliding average across the last 10 readings.
- Hysteresis: turns irrigation ON when avg < MOISTURE_LOW; turns OFF when avg > MOISTURE_HIGH.
- Enforces minimum ON and OFF durations (MIN_ON_MS / MIN_OFF_MS) to prevent relay chatter.
- Posts snapshots to http://BACKEND_HOST:BACKEND_PORT/api/sensor with X-Device-Token header.
- If offline, appends snapshots to LittleFS /queue.jsonl.
- Periodically flushes the queue (batch of 10) to /api/sync when back online.
- Polls control commands from /api/control?device=DEVICE_ID; if force_irrigate, irrigates for duration_sec.

Notes
- Set AIR_VALUE and WATER_VALUE from your calibration measurements (dry air vs saturated soil). Set thresholds accordingly.
- Time is synced via NTP when Wi‑Fi is connected; falls back to millis()/1000 if NTP is unavailable.
- If LittleFS mount fails on first boot, it is auto‑formatted.
- Active‑LOW relays may require inverting the logic in setRelay(); validate with pump disconnected first.
