# TFLM Firmware (ESP32)

This folder contains the TensorFlow Lite Micro (TFLM) firmware using EloquentTinyML wrapper.

Setup (local vendor library)
- Place EloquentTinyML in Embedded/lib/EloquentTinyML with a src/ folder containing:
  - eloquent_tinyml.h and/or EloquentTinyML.h
  - tflm_esp32.h
- platformio.ini uses lib_extra_dirs = Embedded/lib

Build/Flash
- Export scaler and model to headers before building:
  - python Models/export_scaler_header.py
  - python Models/tflite_to_cc.py
- Upload:
  - py -m platformio run -d Embedded -e esp32dev_tflm --target upload

Serial output shows TFLM ready, inference time, probability, and relay state.
