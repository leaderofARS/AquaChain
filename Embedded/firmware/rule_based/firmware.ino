#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FS.h>
#include <LittleFS.h>
#include "DHT.h"

// Copy config.example.h to config.h and fill your credentials
#include "config.h"

// Pins
#define DHTPIN 4
#define DHTTYPE DHT11
const int SOIL_PIN = 33;
const int RELAY_PIN = 25;

// Calibration (adjust after your tests)
const int AIR_VALUE = 3200;   // dry
const int WATER_VALUE = 1400; // wet

// Hysteresis thresholds and timing (to prevent relay chattering)
const int MOISTURE_ON_THRESHOLD = 30;   // turn ON below this (dry)
const int MOISTURE_OFF_THRESHOLD = 40;  // turn OFF above this (rewet)
const unsigned long MIN_RELAY_CYCLE_MS = 1000UL; // basic debounce between toggles
const unsigned long MIN_ON_MS = 5000UL;  // minimum time to keep pump ON
const unsigned long MIN_OFF_MS = 3000UL; // minimum time to keep pump OFF

// Sliding window
const int WINDOW_SIZE = 10;
int windowBuf[WINDOW_SIZE];
int wIdx = 0, wCount = 0;

// Relay state
bool relayOn = false;
unsigned long lastRelayChange = 0;
unsigned long lastOnTime = 0;
unsigned long lastOffTime = 0;

// WiFi reconnect
unsigned long lastWiFiAttempt = 0;
const unsigned long WIFI_RETRY_MS = 10000;
bool wifiWasConnected = false;

// DHT
DHT dht(DHTPIN, DHTTYPE);

// Queue
const char* QUEUE_FILE = "/queue.jsonl";

String backendBase() {
  String url = String("http://") + BACKEND_HOST + ":" + BACKEND_PORT;
  return url;
}

void ensureFS() {
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed; queue disabled");
  }
}

void enqueueSnapshot(const String& line) {
  File f = LittleFS.open(QUEUE_FILE, FILE_APPEND);
  if (!f) {
    Serial.println("Queue open failed");
    return;
  }
  f.println(line);
  f.close();
}

void trySyncQueue() {
  if (!LittleFS.exists(QUEUE_FILE)) return;
  File f = LittleFS.open(QUEUE_FILE, FILE_READ);
  if (!f) return;

  // Build JSON array for /api/sync
  DynamicJsonDocument doc(65536);
  JsonArray arr = doc.to<JsonArray>();

  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (line.length() < 2) continue;
    DynamicJsonDocument d(2048);
    DeserializationError err = deserializeJson(d, line);
    if (!err) arr.add(d);
  }
  f.close();

  if (arr.size() == 0) return;

  String payload;
  serializeJson(arr, payload);

  HTTPClient http;
  String url = backendBase() + "/api/sync";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  int code = http.POST(payload);
  if (code == 200) {
    Serial.println("Queue synced, clearing");
    LittleFS.remove(QUEUE_FILE);
  } else {
    Serial.printf("Queue sync failed: %d\n", code);
  }
  http.end();
}

int moisturePercentFromAdc(int adc) {
  long m = map(adc, AIR_VALUE, WATER_VALUE, 0, 100);
  if (m < 0) m = 0; if (m > 100) m = 100;
  return (int)m;
}

int slidingAvg(int v) {
  windowBuf[wIdx] = v; wIdx = (wIdx + 1) % WINDOW_SIZE; if (wCount < WINDOW_SIZE) wCount++;
  long sum = 0; for (int i = 0; i < wCount; ++i) sum += windowBuf[i];
  return (int)(sum / (wCount > 0 ? wCount : 1));
}

// Read soil ADC with simple noise reduction (5 samples, drop min/max)
int readSoilADC() {
  const int N = 5;
  int samples[N];
  for (int i = 0; i < N; i++) { samples[i] = analogRead(SOIL_PIN); delay(5); }
  int sum = 0, minv = 4095, maxv = 0;
  for (int i = 0; i < N; i++) { int s = samples[i]; sum += s; if (s < minv) minv = s; if (s > maxv) maxv = s; }
  return (sum - minv - maxv) / (N - 2);
}

