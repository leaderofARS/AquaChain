# models/generate_synthetic.py
import csv, math, random, datetime
import json

def gen_row(t, baseline_m=45.0):
    # simulate diurnal moisture changes and irrigation events
    hour = t.hour + t.minute/60.0
    # slow dryness drift
    drift = -0.02 * (t.hour % 24)
    noise = random.uniform(-1.5, 1.5)
    moisture = baseline_m + 10*math.sin(hour/24*2*math.pi) + drift + noise
    temp = 20 + 10*math.sin((hour+6)/24*2*math.pi) + random.uniform(-1,1)
    humidity = 50 + 20*math.cos(hour/24*2*math.pi) + random.uniform(-3,3)
    # label: irrigate when moisture < 35
    label = 1 if moisture < 35 else 0
    return {
      "ts": t.isoformat()+"Z",
      "soil_moisture": round(moisture,2),
      "temp_c": round(temp,2),
      "humidity_pct": round(humidity,2),
      "label": label
    }

def generate_csv(path='models/data/sim.csv', n=2000):
    with open(path,'w',newline='') as f:
        w = csv.DictWriter(f, fieldnames=['ts','soil_moisture','temp_c','humidity_pct','label'])
        w.writeheader()
        t = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=1)
        for i in range(n):
            row = gen_row(t)
            w.writerow(row)
            t += datetime.timedelta(seconds=60)  # sample every minute

def csv_to_json(csv_path='models/data/sim.csv', json_path='models/data/sim.json'):
    data = []
    with open(csv_path, 'r', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert numeric fields from string to float/int
            row['soil_moisture'] = float(row['soil_moisture'])
            row['temp_c'] = float(row['temp_c'])
            row['humidity_pct'] = float(row['humidity_pct'])
            row['label'] = int(row['label'])
            data.append(row)
    with open(json_path, 'w') as jf:
        json.dump(data, jf, indent=2)
    print(f"JSON saved to {json_path}")

if __name__ == "__main__":
    generate_csv()
    print("synthetic csv generated")
    csv_to_json()
