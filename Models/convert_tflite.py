# Convert to TFLite script

import os
import sys
import numpy as np

# Import TensorFlow with error handling
try:
    import tensorflow as tf
    print(f"TensorFlow version: {tf.__version__}")
except Exception as e:
    print(f"Error importing TensorFlow: {e}")
    sys.exit(1)

try:
    from tensorflow import keras
    from tensorflow.keras import layers
except Exception as e:
    print(f"Error importing Keras: {e}")
    sys.exit(1)

# --- IGNORE ---

# Training script

def create_model(vocab_size, embedding_dim, rnn_units, batch_size):
    """Create a text generation model"""
    model = keras.Sequential([
        layers.Embedding(vocab_size, embedding_dim, input_length=None),
        layers.LSTM(rnn_units, return_sequences=True, stateful=False, recurrent_initializer='glorot_uniform'),
        layers.Dense(vocab_size)
    ])
    return model

# --- IGNORE ---
def load_weights(model, checkpoint_path):
    """Load weights with error handling"""
    if not os.path.exists(checkpoint_path + '.index'):
        print(f"Warning: Checkpoint not found at {checkpoint_path}")
        print("Creating model with random weights for demonstration...")
        # Just build the model without loading weights
        model.build(tf.TensorShape([1, None]))
        return False
    
    try:
        model.load_weights(checkpoint_path)
        model.build(tf.TensorShape([1, None]))
        print(f"Successfully loaded weights from {checkpoint_path}")
        return True
    except Exception as e:
        print(f"Error loading weights: {e}")
        model.build(tf.TensorShape([1, None]))
        return False


def convert_to_tflite(model, tflite_model_path):
    # Convert the model to TFLite format
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()
    
    # Save the TFLite model
    with open(tflite_model_path, 'wb') as f:
        f.write(tflite_model)
    print(f"TFLite model saved to {tflite_model_path}")

if __name__ == "__main__":
    print("Starting TFLite conversion script...")
    
    # Parameters
    vocab_size = 65  # Example vocab size
    embedding_dim = 256
    rnn_units = 1024
    checkpoint_path = "checkpoints/my_checkpoint"  # Path to the trained weights
    tflite_model_path = "model.tflite"
    
    # Create checkpoints directory if it doesn't exist
    os.makedirs("checkpoints", exist_ok=True)

    try:
        # Create the model with batch_size=1 for inference
        print("Creating model...")
        model = create_model(vocab_size, embedding_dim, rnn_units, batch_size=1)
        print(f"Model created successfully with vocab_size={vocab_size}, embedding_dim={embedding_dim}, rnn_units={rnn_units}")
        
        # Load the trained weights
        print("Loading weights...")
        weights_loaded = load_weights(model, checkpoint_path)
        
        # Convert and save the model to TFLite format
        print("Converting to TFLite...")
        convert_to_tflite(model, tflite_model_path)
        
        if weights_loaded:
            print("✅ Conversion completed successfully with trained weights!")
        else:
            print("✅ Conversion completed successfully with random weights (no checkpoint found)!")
            
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        import traceback
        traceback.print_exc()

