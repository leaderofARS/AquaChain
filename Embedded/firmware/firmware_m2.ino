/*
 Single-file Arduino IDE version of Milestone 2 firmware (networked + queue + control)
 Copy this into Arduino IDE if you prefer not to use PlatformIO.
 Fill the Wi-Fi and backend constants below before uploading.
*/

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FS.h>
#include <LittleFS.h>
#include <time.h>
#include "DHT.h"

// Inline configuration
static const char* WIFI_SSID    = "ARS8608";
static const char* WIFI_PASS    = "WPA-1ARS";
static const char* BACKEND_HOST = "10.42.2.92";  // ARS Wi-Fi IP
static const uint16_t BACKEND_PORT = 3000;
static const char* DEVICE_ID    = "esp32-dev-01";
static const char* DEVICE_ZONE  = "A";
static const char* DEVICE_TOKEN = "replace-with-device-token";

// Hysteresis thresholds (% moisture)
static const int MOISTURE_LOW  = 30;
static const int MOISTURE_HIGH = 40;

// Relay minimum ON/OFF durations (milliseconds)
static const unsigned long MIN_ON_MS  = 60000;  // 60s
static const unsigned long MIN_OFF_MS = 60000;  // 60s

// Sampling and networking intervals
static const unsigned long SAMPLE_INTERVAL_MS       = 2000;
static const unsigned long POST_INTERVAL_MS         = 5000;
static const unsigned long CONTROL_POLL_MS          = 7000;
static const unsigned long QUEUE_FLUSH_INTERVAL_MS  = 8000;

// Soil sensor calibration (adjust after testing)
#define AIR_VALUE    3200  // Dry soil
#define WATER_VALUE  1400  // Wet soil

// Pins
static const int SENSOR_PIN = 33;   // ADC1
static const int RELAY_PIN  = 25;   // Relay control

// DHT11 setup
#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// Sliding window for soil moisture (%)
static const size_t WINDOW_SIZE = 10;
float moistureBuf[WINDOW_SIZE];
size_t moistureIdx = 0;
size_t moistureCount = 0;

// Relay state and timing
bool relayOn = false;
unsigned long lastRelayChangeMs = 0;

// Manual override via control API
unsigned long manualIrrigateUntilMs = 0;

// Queue file
static const char* QUEUE_FILE = "/queue.jsonl";

unsigned long nowMs() { return millis(); }

void wifiConnect() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = nowMs();
  while (WiFi.status() != WL_CONNECTED && nowMs() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected: %s\n", WiFi.localIP().toString().c_str());
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println("[WiFi] Failed to connect");
  }
}

unsigned long currentEpoch() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 100)) {
    time_t now;
    time(&now);
    return (unsigned long) now;
  }
  return (unsigned long)(millis() / 1000UL);
}

int readSoilRaw() {
  return analogRead(SENSOR_PIN);
}

float adcToVoltage(int adc) {
  return (adc / 4095.0f) * 3.3f;
}

int adcToPercent(int adc) {
  int pct = map(adc, AIR_VALUE, WATER_VALUE, 0, 100);
  return constrain(pct, 0, 100);
}

float updateMoistureAvg(int moisturePct) {
  moistureBuf[moistureIdx] = moisturePct;
  moistureIdx = (moistureIdx + 1) % WINDOW_SIZE;
  if (moistureCount < WINDOW_SIZE) moistureCount++;
  float sum = 0;
  for (size_t i = 0; i < moistureCount; ++i) sum += moistureBuf[i];
  return sum / (float) moistureCount;
}

void setRelay(bool on) {
  relayOn = on;
  lastRelayChangeMs = nowMs();
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
}

bool canTurnOn()  { return nowMs() - lastRelayChangeMs >= MIN_OFF_MS; }
bool canTurnOff() { return nowMs() - lastRelayChangeMs >= MIN_ON_MS; }

void applyDecision(float avgMoisture) {
  bool wantIrrigate = (avgMoisture < MOISTURE_LOW);
  bool wantStop     = (avgMoisture > MOISTURE_HIGH);

  if (nowMs() < manualIrrigateUntilMs) {
    wantIrrigate = true;
    wantStop = false;
  }

  if (!relayOn && wantIrrigate && canTurnOn()) {
    setRelay(true);
  } else if (relayOn && wantStop && canTurnOff()) {
    setRelay(false);
  }
}

String canonicalizeSnapshot(const JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  return out;
}

bool httpPostJson(const String& url, const String& token, const String& body, int& httpCode, String& resp) {
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(6000);
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", token);
  httpCode = http.POST((uint8_t*)body.c_str(), body.length());
  resp = http.getString();
  http.end();
  return httpCode >= 200 && httpCode < 300;
}

void appendQueueLine(const String& jsonLine) {
  File f = LittleFS.open(QUEUE_FILE, FILE_APPEND);
  if (!f) {
    Serial.println("[Queue] Open append failed");
    return;
  }
  f.println(jsonLine);
  f.close();
  Serial.println("[Queue] Enqueued snapshot");
}

int readQueueLines(String lines[], size_t maxLines) {
  File f = LittleFS.open(QUEUE_FILE, FILE_READ);
  if (!f) return 0;
  size_t count = 0;
  while (f.available() && count < maxLines) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) { lines[count++] = line; }
  }
  f.close();
  return (int)count;
}

