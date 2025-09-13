# Models/train_model.py
import os
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import joblib
import tensorflow as tf
from tensorflow import keras

BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / 'data'
TRAIN_CSV = DATA_DIR / 'train.csv'
MODEL_H5 = BASE / 'model.h5'
SCALER_PKL = BASE / 'scaler.pkl'
REPORT_JSON = BASE / 'train_report.json'


def ensure_data():
    # If train.csv is missing, generate synthetic and extract
    if TRAIN_CSV.exists():
        return
    # try to build from synthetic
    from generate_synthetic import generate_csv, csv_to_json
    from feature_extract import extract_features
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    sim_csv = DATA_DIR / 'sim.csv'
    generate_csv(sim_csv)
    csv_to_json(sim_csv, DATA_DIR / 'sim.json')
    df = pd.read_csv(sim_csv)
    res = extract_features(df)
    if isinstance(res, tuple) and len(res) == 3:
        df_feat, X, y = res
    elif isinstance(res, tuple) and len(res) == 2:
        X, y = res
        df_feat = df.copy()
    else:
        raise RuntimeError('Unexpected return from extract_features')
    feature_cols = ['avg_moisture','slope','temp_c','hour','battery_pct']
    # Build from X to ensure alignment length == y
    out_df = pd.DataFrame(X, columns=feature_cols)
    out_df['label'] = y
    out_df.to_csv(TRAIN_CSV, index=False)


def build_model(input_dim: int):
    model = keras.Sequential([
        keras.layers.Input(shape=(input_dim,)),
        keras.layers.Dense(16, activation='relu'),
        keras.layers.Dense(8, activation='relu'),
        keras.layers.Dense(1, activation='sigmoid'),
    ])
    model.compile(optimizer=keras.optimizers.Adam(1e-3),
                  loss='binary_crossentropy',
                  metrics=['accuracy'])
    return model


def main():
    ensure_data()
    df = pd.read_csv(TRAIN_CSV)
    if 'label' not in df.columns:
        raise RuntimeError('train.csv has no label column; generate synthetic or label your data')
    # Ensure no NaNs
    df = df.dropna()
    X = df[['avg_moisture','slope','temp_c','hour','battery_pct']].to_numpy(dtype=np.float32)
    y = df['label'].to_numpy(dtype=np.float32)

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42, stratify=(y>0.5))

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_val_s = scaler.transform(X_val)

    model = build_model(X.shape[1])
    es = keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True, monitor='val_accuracy')

    hist = model.fit(
        X_train_s, y_train,
        validation_data=(X_val_s, y_val),
        epochs=50,
        batch_size=32,
        callbacks=[es],
        verbose=0
    )

    # Evaluate
    val_pred = (model.predict(X_val_s, verbose=0).ravel() >= 0.5).astype(np.int32)
    y_val_bin = (y_val >= 0.5).astype(np.int32)
    acc = accuracy_score(y_val_bin, val_pred)

    # Save artifacts
    MODEL_H5.parent.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_H5)
    joblib.dump(scaler, SCALER_PKL)

    REPORT_JSON.write_text(json.dumps({
        'val_accuracy': float(acc),
        'epochs': len(hist.history.get('loss', [])),
        'train_samples': int(X_train.shape[0]),
        'val_samples': int(X_val.shape[0])
    }, indent=2))

    print(f"Model saved to {MODEL_H5}")
    print(f"Scaler saved to {SCALER_PKL}")
    print(f"Validation accuracy: {acc:.4f}")


if __name__ == '__main__':
    main()

