# models/extract_features.py
import pandas as pd
import numpy as np

def extract_features(df, window=5):
    df['avg_moisture'] = df['soil_moisture'].rolling(window).mean()
    df['slope'] = df['soil_moisture'].diff(periods=window-1) / window
    # Fix: Remove trailing 'Z' and parse datetime
    df['ts_clean'] = df['ts'].str.rstrip('Z')
    df['hour'] = pd.to_datetime(df['ts_clean'], utc=True).dt.hour / 24.0
    df['battery_pct'] = 100  # placeholder
    df = df.dropna()
    X = df[['avg_moisture','slope','temp_c','hour','battery_pct']].values.astype(np.float32)
    y = df['label'].values.astype(np.float32)
    return X, y
if __name__ == "__main__":
    df = pd.read_csv('models/data/sim.csv')
    X, y = extract_features(df)
    print("Features shape:", X.shape)
    print("Labels shape:", y.shape)
    print("First 5 feature rows:\n", X[:5])
    print("First 5 labels:\n", y[:5])
    np.save('models/data/features.npy', X)
    np.save('models/data/labels.npy', y)
    print("Features and labels saved to models/data/")