void truncateQueueBy(size_t flushed) {
  File in = LittleFS.open(QUEUE_FILE, FILE_READ);
  if (!in) return;
  File tmp = LittleFS.open("/queue.tmp", FILE_WRITE);
  if (!tmp) { in.close(); return; }
  size_t idx = 0;
  while (in.available()) {
    String line = in.readStringUntil('\n');
    if (line.length() == 0) continue;
    if (idx++ >= flushed) tmp.println(line);
  }
  in.close();
  tmp.close();
  LittleFS.remove(QUEUE_FILE);
  LittleFS.rename("/queue.tmp", QUEUE_FILE);
}

void flushQueueIfNeeded(unsigned long& lastFlushMs) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (nowMs() - lastFlushMs < QUEUE_FLUSH_INTERVAL_MS) return;

  String batch[10];
  int n = readQueueLines(batch, 10);
  if (n <= 0) { lastFlushMs = nowMs(); return; }

  DynamicJsonDocument arrDoc(4096);
  JsonArray arr = arrDoc.to<JsonArray>();
  for (int i = 0; i < n; ++i) {
    DynamicJsonDocument tmp(1024);
    DeserializationError err = deserializeJson(tmp, batch[i]);
    if (!err) arr.add(tmp);
  }
  String body;
  serializeJson(arrDoc, body);

  String url = String("http://") + BACKEND_HOST + ":" + String(BACKEND_PORT) + "/api/sync";
  int code = 0; String resp;
  bool ok = httpPostJson(url, DEVICE_TOKEN, body, code, resp);
  if (ok) {
    truncateQueueBy(n);
    Serial.printf("[Queue] Flushed %d entries\n", n);
  } else {
    Serial.printf("[Queue] Flush failed: code=%d resp=%s\n", code, resp.c_str());
  }
  lastFlushMs = nowMs();
}

void pollControlIfNeeded(unsigned long& lastPollMs) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (nowMs() - lastPollMs < CONTROL_POLL_MS) return;

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(5000);
  String url = String("http://") + BACKEND_HOST + ":" + String(BACKEND_PORT) + "/api/control?device=" + DEVICE_ID;
  if (http.begin(client, url)) {
    int code = http.GET();
    if (code >= 200 && code < 300) {
      String payload = http.getString();
      DynamicJsonDocument doc(2048);
      if (deserializeJson(doc, payload) == DeserializationError::Ok) {
        if (doc.is<JsonArray>()) {
          for (JsonObject cmd : doc.as<JsonArray>()) {
            if (cmd["force_irrigate"] == true) {
              int dur = cmd["duration_sec"] | 30;
              manualIrrigateUntilMs = nowMs() + (unsigned long)dur * 1000UL;
              Serial.printf("[Control] Force irrigate for %d sec\n", dur);
            }
          }
        } else if (doc.is<JsonObject>()) {
          if (doc["force_irrigate"] == true) {
            int dur = doc["duration_sec"] | 30;
            manualIrrigateUntilMs = nowMs() + (unsigned long)dur * 1000UL;
            Serial.printf("[Control] Force irrigate for %d sec\n", dur);
          }
        }
      }
    }
    http.end();
  }
  lastPollMs = nowMs();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("[M2] ESP32 Smart Irrigation with Queue + Control");

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  dht.begin();

  if (!LittleFS.begin(true)) {
    Serial.println("[FS] LittleFS mount failed, formatting...");
    LittleFS.begin(true);
  }

  wifiConnect();
}

void loop() {
  static unsigned long lastSampleMs = 0;
  static unsigned long lastPostMs = 0;
  static unsigned long lastFlushMs = 0;
  static unsigned long lastPollMs = 0;

  if (nowMs() - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = nowMs();

    int raw = readSoilRaw();
    float voltage = adcToVoltage(raw);
    int moisturePct = adcToPercent(raw);
    float moistureAvg = updateMoistureAvg(moisturePct);

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    applyDecision(moistureAvg);

    DynamicJsonDocument doc(1024);
    doc["device_id"] = DEVICE_ID;
    doc["zone"] = DEVICE_ZONE;
    doc["ts"] = currentEpoch();
    doc["soil_moisture"] = (int)round(moistureAvg);
    if (isnan(temperature)) { doc["temp_c"] = nullptr; } else { doc["temp_c"] = temperature; }
    if (isnan(humidity)) { doc["humidity_pct"] = nullptr; } else { doc["humidity_pct"] = humidity; }
    doc["valve_state"] = relayOn ? 1 : 0;
    doc["edge_decision"] = relayOn ? "irrigate_on" : "irrigate_off";
    JsonObject rawObj = doc.createNestedObject("raw");
    rawObj["adc"] = raw;
    rawObj["voltage"] = voltage;

    String body = canonicalizeSnapshot(doc);

    if (nowMs() - lastPostMs >= POST_INTERVAL_MS) {
      lastPostMs = nowMs();
      wifiConnect();
      if (WiFi.status() == WL_CONNECTED) {
        String url = String("http://") + BACKEND_HOST + ":" + String(BACKEND_PORT) + "/api/sensor";
        int code = 0; String resp;
        bool ok = httpPostJson(url, DEVICE_TOKEN, body, code, resp);
        if (ok) {
          Serial.println("[POST] /api/sensor 200 OK");
        } else {
          Serial.printf("[POST] Failed code=%d; queuing\n", code);
          appendQueueLine(body);
        }
      } else {
        appendQueueLine(body);
      }
    } else {
      if (WiFi.status() != WL_CONNECTED) appendQueueLine(body);
    }
  }

  flushQueueIfNeeded(lastFlushMs);
  pollControlIfNeeded(lastPollMs);
}

