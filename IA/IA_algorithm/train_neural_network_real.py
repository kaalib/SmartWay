import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from keras.models import Sequential # type: ignore
from keras.layers import Dense, Dropout # type: ignore
from keras.callbacks import EarlyStopping # type: ignore
from keras.optimizers import Nadam # type: ignore
import tensorflow as tf
import logging
import os
from dotenv import load_dotenv
import matplotlib.pyplot as plt
from keras.saving import register_keras_serializable  # type: ignore 


# Configuración inicial (sin cambios)
load_dotenv("APIs.env")
MYSQL_HOST = os.getenv('db_host')
MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))
MYSQL_USER = os.getenv('db_user')
MYSQL_PASSWORD = os.getenv('db_password')
MYSQL_DATABASE = os.getenv('db_name')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('training_real.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Métrica personalizada mejorada
@register_keras_serializable()  # Decora la clase
class TrafficAccuracy(tf.keras.metrics.Metric):
    def __init__(self, name='traffic_accuracy', **kwargs):
        super().__init__(name=name, **kwargs)
        self.correct = self.add_weight(name='correct', initializer='zeros')
        self.total = self.add_weight(name='total', initializer='zeros')

    def update_state(self, y_true, y_pred, sample_weight=None):
        y_true = tf.cast(y_true, tf.float32)
        y_pred = tf.cast(y_pred, tf.float32)
        time_ok = tf.abs(y_pred[:, 0] - y_true[:, 0]) <= (0.25 * y_true[:, 0])
        traffic_ok = tf.abs(y_pred[:, 1] - y_true[:, 1]) <= 0.25
        correct = tf.logical_and(time_ok, traffic_ok)
        self.correct.assign_add(tf.reduce_sum(tf.cast(correct, tf.float32)))
        self.total.assign_add(tf.cast(tf.size(correct), tf.float32))

    def result(self):
        return self.correct / self.total

    def reset_states(self):
        self.correct.assign(0.0)
        self.total.assign(0.0)

    # Añade este método para compatibilidad
    @classmethod
    def from_config(cls, config):
        return cls(**config)

# Conexión a DB - EXCLUYE current_speed
def load_real_data():
    engine = create_engine(f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}")
    query = """
        SELECT origin_lat, origin_lng, dest_lat, dest_lng, 
               travel_time, distance_meters, traffic_level,
               day_of_week, is_holiday, weather_condition,
               hour_of_day, weather_index
        FROM historical_data_real
        WHERE travel_time IS NOT NULL
    """
    df = pd.read_sql(query, engine)
    engine.dispose()
    
    # Feature engineering SIN velocidad
    df['is_peak'] = df['hour_of_day'].isin([7,8,9,17,18,19]).astype(int)
    df['is_weekend'] = df['day_of_week'].isin(['Saturday','Sunday']).astype(int)
    df['hour_sin'] = np.sin(2 * np.pi * df['hour_of_day']/24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour_of_day']/24)
    
    logger.info(f"\nDistribución de datos:\n{df[['traffic_level', 'weather_condition']].value_counts()}")
    return df

# Preprocesamiento ajustado
def preprocess_data(df):
    # Codificación categórica (igual)
    day_encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
    weather_encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
    
    # Features numéricas ACTUALIZADAS (sin speed)
    num_features = [
        'origin_lat', 'origin_lng', 'dest_lat', 'dest_lng',
        'distance_meters', 'is_peak', 'is_weekend',
        'hour_sin', 'hour_cos', 'weather_index'
    ]
    
    X_num = df[num_features]
    X_day = day_encoder.fit_transform(df[['day_of_week']])
    X_weather = weather_encoder.fit_transform(df[['weather_condition']])
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(np.hstack([X_num, X_day, X_weather]))
    
    y = df[['travel_time', 'traffic_level']].values
    
    return X_scaled, y, scaler, day_encoder, weather_encoder

# Modelo (sin cambios)
def build_model(input_dim):
    model = Sequential([
        Dense(96, activation='relu', input_dim=input_dim),
        Dropout(0.25),
        Dense(48, activation='relu'),
        Dense(2)
    ])
    model.compile(
        optimizer=Nadam(learning_rate=0.00075),
        loss='mse',
        metrics=[TrafficAccuracy(), 'mae']
    )
    return model

# Entrenamiento (igual)
def train_model():
    try:
        df = load_real_data()
        X, y, scaler, day_enc, weather_enc = preprocess_data(df)
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
        
        model = build_model(X_train.shape[1])
        
        history = model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=80,
            batch_size=64,
            callbacks=[EarlyStopping(monitor='val_traffic_accuracy', patience=15, mode='max')],
            verbose=1
        )
        
        # Guardado
        model.save('traffic_model_real.keras')
        np.save('scaler_real.npy', scaler.mean_)
        np.save('scaler_real_var.npy', scaler.var_)
        np.save('day_encoder_real.npy', day_enc.categories_, allow_pickle=True)
        np.save('weather_encoder_real.npy', weather_enc.categories_, allow_pickle=True)
        
        # Gráficos
        plt.figure(figsize=(12, 4))
        plt.subplot(1, 2, 1)
        plt.plot(history.history['traffic_accuracy'], label='Train')
        plt.plot(history.history['val_traffic_accuracy'], label='Validation')
        plt.title('Precisión')
        plt.legend()
        
        plt.subplot(1, 2, 2)
        plt.plot(history.history['loss'], label='Train')
        plt.plot(history.history['val_loss'], label='Validation')
        plt.title('Pérdida')
        plt.legend()
        plt.savefig('training_metrics.png')
        
        logger.info(f"\nMejor val_accuracy: {max(history.history['val_traffic_accuracy']):.4f}")
        
    except Exception as e:
        logger.error(f"Error: {e}")
        raise

if __name__ == "__main__":
    train_model()