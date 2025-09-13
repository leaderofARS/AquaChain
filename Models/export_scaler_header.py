# Models/export_scaler_header.py
# Export scaler mean/std to a C header for firmware use
import joblib
import numpy as np
from pathlib import Path

BASE = Path(__file__).resolve().parent
SCALER_PKL = BASE / 'scaler.pkl'
HEADER_OUT = BASE.parent / 'Embedded' / 'firmware' / 'tflm' / 'scaler_params.h'

if __name__ == '__main__':
    scaler = joblib.load(SCALER_PKL)
    mean = scaler.mean_.astype(float)
    scale = scaler.scale_.astype(float)
    HEADER_OUT.parent.mkdir(parents=True, exist_ok=True)
    with HEADER_OUT.open('w') as f:
        f.write('#pragma once\n')
        f.write('// Auto-generated from Models/scaler.pkl\n')
        f.write('#include <stdint.h>\n')
        f.write(f'#define SCALER_DIM {len(mean)}\n')
        f.write('static const float SCALER_MEAN[SCALER_DIM] = { ' + ', '.join(f'{m:.6f}' for m in mean) + ' };\n')
        f.write('static const float SCALER_STD[SCALER_DIM] = { ' + ', '.join(f'{s:.6f}' for s in scale) + ' };\n')
    print(f'Wrote scaler header to {HEADER_OUT}')
