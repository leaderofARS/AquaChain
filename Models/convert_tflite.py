# Convert to TFLite script

import tensorflow as tf
from tensorflow import keras
from keras import layers
import numpy as np
import os
# --- IGNORE ---

# Training script

def create_model(vocab_size, embedding_dim, rnn_units, batch_size):
    model = keras.Sequential([
        layers.Embedding(vocab_size, embedding_dim, batch_input_shape=[batch_size, None]),
        layers.LSTM(rnn_units, return_sequences=True, stateful=True, recurrent_initializer='glorot_uniform'),
        layers.Dense(vocab_size)
    ])
    return model

# --- IGNORE ---
def load_weights(model, checkpoint_path):
    model.load_weights(checkpoint_path)
    model.build(tf.TensorShape([1, None]))


def convert_to_tflite(model, tflite_model_path):
    # Convert the model to TFLite format
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()
    
    # Save the TFLite model
    with open(tflite_model_path, 'wb') as f:
        f.write(tflite_model)
    print(f"TFLite model saved to {tflite_model_path}")

if __name__ == "__main__":
    # Parameters
    vocab_size = 65  # Example vocab size
    embedding_dim = 256
    rnn_units = 1024
    checkpoint_path = "checkpoints/my_checkpoint"  # Path to the trained weights
    tflite_model_path = "model.tflite"

    # Create the model with batch_size=1 for inference
    model = create_model(vocab_size, embedding_dim, rnn_units, batch_size=1)
    
    # Load the trained weights
    load_weights(model, checkpoint_path)
    
    # Convert and save the model to TFLite format
    convert_to_tflite(model, tflite_model_path)

