#include <Arduino.h>
#include "DHT.h"
#include <FS.h>
#include <LittleFS.h>

// TinyML
#include "scaler_params.h"
#include <tflm_esp32.h>
#include <eloquent_tinyml.h>

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

// TinyML model
#define N_INPUTS 5
#define N_OUTPUTS 1
#define ARENA_SIZE 120*1024
#define TF_NUM_OPS 5
Eloquent::TF::Sequential<TF_NUM_OPS, ARENA_SIZE> tf;

float avgMoisture() {
  float sum = 0; for (int i=0;i<wCount;i++) sum += moistureBuf[i];
  return wCount ? sum / wCount : 0;
}

float slopeMoisture() {
  if (wCount < WINDOW) return 0;
  int firstIdx = (wIdx + WINDOW) % WINDOW; // element overwritten next
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

  tf.setNumInputs(5);
  tf.setNumOutputs(1);
  tf.resolver.AddFullyConnected();
  tf.resolver.AddAdd();
  tf.resolver.AddSub();
  tf.resolver.AddMul();
  tf.resolver.AddRelu();
  while (!tf.begin((unsigned char*) g_model, g_model_len).isOk()) {
    Serial.println(tf.exception.toString());
    delay(500);
  }
  Serial.println("TFLM ready");
}

void loop() {
  int adc = analogRead(SOIL_PIN);
  const int AIR_VALUE = 3200;   // dry
  const int WATER_VALUE = 1400; // wet
  float moisture_pct = (float) map(adc, AIR_VALUE, WATER_VALUE, 0, 100);
  if (moisture_pct < 0) moisture_pct = 0; if (moisture_pct > 100) moisture_pct = 100;

  float tempC = dht.readTemperature();
  float humidity = dht.readHumidity();
  if (isnan(tempC)) tempC = 25.0;
  if (isnan(humidity)) humidity = 50.0;

  moistureBuf[wIdx] = moisture_pct; wIdx = (wIdx + 1) % WINDOW; if (wCount < WINDOW) wCount++;
  float avg = avgMoisture();
  float slope = slopeMoisture();

  float hour_norm = ((millis() / 3600000UL) % 24) / 24.0;
  float battery = 100.0;

  float x[N_INPUTS] = { avg, slope, tempC, hour_norm, battery };

  float xs[N_INPUTS];
  for (int i=0;i<N_INPUTS;i++) {
    float s = SCALER_STD[i];
    xs[i] = (x[i] - SCALER_MEAN[i]) / (s == 0 ? 1.0f : s);
  }

  // Inference with Eloquent
  unsigned long t0 = micros();
  auto res = tf.predict(xs);
  unsigned long dt = micros() - t0;
  if (!res.isOk()) {
    Serial.println(tf.exception.toString());
    delay(500);
    return;
  }
  float y = tf.output(0);

  Serial.print("Inference time (us): "); Serial.println(dt);
  Serial.print("Prob irrigate: "); Serial.println(y, 4);

  // Simple condition: relay ON only when instantaneous moisture < 30%
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

