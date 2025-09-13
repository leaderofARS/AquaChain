/*
  Soil Moisture + Relay + DHT11 baseline sketch
  This is the exact sketch you provided, preserved under examples.
*/

/****************************************************
  ESP32 Soil Moisture Sensor + Relay Control + DHT11
  --------------------------------------------------
  - Soil sensor analog output → GPIO 33
  - Relay IN pin → GPIO 25
  - DHT11 sensor data pin → GPIO 4 (change if needed)
****************************************************/

#include "DHT.h"

// ====== DHT11 Setup ======
#define DHTPIN 4     // GPIO where the DHT11 data pin is connected
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ====== Soil Moisture & Relay Setup ======
const int sensorPin = 33;   // Soil moisture sensor connected to GPIO 33
const int relayPin  = 25;   // Relay control pin

int sensorValue = 0;        // Raw ADC value
float voltage = 0.0;        // Calculated voltage
int moisturePercent = 0;    // Moisture percentage

// ====== Calibration values (adjust after testing) ======
const int airValue   = 3200;  // Dry soil (air)
const int waterValue = 1400;  // Wet soil (water)

// ====== Threshold for relay activation ======
const int moistureThreshold = 30;  // Below this % = soil is dry → relay OFF

void setup() {
  Serial.begin(115200);

  // Relay pin setup
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW); // Relay OFF initially

  // Start DHT sensor
  dht.begin();

  delay(1000);
  Serial.println("ESP32 Soil Moisture + Relay + DHT11 Test");
}

void loop() {
  // === Soil Moisture Section ===
  sensorValue = analogRead(sensorPin);

  // Convert ADC value into voltage (0–3.3V)
  voltage = (sensorValue / 4095.0) * 3.3;

  // Map sensor value into percentage
  moisturePercent = map(sensorValue, airValue, waterValue, 0, 100);

  // Constrain to 0–100%
  moisturePercent = constrain(moisturePercent, 0, 100);

  // === DHT11 Section ===
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature(); // °C by default

  // Check if DHT11 readings failed
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
  }

  // === Print All Readings ===
  Serial.println("----------- Sensor Readings -----------");
  Serial.print("Soil Raw ADC: ");
  Serial.println(sensorValue);

  Serial.print("Soil Voltage: ");
  Serial.print(voltage, 2);
  Serial.println(" V");

  Serial.print("Soil Moisture: ");
  Serial.print(moisturePercent);
  Serial.println(" %");

  if (!isnan(humidity) && !isnan(temperature)) {
    Serial.print("Air Temp: ");
    Serial.print(temperature);
    Serial.print(" °C  ");
    Serial.print("Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");
  }

  // === Relay Control Logic ===
  // Relay OFF when moisture < threshold (soil too dry)
  // Relay ON when moisture >= threshold (soil ok/wet)
  if (moisturePercent > moistureThreshold) {
    // Soil dry → relay OFF
    Serial.println("Status: Soil is DRY 🌵 → Relay OFF");
    digitalWrite(relayPin, LOW); // Relay OFF (pump OFF)
  } else {
    // Soil moisture ok → relay ON
    Serial.println("Status: Soil moisture < threshold 🌱 → Relay ON");
    digitalWrite(relayPin, HIGH); // Relay ON (pump ON)
  }

  Serial.println("---------------------------------------\n");

  delay(2000); // Wait before next reading
}