void setRelay(bool on) {
  unsigned long now = millis();
  if (relayOn == on) return;
  if (now - lastRelayChange < MIN_RELAY_CYCLE_MS) return; // protect relay
  relayOn = on; lastRelayChange = now;
  if (relayOn) lastOnTime = now; else lastOffTime = now;
  digitalWrite(RELAY_PIN, relayOn ? HIGH : LOW);
}

void postSnapshot(JsonObject obj) {
  String payload; serializeJson(obj, payload);

  HTTPClient http;
  String url = backendBase() + "/api/sensor";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  int code = http.POST(payload);
  if (code == 200) {
    Serial.println("POST /api/sensor OK");
  } else {
    Serial.printf("POST failed (%d), enqueueing...\n", code);
    enqueueSnapshot(payload);
  }
  http.end();
}

void pollControl() {
  HTTPClient http;
  String url = backendBase() + "/api/control?device=" + DEVICE_ID;
  http.begin(url);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    // Minimal example: expect {"force_relay": true|false} if present
    DynamicJsonDocument d(1024);
    if (deserializeJson(d, body) == DeserializationError::Ok) {
      if (d.containsKey("force_relay")) {
        bool fr = d["force_relay"].as<bool>();
        setRelay(fr);
        Serial.printf("Control: force_relay=%s\n", fr ? "true" : "false");
      }
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\nBooting rule-based firmware...");

pinMode(RELAY_PIN, OUTPUT);
digitalWrite(RELAY_PIN, LOW); // off
lastOffTime = millis();
lastRelayChange = millis();

dht.begin();
ensureFS();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to WiFi %s", WIFI_SSID);
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 60) {
    delay(500); Serial.print("."); retries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    wifiWasConnected = true;
    Serial.print("WiFi OK. IP: "); Serial.println(WiFi.localIP());
  } else {
    wifiWasConnected = false;
    Serial.println("WiFi not connected; will operate offline and queue");
  }
}

unsigned long lastPost = 0;
unsigned long lastControlPoll = 0;

void loop() {
  // WiFi reconnect logic
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED && (now - lastWiFiAttempt > WIFI_RETRY_MS)) {
    lastWiFiAttempt = now;
    Serial.print("Reconnecting WiFi...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  if (WiFi.status() == WL_CONNECTED && !wifiWasConnected) {
    wifiWasConnected = true;
    Serial.print("WiFi OK. IP: "); Serial.println(WiFi.localIP());
    // Attempt to sync any queued data once connected
    trySyncQueue();
  }
  if (WiFi.status() != WL_CONNECTED && wifiWasConnected) {
    wifiWasConnected = false;
    Serial.println("WiFi lost; offline mode");
  }

// Read sensors (noise-reduced ADC)
int adc = readSoilADC();
int moisture = moisturePercentFromAdc(adc);
int avgMoisture = slidingAvg(moisture);
float humidity = dht.readHumidity();
float tempC = dht.readTemperature();

// Simple condition: relay ON only when instantaneous moisture < 30%
bool desired = (moisture < 30);
setRelay(desired);

  // Build snapshot
  DynamicJsonDocument doc(1024);
  JsonObject snap = doc.to<JsonObject>();
  snap["device_id"] = DEVICE_ID;
  snap["zone"] = DEVICE_ZONE;
  snap["ts"] = (long long) (millis());
  snap["soil_adc"] = adc;
  snap["soil_moisture_pct"] = moisture;
  snap["soil_avg_pct"] = avgMoisture;
  if (!isnan(humidity)) snap["humidity_pct"] = humidity;
  if (!isnan(tempC)) snap["temp_c"] = tempC;
  snap["relay_state"] = relayOn ? 1 : 0;

  // Periodic POST and queue sync every ~5s if connected
  unsigned long now2 = millis();
  if (WiFi.status() == WL_CONNECTED) {
    if (now2 - lastPost > 5000) { lastPost = now2; postSnapshot(snap); trySyncQueue(); }
    if (now2 - lastControlPoll > 7000) { lastControlPoll = now2; pollControl(); }
  } else {
    // If offline, just queue locally every ~10s
    if (now2 - lastPost > 10000) { lastPost = now2; String line; serializeJson(snap, line); enqueueSnapshot(line); }
  }

  // Debug
  Serial.printf("ADC=%d, moist=%d%%, avg=%d%%, relay=%s\n", adc, moisture, avgMoisture, relayOn?"ON":"OFF");

  delay(200); // more responsive (<1s) reaction time
}

