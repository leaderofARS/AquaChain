#include <Arduino.h>
#include "DHT.h"
#include <FS.h>
#include <LittleFS.h>

// TinyML
#include <eloquent_tinyml.h>
#include "scaler_params.h"

// Model data
extern const unsigned char g_model[];
extern const int g_model_len;

// Pins
#define DHTPIN 4
#define DHTTYPE DHT11
const int SOIL_PIN = 33;
const int RELAY_PIN = 25;

DHT dht(DHTPIN, DHTTYPE);

// Sliding window for avg and slope
const int WINDOW = 5;
float moistureBuf[WINDOW];
int wIdx = 0, wCount = 0;

// Relay logic
bool relayOn = false;
unsigned long lastRelayChange = 0;
const unsigned long MIN_RELAY_CYCLE_MS = 1000UL;

// EloquentTinyML template expects dimensions at compile-time
#define N_INPUTS 5
#define N_OUTPUTS 1
#define TENSOR_ARENA_SIZE 120*1024
Eloquent::TinyML::TfLite<N_INPUTS, N_OUTPUTS, TENSOR_ARENA_SIZE> ml;

float avgMoisture() {
  float sum = 0; for (int i=0;i<wCount;i++) sum += moistureBuf[i];
  return wCount ? sum / wCount : 0;
}

float slopeMoisture() {
  if (wCount < WINDOW) return 0;
  // slope approximated as (last - first)/WINDOW
  int firstIdx = (wIdx + WINDOW) % WINDOW; // element that will be overwritten next
  int lastIdx = (wIdx + WINDOW - 1) % WINDOW;
  return (moistureBuf[lastIdx] - moistureBuf[firstIdx]) / WINDOW;
}

void setRelay(bool on) {
  unsigned long now = millis();
  if (on != relayOn && (now - lastRelayChange >= MIN_RELAY_CYCLE_MS)) {
    relayOn = on; lastRelayChange = now;
    digitalWrite(RELAY_PIN, relayOn ? HIGH : LOW);
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  dht.begin();
  LittleFS.begin(true);

  // Init TFLM
  bool ok = ml.begin((unsigned char*) g_model, g_model_len);
  if (!ok) {
    Serial.println("TFLM init failed");
  } else {
    Serial.println("TFLM ready");
  }
}

void loop() {
  // Read sensors
  int adc = analogRead(SOIL_PIN);
  // Map ADC to percentage similar to rule_based (adjust calibration as needed)
  const int AIR_VALUE = 3200;   // dry
  const int WATER_VALUE = 1400; // wet
  float moisture_pct = (float) map(adc, AIR_VALUE, WATER_VALUE, 0, 100);
  if (moisture_pct < 0) moisture_pct = 0; if (moisture_pct > 100) moisture_pct = 100;

  float tempC = dht.readTemperature();
  float humidity = dht.readHumidity();
  if (isnan(tempC)) tempC = 25.0;
  if (isnan(humidity)) humidity = 50.0;

  // Update sliding window
  moistureBuf[wIdx] = moisture_pct; wIdx = (wIdx + 1) % WINDOW; if (wCount < WINDOW) wCount++;
  float avg = avgMoisture();
  float slope = slopeMoisture();

  // Hour normalized (0..1) using millis (no RTC); in production use real UTC
  float hour_norm = ((millis() / 3600000UL) % 24) / 24.0;
  float battery = 100.0;

  // Build feature vector
  float x[N_INPUTS] = { avg, slope, tempC, hour_norm, battery };

  // Apply scaler: (x - mean) / std
  float xs[N_INPUTS];
  for (int i=0;i<N_INPUTS;i++) {
    float s = SCALER_STD[i];
    xs[i] = (x[i] - SCALER_MEAN[i]) / (s == 0 ? 1.0f : s);
  }

  // Inference
  unsigned long t0 = micros();
  float y = ml.predict(xs);
  unsigned long dt = micros() - t0;

  // Print
  Serial.print("Inference time (us): "); Serial.println(dt);
  Serial.print("Prob irrigate: "); Serial.println(y, 4);

  // Decision: only turn relay ON when moisture < 30%
  bool decision = (moisture_pct < 30.0f);
  setRelay(decision);

  Serial.print("ADC="); Serial.print(adc);
  Serial.print(", moist="); Serial.print(moisture_pct);
  Serial.print("%, avg="); Serial.print(avg);
  Serial.print(", slope="); Serial.print(slope);
  Serial.print(", temp="); Serial.print(tempC);
  Serial.print(" C, relay="); Serial.println(relayOn ? "ON" : "OFF");

  delay(500);
}
