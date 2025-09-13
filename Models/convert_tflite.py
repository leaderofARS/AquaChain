# Models/convert_tflite.py
from pathlib import Path
import argparse
import numpy as np
import joblib
import tensorflow as tf
import pandas as pd

BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / 'data'
TRAIN_CSV = DATA_DIR / 'train.csv'
MODEL_H5 = BASE / 'model.h5'
SCALER_PKL = BASE / 'scaler.pkl'
TFLITE_OUT = BASE / 'model_quant.tflite'


def representative_dataset_gen(X_s, num=100):
    for i in range(min(num, X_s.shape[0])):
        x = X_s[i:i+1].astype(np.float32)
        yield [x]


def run(mode: str = 'float'):
    if not MODEL_H5.exists():
        raise FileNotFoundError(f"Missing model file: {MODEL_H5}")
    if not SCALER_PKL.exists():
        raise FileNotFoundError(f"Missing scaler file: {SCALER_PKL}")
    if not TRAIN_CSV.exists():
        raise FileNotFoundError(f"Missing train csv: {TRAIN_CSV}")

    df = pd.read_csv(TRAIN_CSV)
    X = df[['avg_moisture','slope','temp_c','hour','battery_pct']].to_numpy(dtype=np.float32)

    scaler = joblib.load(SCALER_PKL)
    X_s = scaler.transform(X).astype(np.float32)

    model = tf.keras.models.load_model(MODEL_H5)

    if mode.lower() in ('int8', 'quant', 'quantized'):
        # INT8 per-tensor quantization (disable per-channel for Dense)
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.representative_dataset = lambda: representative_dataset_gen(X_s, num=200)
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type = tf.int8
        converter.inference_output_type = tf.int8
        # Critical: disable per-channel for Dense to support TFLM on ESP32
        converter._experimental_disable_per_channel_quantization_for_dense_layers = True
        tflite_model = converter.convert()
        with open(TFLITE_OUT, 'wb') as f:
            f.write(tflite_model)

        # Float predictions on a sample (for comparison only)
        float_pred = (model.predict(X_s[:200], verbose=0).ravel() >= 0.5).astype(np.int32)

        # Verify quantized vs float agreement
        interpreter = tf.lite.Interpreter(model_path=str(TFLITE_OUT))
        interpreter.allocate_tensors()
        input_details = interpreter.get_input_details()[0]
        output_details = interpreter.get_output_details()[0]

        scale_in, zp_in = input_details['quantization']
        scale_out, zp_out = output_details['quantization']

        def quantize(x):
            return (x / scale_in + zp_in).astype(np.int8)

        def dequant(yq):
            return (yq.astype(np.float32) - zp_out) * scale_out

        q_match = 0
        N = min(200, X_s.shape[0])
        for i in range(N):
            xi_q = quantize(X_s[i:i+1])
            interpreter.set_tensor(input_details['index'], xi_q)
            interpreter.invoke()
            yq = interpreter.get_tensor(output_details['index']).ravel()
            y_prob = dequant(yq)[0]
            pred = 1 if y_prob >= 0.5 else 0
            if pred == int(float_pred[i]):
                q_match += 1
        agree = q_match / float(N) if N else 0.0
        print(f"Saved INT8 model to {TFLITE_OUT}")
        print(f"Float vs INT8 agreement on {N} samples: {agree*100:.2f}%")
    else:
        # Float32 model (simple, broadly compatible)
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        tflite_model = converter.convert()
        with open(TFLITE_OUT, 'wb') as f:
            f.write(tflite_model)
        print(f"Saved FLOAT32 model to {TFLITE_OUT}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', default='float', choices=['float', 'int8', 'quant', 'quantized'], help='TFLite conversion mode')
    args = parser.parse_args()
    run(mode=args.mode)

