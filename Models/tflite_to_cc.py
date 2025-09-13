# Models/tflite_to_cc.py
# Convert model_quant.tflite to an Arduino-friendly C array
from pathlib import Path

TFLITE = Path(__file__).resolve().parent / 'model_quant.tflite'
OUT = Path(__file__).resolve().parents[1] / 'Embedded' / 'firmware' / 'tflm' / 'model_data.cc'

if __name__ == '__main__':
    data = TFLITE.read_bytes()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w') as f:
        f.write('#include <stdint.h>\n')
        f.write('extern const unsigned char g_model[];\n')
        f.write('extern const int g_model_len;\n')
        f.write('const unsigned char g_model[] = {\n')
        for i, b in enumerate(data):
            if i % 12 == 0:
                f.write('  ')
            f.write(f'0x{b:02x}')
            if i != len(data)-1:
                f.write(', ')
            if i % 12 == 11:
                f.write('\n')
        f.write('\n};\n')
        f.write(f'const int g_model_len = {len(data)};\n')
    print(f'Wrote model to {OUT} ({len(data)} bytes)')
