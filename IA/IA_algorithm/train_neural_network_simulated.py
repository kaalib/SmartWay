import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from tensorflow.keras.models import Sequential # type: ignore
from tensorflow.keras.layers import Dense # type: ignore
from tensorflow.keras.callbacks import EarlyStopping # type: ignore
from tensorflow.keras.metrics import Metric # type: ignore
import tensorflow as tf
import logging
import os
from dotenv import load_dotenv

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('training_simulated.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Cargar variables de entorno
load_dotenv("APIs.env")
MYSQL_HOST = os.getenv('db_host')
MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))
MYSQL_USER = os.getenv('db_user')
MYSQL_PASSWORD = os.getenv('db_password')
MYSQL_DATABASE = os.getenv('db_name')

# Métrica personalizada de accuracy para regresión
class CustomAccuracy(Metric):
    def __init__(self, name='custom_accuracy', **kwargs):
        super().__init__(name=name, **kwargs)
        self.correct = self.add_weight(name='correct', initializer='zeros')
        self.total = self.add_weight(name='total', initializer='zeros')

    def update_state(self, y_true, y_pred, sample_weight=None):
        y_true = tf.cast(y_true, tf.float32)
        y_pred = tf.cast(y_pred, tf.float32)
        
        # Umbrales: ±10% para travel_time, ±0.1 para traffic_level
        travel_time_threshold = 0.1 * y_true[:, 0]
        traffic_level_threshold = 0.1
        
        travel_time_correct = tf.abs(y_pred[:, 0] - y_true[:, 0]) <= travel_time_threshold
        traffic_level_correct = tf.abs(y_pred[:, 1] - y_true[:, 1]) <= traffic_level_threshold
        
        # Considerar correcto si ambas predicciones están dentro del umbral
        correct = tf.logical_and(travel_time_correct, traffic_level_correct)
        correct = tf.cast(correct, tf.float32)
        
        self.correct.assign_add(tf.reduce_sum(correct))
        self.total.assign_add(tf.cast(tf.size(correct), tf.float32))

    def result(self):
        return self.correct / self.total

    def reset_states(self):
        self.correct.assign(0.0)
        self.total.assign(0.0)

def connect_to_db():
    try:
        connection_string = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
        engine = create_engine(connection_string)
        logger.info("Conexión exitosa a MySQL con SQLAlchemy")
        return engine
    except Exception as e:
        logger.error(f"Error al conectar a MySQL: {e}")
        raise

def load_data():
    engine = connect_to_db()
    query = """
        SELECT origin_lat, origin_lng, dest_lat, dest_lng, travel_time, distance_meters,
               traffic_level, day_of_week, is_holiday, weather_condition,
               hour_of_day, weather_index
        FROM historical_data_simulated
    """
    try:
        df = pd.read_sql(query, engine)
        logger.info(f"Cargados {len(df)} registros simulados")
        return df
    except Exception as e:
        logger.error(f"Error al cargar datos: {e}")
        raise
    finally:
        engine.dispose()

def preprocess_data(df):
    # Codificar variables categóricas
    day_encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
    weather_encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
    
    day_encoded = day_encoder.fit_transform(df[['day_of_week']])
    weather_encoded = weather_encoder.fit_transform(df[['weather_condition']])
    
    day_columns = day_encoder.get_feature_names_out(['day_of_week'])
    weather_columns = weather_encoder.get_feature_names_out(['weather_condition'])
    
    # Crear DataFrame con datos codificados
    encoded_df = pd.DataFrame(day_encoded, columns=day_columns)
    encoded_df = pd.concat([encoded_df, pd.DataFrame(weather_encoded, columns=weather_columns)], axis=1)
    
    # Columnas numéricas
    numeric_cols = ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'distance_meters',
                    'hour_of_day', 'is_holiday', 'weather_index']
    numeric_df = df[numeric_cols]
    
    # Combinar
    X = pd.concat([numeric_df.reset_index(drop=True), encoded_df.reset_index(drop=True)], axis=1)
    
    # Manejar valores nulos
    X.fillna(X.mean(), inplace=True)
    
    # Salidas
    y = df[['travel_time', 'traffic_level']].copy()
    y.fillna({'travel_time': y['travel_time'].mean(), 'traffic_level': y['traffic_level'].mean()}, inplace=True)
    
    # Normalizar características
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    logger.info(f"Preprocesamiento completado: {X_scaled.shape[1]} características")
    return X_scaled, y, scaler, day_encoder, weather_encoder

def build_model(input_dim):
    model = Sequential([
        Dense(128, activation='relu', input_dim=input_dim),
        Dense(64, activation='relu'),
        Dense(32, activation='relu'),
        Dense(2, activation='linear')  # travel_time (lineal), traffic_level (0-1)
    ])
    model.compile(optimizer='adam', loss='mse', metrics=['mae', CustomAccuracy()])
    logger.info("Modelo compilado con métrica de accuracy personalizada")
    return model

def train_model():
    # Cargar y preprocesar datos
    df = load_data()
    X, y, scaler, day_encoder, weather_encoder = preprocess_data(df)
    
    # Dividir datos
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
    logger.info(f"Entrenamiento: {X_train.shape[0]} registros, Validación: {X_val.shape[0]} registros")
    
    # Construir modelo
    model = build_model(X_train.shape[1])
    
    # Callbacks
    early_stopping = EarlyStopping(monitor='val_loss', patience=10, restore_best_weights=True)
    
    # Entrenar
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=50,
        batch_size=32,
        callbacks=[early_stopping],
        verbose=1
    )
    
    # Guardar modelo y preprocesadores
    model.save('traffic_model_simulated.h5')
    np.save('scaler_simulated.npy', scaler.mean_)
    np.save('scaler_simulated_var.npy', scaler.var_)
    with open('day_encoder_simulated.npy', 'wb') as f:
        np.save(f, day_encoder.categories_)
    with open('weather_encoder_simulated.npy', 'wb') as f:
        np.save(f, weather_encoder.categories_)
    
    logger.info("Modelo y preprocesadores guardados")
    return model, history

if __name__ == "__main__":
    try:
        model, history = train_model()
        logger.info("Entrenamiento completado")
        # Evaluación final
        val_accuracy = history.history['val_custom_accuracy'][-1]  # Última época
        print(f"\nVal Custom Accuracy: {val_accuracy:.4f}")

        if val_accuracy >= 0.8:
            print("✅ Modelo listo para producción (no es necesario reentrenar).")
        else:
            print("⚠️ Modelo con baja precisión. Reentrena con ajustes.")
    except Exception as e:
        logger.error(f"Error en el entrenamiento: {e}")