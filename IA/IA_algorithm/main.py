import itertools
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import pandas as pd
import numpy as np
from sqlalchemy import create_engine
import pymysql
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from tensorflow.keras.models import load_model # type: ignore
import requests
import logging
import json
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
import tensorflow as tf
from tensorflow.keras.metrics import Metric # type: ignore

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('route_optimization.log'),
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
OPENWEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')

# Puntos de inicio y fin
ORIGIN = "Universidad del Norte, Barranquilla, Atlántico"
DESTINATION = "Colegio Karl C. Parrish, Barranquilla, Atlántico"

# Direcciones intermedias
ADDRESSES = [
   "Carrera 29 #35-50, Soledad, Atlántico",
    "Cra. 46 #82-106, Barranquilla, Atlántico"
]

# Direcciones de arroyos
ARROYO_ADDRESSES = [
    "Cl. 85 #47-10, Barranquilla, Atlántico",
    "Cl. 82 #55-20, Barranquilla, Atlántico",
    "Cl. 84 #50-15, Barranquilla, Atlántico",
    "Cl. 85 #51B-30, Barranquilla, Atlántico",
    "Cl. 17 #38-25, Barranquilla, Atlántico",
    "Cl. 19 #35-40, Barranquilla, Atlántico",
    "Cl. 92 #51B-12, Barranquilla, Atlántico",
    "Cl. 92 #65-18, Barranquilla, Atlántico",
    "Cl. 79 #42F-22, Barranquilla, Atlántico",
    "Cl. 84 #43-35, Barranquilla, Atlántico",
    "Cl. 91 #50-28, Barranquilla, Atlántico",
    "Cl. 92 #52-16, Barranquilla, Atlántico"
]

# Métrica personalizada
@tf.keras.utils.register_keras_serializable()
class TrafficAccuracy(Metric):
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

    @classmethod
    def from_config(cls, config):
        return cls(**config)

def connect_to_db():
    try:
        connection_string = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
        engine = create_engine(connection_string)
        logger.info("Conexión exitosa a MySQL con SQLAlchemy")
        return engine
    except Exception as e:
        logger.error(f"Error al conectar a MySQL: {e}")
        raise

def get_db_connection():
    try:
        connection = pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DATABASE,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )
        logger.info("Conexión directa a MySQL exitosa")
        return connection
    except Exception as e:
        logger.error(f"Error al conectar a MySQL con pymysql: {e}")
        raise

def geocode_address(address, connection, is_critical=False):
    cursor = connection.cursor()
    query = """
        SELECT response_json
        FROM api_cache
        WHERE origin = %s AND api_type = 'google_geocoding' AND timestamp > NOW() - INTERVAL 30 DAY
    """
    try:
        cursor.execute(query, (address,))
        result = cursor.fetchone()
        
        if result:
            #logger.info(f"Usando caché para geocodificación: {address}")
            data = json.loads(result['response_json'])
            cursor.close()
            return data['results'][0]['geometry']['location']['lat'], data['results'][0]['geometry']['location']['lng']
        
        logger.info(f"Consultando Geocoding API para: {address}")
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {'address': address, 'key': GOOGLE_API_KEY}
        
        for attempt in range(3):
            try:
                response = requests.get(url, params=params, timeout=5)
                data = response.json()
                if response.status_code == 200 and data['status'] == 'OK':
                    lat = data['results'][0]['geometry']['location']['lat']
                    lng = data['results'][0]['geometry']['location']['lng']
                    cursor.execute("""
                        INSERT INTO api_cache (origin, api_type, timestamp, response_json)
                        VALUES (%s, %s, NOW(), %s)
                    """, (address, 'google_geocoding', json.dumps(data)))
                    connection.commit()
                    logger.info(f"Guardado en api_cache para: {address}")
                    cursor.close()
                    return lat, lng
                else:
                    error_msg = f"Error en Geocoding API para {address}: {data.get('status', 'Desconocido')}"
                    logger.error(error_msg)
                    if is_critical:
                        raise ValueError(error_msg)
                    cursor.close()
                    return None, None
            except Exception as e:
                logger.error(f"Intento {attempt + 1} fallido para geocodificar {address}: {e}")
                time.sleep(2 ** attempt)
        logger.error(f"No se pudo geocodificar {address} tras 3 intentos")
        cursor.close()
        if is_critical:
            raise ValueError(f"No se pudo geocodificar la dirección crítica: {address}")
        return None, None
    except Exception as e:
        logger.error(f"Error en geocode_address para {address}: {e}")
        cursor.close()
        if is_critical:
            raise
        return None, None

def get_google_directions_route(origin_addr, dest_addr, connection):
    cache_key = f"{origin_addr}|{dest_addr}|google_directions"
    cursor = connection.cursor()
    query = """
        SELECT response_json, distance_meters
        FROM api_cache
        WHERE origin = %s AND api_type = 'google_directions' AND timestamp > NOW() - INTERVAL 7 DAY
    """
    try:
        cursor.execute(query, (cache_key,))
        result = cursor.fetchone()
        
        if result:
            data = json.loads(result['response_json'])
            distance_meters = result['distance_meters'] or sum(leg['distance']['value'] for leg in data['routes'][0]['legs'])
            points = [(step['start_location']['lat'], step['start_location']['lng']) for leg in data['routes'][0]['legs'] for step in leg['steps']] + \
                     [(data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lat'], data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lng'])]
            cursor.close()
            return {'distance_meters': distance_meters, 'points': points}
        
        logger.info(f"Consultando Google Directions API para: {cache_key}")
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            'origin': origin_addr,
            'destination': dest_addr,
            'key': GOOGLE_API_KEY,
            'mode': 'driving'
        }
        
        for attempt in range(2):
            try:
                response = requests.get(url, params=params, timeout=5)
                data = response.json()
                if response.status_code == 200 and data['status'] == 'OK':
                    distance_meters = sum(leg['distance']['value'] for leg in data['routes'][0]['legs'])
                    points = [(step['start_location']['lat'], step['start_location']['lng']) for leg in data['routes'][0]['legs'] for step in leg['steps']] + \
                             [(data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lat'], data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lng'])]
                    cursor.execute("""
                        INSERT INTO api_cache (origin, destination, api_type, distance_meters, timestamp, response_json)
                        VALUES (%s, %s, %s, %s, NOW(), %s)
                    """, (cache_key, dest_addr, 'google_directions', distance_meters, json.dumps(data)))
                    connection.commit()
                    logger.info(f"Guardado en api_cache para: {cache_key}")
                    cursor.close()
                    return {'distance_meters': distance_meters, 'points': points}
                else:
                    time.sleep(2 ** attempt)
            except Exception as e:
                time.sleep(2 ** attempt)
        cursor.close()
        return None
    except Exception as e:
        cursor.close()
        return None

def get_openweather_condition(lat, lng):
    cache_key = f"{lat}|{lng}|openweather"
    cursor = get_db_connection().cursor()
    query = """
        SELECT response_json
        FROM api_cache
        WHERE origin = %s AND api_type = 'openweather' AND timestamp > NOW() - INTERVAL 1 HOUR
    """
    try:
        cursor.execute(query, (cache_key,))
        result = cursor.fetchone()
        
        if result:
            data = json.loads(result['response_json'])
            cursor.close()
            return 'Lluvia' if data['weather'][0]['main'] in ['Rain', 'Drizzle', 'Thunderstorm'] else 'Despejado'
        
        logger.info(f"Consultando OpenWeather API para: {cache_key}")
        url = "https://api.openweathermap.org/data/2.5/weather"
        params = {
            'lat': lat,
            'lon': lng,
            'appid': OPENWEATHER_API_KEY,
            'units': 'metric'
        }
        
        for attempt in range(2):
            try:
                response = requests.get(url, params=params, timeout=5)
                data = response.json()
                if response.status_code == 200:
                    cursor.execute("""
                        INSERT INTO api_cache (origin, api_type, timestamp, response_json)
                        VALUES (%s, %s, NOW(), %s)
                    """, (cache_key, 'openweather', json.dumps(data)))
                    get_db_connection().commit()
                    logger.info(f"Guardado en api_cache para: {cache_key}")
                    cursor.close()
                    return 'Lluvia' if data['weather'][0]['main'] in ['Rain', 'Drizzle', 'Thunderstorm'] else 'Despejado'
                else:
                    time.sleep(2 ** attempt)
            except Exception as e:
                time.sleep(2 ** attempt)
        cursor.close()
        return 'Despejado'
    except Exception as e:
        cursor.close()
        return 'Despejado'

def check_arroyo_in_route(route_points, arroyo_coords, weather_condition):
    if weather_condition != "Lluvia":
        return False
    
    arroyo_lat, arroyo_lng = arroyo_coords
    if arroyo_lat is None or arroyo_lng is None:
        return False
    
    for i in range(len(route_points) - 1):
        ox, oy = route_points[i]
        dx, dy = route_points[i + 1]
        ax, ay = arroyo_lat, arroyo_lng
        
        len_sq = (dx - ox) ** 2 + (dy - oy) ** 2
        if len_sq == 0:
            continue
        
        t = max(0, min(1, ((ax - ox) * (dx - ox) + (ay - oy) * (dy - oy)) / len_sq))
        proj_x = ox + t * (dx - ox)
        proj_y = oy + t * (dy - oy)
        
        distance = ((ax - proj_x) ** 2 + (ay - proj_y) ** 2) ** 0.5
        if distance < 0.005:
            return True
    return False

def load_traffic_model():
    try:
        model = load_model('traffic_model_real.keras', custom_objects={'TrafficAccuracy': TrafficAccuracy})
        scaler_mean = np.load('scaler_real.npy', allow_pickle=True)
        scaler_var = np.load('scaler_real_var.npy', allow_pickle=True)
        day_categories = np.load('day_encoder_real.npy', allow_pickle=True)[0].tolist()
        weather_categories = np.load('weather_encoder_real.npy', allow_pickle=True)[0].tolist()
        logger.info("Modelo y preprocesadores cargados correctamente")
        return model, scaler_mean, scaler_var, day_categories, weather_categories
    except Exception as e:
        logger.error(f"Error al cargar el modelo de tráfico: {e}")
        return None, None, None, [], []

def preprocess_input(data, scaler_mean, scaler_var, day_categories, weather_categories):
    try:
        # Validar columnas requeridas
        required_cols = ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'distance_meters',
                        'hour_of_day', 'is_holiday', 'weather_index', 'day_of_week', 'weather_condition',
                        'is_peak', 'is_weekend', 'hour_sin', 'hour_cos']
        missing_cols = [col for col in required_cols if col not in data.columns]
        if missing_cols:
            logger.error(f"Faltan columnas en los datos: {missing_cols}")
            raise ValueError(f"Faltan columnas: {missing_cols}")

        # Codificar variables categóricas
        day_encoder = OneHotEncoder(sparse_output=False, categories=[day_categories], handle_unknown='ignore')
        weather_encoder = OneHotEncoder(sparse_output=False, categories=[weather_categories], handle_unknown='ignore')

        day_encoded = day_encoder.fit_transform(data[['day_of_week']])
        weather_encoded = weather_encoder.fit_transform(data[['weather_condition']])

        day_columns = [f"day_of_week_{cat}" for cat in day_categories]
        weather_columns = [f"weather_condition_{cat}" for cat in weather_categories]

        encoded_df = pd.DataFrame(day_encoded, columns=day_columns)
        encoded_df = pd.concat([encoded_df, pd.DataFrame(weather_encoded, columns=weather_columns)], axis=1)

        # Seleccionar características numéricas
        numeric_cols = [
            'origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'distance_meters',
            'is_peak', 'is_weekend', 'hour_sin', 'hour_cos', 'weather_index'
        ]
        numeric_df = data[numeric_cols]

        # Combinar características
        X = pd.concat([numeric_df.reset_index(drop=True), encoded_df.reset_index(drop=True)], axis=1)
        X.fillna(X.mean(), inplace=True)

        # Escalar datos
        scaler = StandardScaler()
        scaler.mean_ = scaler_mean
        scaler.var_ = scaler_var
        scaler.scale_ = np.sqrt(scaler_var)
        X_scaled = scaler.transform(X.values)

        return X_scaled
    except Exception as e:
        logger.error(f"Error en preprocess_input: {e}")
        raise

def predict_traffic(model, data, scaler_mean, scaler_var, day_categories, weather_categories):
    try:
        X_scaled = preprocess_input(data, scaler_mean, scaler_var, day_categories, weather_categories)
        predictions = model.predict(X_scaled, verbose=0)
        travel_times = predictions[:, 0]  # En minutos
        traffic_levels = np.clip(predictions[:, 1], 0.0, 1.0)  # Normalizar entre 0 y 1
        return travel_times, traffic_levels
    except Exception as e:
        logger.error(f"Error en predict_traffic: {e}")
        return None, None

def get_route_points(origin_coords, dest_coords):
    """Genera puntos aproximados para una ruta (línea recta simulada)."""
    num_points = 10
    lat1, lng1 = origin_coords
    lat2, lng2 = dest_coords
    points = []
    for i in range(num_points + 1):
        t = i / num_points
        lat = lat1 + t * (lat2 - lat1)
        lng = lng1 + t * (lng2 - lng1)
        points.append((lat, lng))
    return points

def get_distance_from_db(origin_addr, dest_addr, connection):
    cursor = connection.cursor()
    current_day = datetime.now().strftime('%A')
    current_hour = datetime.now().hour
    if current_day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
        days = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
    else:
        days = ('Saturday', 'Sunday')
    in_placeholders = ','.join(['%s'] * len(days))
    query = f"""
        SELECT AVG(distance_meters) as distance_meters
        FROM historical_data_real
        WHERE origin = %s AND destination = %s 
        AND distance_meters IS NOT NULL
        AND day_of_week IN ({in_placeholders})
        AND hour_of_day = %s
    """
    try:
        params = (origin_addr, dest_addr) + days + (int(current_hour),)
        cursor.execute(query, params)
        result = cursor.fetchone()
        if result and result['distance_meters']:
            cursor.close()
            return result['distance_meters']
        query = f"""
            SELECT AVG(distance_meters) as distance_meters
            FROM historical_data_real
            WHERE origin = %s AND destination = %s 
            AND distance_meters IS NOT NULL
            AND day_of_week IN ({in_placeholders})
            AND hour_of_day BETWEEN %s AND %s
        """
        params = (origin_addr, dest_addr) + days + (int(current_hour - 2), int(current_hour + 2))
        cursor.execute(query, params)
        result = cursor.fetchone()
        cursor.close()
        if result and result['distance_meters']:
            return result['distance_meters']
        return None
    except Exception as e:
        cursor.close()
        return None

def cluster_addresses(addresses, engine):
    n_addresses = len(addresses)
    if n_addresses <= 10:
        n_clusters = 1
    elif n_addresses <= 20:
        n_clusters = 2
    elif n_addresses <= 30:
        n_clusters = 3
    else:
        n_clusters = 4
    
    current_day = datetime.now().strftime('%A')
    current_hour = datetime.now().hour
    if current_day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
        days = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
    else:
        days = ('Saturday', 'Sunday')
    in_placeholders_addr = ','.join(['%s'] * len(addresses))
    in_placeholders_days = ','.join(['%s'] * len(days))
    query = f"""
        SELECT origin, AVG(traffic_level) as avg_traffic_level, AVG(origin_lat) as origin_lat, AVG(origin_lng) as origin_lng
        FROM historical_data_real
        WHERE origin IN ({in_placeholders_addr}) 
        AND origin_lat IS NOT NULL 
        AND origin_lng IS NOT NULL
        AND day_of_week IN ({in_placeholders_days})
        AND hour_of_day = %s
        GROUP BY origin
    """
    try:
        check_query = f"""
            SELECT DISTINCT origin 
            FROM historical_data_real 
            WHERE origin IN ({in_placeholders_addr})
        """
        check_df = pd.read_sql(check_query, engine, params=tuple(addresses))
        found_addresses = set(check_df['origin'])
        missing_addresses = set(addresses) - found_addresses
        if missing_addresses:
            return {0: addresses}
        
        params = tuple(addresses) + days + (int(current_hour),)
        df = pd.read_sql(query, engine, params=params)
        
        if df.empty or len(df) < len(addresses):
            query = f"""
                SELECT origin, AVG(traffic_level) as avg_traffic_level, AVG(origin_lat) as origin_lat, AVG(origin_lng) as origin_lng
                FROM historical_data_real
                WHERE origin IN ({in_placeholders_addr}) 
                AND origin_lat IS NOT NULL 
                AND origin_lng IS NOT NULL
                AND day_of_week IN ({in_placeholders_days})
                AND hour_of_day BETWEEN %s AND %s
                GROUP BY origin
            """
            params = tuple(addresses) + days + (int(current_hour - 2), int(current_hour + 2))
            df = pd.read_sql(query, engine, params=params)
        
        features = df[df['origin'].isin(addresses)][['origin_lat', 'origin_lng', 'avg_traffic_level']]
        
        if features.empty or len(features) < n_clusters:
            return {0: addresses}
        
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features[['origin_lat', 'origin_lng', 'avg_traffic_level']])
        
        gmm = GaussianMixture(n_components=min(n_clusters, len(features)), random_state=42)
        clusters = gmm.fit_predict(features_scaled)
        
        address_clusters = {addr: cluster for addr, cluster in zip(df['origin'], clusters)}
        clusters_dict = {i: [] for i in range(min(n_clusters, len(features)))}
        for addr in addresses:
            cluster = address_clusters.get(addr, 0)
            clusters_dict[cluster].append(addr)
        
        clusters_dict = {k: v for k, v in clusters_dict.items() if v}
        if not clusters_dict:
            return {0: addresses}
        
        return clusters_dict
    except Exception as e:
        return {0: addresses}

def optimize_routes(addresses, objective, weather_condition, arroyo_coords, connection, model, scaler_mean, scaler_var, day_categories, weather_categories):
    if len(addresses) < 1:
        return [], 0.0, [], 0.0
    
    all_addresses = [ORIGIN] + addresses + [DESTINATION]
    coords = {}
    for addr in all_addresses:
        lat, lng = geocode_address(addr, connection, is_critical=True)
        if lat is None or lng is None:
            return [], 0.0, [], 0.0
        coords[addr] = (lat, lng)
    
    tsp_addresses = addresses
    n = len(tsp_addresses)
    time_matrix = np.zeros((n, n))
    traffic_matrix = np.zeros((n, n))
    climate_matrix = np.zeros((n, n))
    
    # Calcular factor de corrección dinámico para travel_time
    correction_factor = 0.93 - 0.02 * ((n - 1) // 3)
    
    input_data = []
    route_points_dict = {}
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            origin = tsp_addresses[i]
            destination = tsp_addresses[j]
            
            distance_meters = get_distance_from_db(origin, destination, connection)
            if distance_meters is None:
                route_data = get_google_directions_route(origin, destination, connection)
                if route_data:
                    distance_meters = route_data['distance_meters']
                    route_points = route_data['points']
                else:
                    return [], 0.0, [], 0.0
            else:
                route_points = get_route_points(coords[origin], coords[destination])
            
            route_points_dict[(i, j)] = route_points
            input_data.append({
                'origin_lat': coords[origin][0],
                'origin_lng': coords[origin][1],
                'dest_lat': coords[destination][0],
                'dest_lng': coords[destination][1],
                'distance_meters': distance_meters,
                'hour_of_day': datetime.now().hour,
                'is_holiday': 0,
                'weather_index': 1 if weather_condition == 'Lluvia' else 0,
                'day_of_week': datetime.now().strftime('%A'),
                'weather_condition': weather_condition,
                'is_peak': 1 if datetime.now().hour in [7, 8, 9, 17, 18, 19] else 0,
                'is_weekend': 1 if datetime.now().strftime('%A') in ['Saturday', 'Sunday'] else 0,
                'hour_sin': np.sin(2 * np.pi * datetime.now().hour / 24),
                'hour_cos': np.cos(2 * np.pi * datetime.now().hour / 24)
            })
    
    input_df = pd.DataFrame(input_data)
    travel_times, traffic_levels_pred = predict_traffic(model, input_df, scaler_mean, scaler_var, day_categories, weather_categories)
    
    if travel_times is None or traffic_levels_pred is None:
        return [], 0.0, [], 0.0
    
    idx = 0
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            time_matrix[i][j] = travel_times[idx] * correction_factor
            traffic_matrix[i][j] = traffic_levels_pred[idx] * 1.43
            route_points = route_points_dict[(i, j)]
            weather_index = 0
            if weather_condition == 'Lluvia':
                for arroyo_addr, arroyo_coord in arroyo_coords.items():
                    if check_arroyo_in_route(route_points, arroyo_coord, weather_condition):
                        weather_index += 1
            climate_matrix[i][j] = time_matrix[i][j] * (1.0 + weather_index * 0.5)
            idx += 1
    
    cost_matrix = time_matrix if objective == 'time' else traffic_matrix if objective == 'traffic' else climate_matrix
    
    route_indices = solve_tsp(tsp_addresses, cost_matrix, objective)
    
    ordered_intermediate = [tsp_addresses[i] for i in route_indices]
    ordered_addresses = [ORIGIN] + ordered_intermediate + [DESTINATION]
    addr_to_index = {addr: i for i, addr in enumerate(all_addresses)}
    route_indices = [addr_to_index[addr] for addr in ordered_addresses]
    
    total_time = 0.0
    total_traffic_level = 0.0
    segment_count = 0
    for i in range(len(ordered_addresses) - 1):
        origin_addr = ordered_addresses[i]
        dest_addr = ordered_addresses[i + 1]
        distance_meters = get_distance_from_db(origin_addr, dest_addr, connection)
        if distance_meters is None:
            route_data = get_google_directions_route(origin_addr, dest_addr, connection)
            if route_data:
                distance_meters = route_data['distance_meters']
            else:
                return [], 0.0, [], 0.0
        
        input_data = pd.DataFrame([{
            'origin_lat': coords[origin_addr][0],
            'origin_lng': coords[origin_addr][1],
            'dest_lat': coords[dest_addr][0],
            'dest_lng': coords[dest_addr][1],
            'distance_meters': distance_meters,
            'hour_of_day': datetime.now().hour,
            'is_holiday': 0,
            'weather_index': 1 if weather_condition == 'Lluvia' else 0,
            'day_of_week': datetime.now().strftime('%A'),
            'weather_condition': weather_condition,
            'is_peak': 1 if datetime.now().hour in [7, 8, 9, 17, 18, 19] else 0,
            'is_weekend': 1 if datetime.now().strftime('%A') in ['Saturday', 'Sunday'] else 0,
            'hour_sin': np.sin(2 * np.pi * datetime.now().hour / 24),
            'hour_cos': np.cos(2 * np.pi * datetime.now().hour / 24)
        }])
        travel_time, traffic_level = predict_traffic(model, input_data, scaler_mean, scaler_var, day_categories, weather_categories)
        if travel_time is None or traffic_level is None:
            return [], 0.0, [], 0.0
        corrected_travel_time = travel_time[0] * correction_factor
        corrected_traffic_level = traffic_level[0] * 1.43
        total_time += corrected_travel_time
        total_traffic_level += corrected_traffic_level
        segment_count += 1
    
    avg_traffic_level = total_traffic_level / segment_count if segment_count > 0 else 0.0
    
    return route_indices, total_time, ordered_addresses, avg_traffic_level

def solve_tsp(addresses, cost_matrix, objective):
    if len(addresses) <= 1:
        return list(range(len(addresses)))
    
    n = len(addresses)
    manager = pywrapcp.RoutingIndexManager(n, 1, 0)
    routing = pywrapcp.RoutingModel(manager)
    
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(cost_matrix[from_node][to_node] * 1000)
    
    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
    
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION if objective in ['time', 'climate'] else
        routing_enums_pb2.FirstSolutionStrategy.GLOBAL_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH if objective in ['time', 'climate'] else
        routing_enums_pb2.LocalSearchMetaheuristic.TABU_SEARCH
    )
    search_parameters.time_limit.seconds = 10
    
    solution = routing.SolveWithParameters(search_parameters)
    if solution:
        route = []
        index = routing.Start(0)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            route.append(node)
            index = solution.Value(routing.NextVar(index))
        return route
    return list(range(len(addresses)))

def main():
    engine = connect_to_db()
    model, scaler_mean, scaler_var, day_categories, weather_categories = load_traffic_model()
    
    if model is None:
        return
    
    barranquilla_lat, barranquilla_lng = 10.9878, -74.7889
    weather_condition = get_openweather_condition(barranquilla_lat, barranquilla_lng)
    
    connection = get_db_connection()
    try:
        arroyo_coords = {}
        for addr in ARROYO_ADDRESSES:
            lat, lng = geocode_address(addr, connection, is_critical=False)
            if lat is not None and lng is not None:
                arroyo_coords[addr] = (lat, lng)
        
        clusters = cluster_addresses(ADDRESSES, engine)
        if not clusters:
            return
        
        start_time = time.time()
        routes = {}
        total_times = {}
        avg_traffic_levels = {}
        missing_addresses = []
        
        for objective in ['time', 'traffic', 'climate']:
            all_ordered_addresses = [ORIGIN]
            total_time = 0.0
            total_traffic_level = 0.0
            total_segments = 0
            
            for cluster_id, cluster_addrs in clusters.items():
                route_indices, cluster_time, ordered_addresses, cluster_avg_traffic = optimize_routes(
                    cluster_addrs, objective, weather_condition, arroyo_coords, connection,
                    model, scaler_mean, scaler_var, day_categories, weather_categories
                )
                
                if not route_indices:
                    continue
                
                cluster_ordered = [addr for addr in ordered_addresses if addr not in [ORIGIN, DESTINATION]]
                all_ordered_addresses.extend(cluster_ordered)
                
                total_time += cluster_time
                total_traffic_level += cluster_avg_traffic * (len(ordered_addresses) - 1)
                total_segments += (len(ordered_addresses) - 1)
                
                missing = [addr for addr in cluster_addrs if addr not in ordered_addresses]
                if missing:
                    missing_addresses.extend(missing)
            
            all_ordered_addresses.append(DESTINATION)
            
            for i in range(len(all_ordered_addresses) - 1):
                origin_addr = all_ordered_addresses[i]
                dest_addr = all_ordered_addresses[i + 1]
                if origin_addr in ADDRESSES and dest_addr in ADDRESSES:
                    lat1, lng1 = geocode_address(origin_addr, connection, is_critical=True)
                    lat2, lng2 = geocode_address(dest_addr, connection, is_critical=True)
                    distance_meters = get_distance_from_db(origin_addr, dest_addr, connection)
                    if distance_meters is None:
                        route_data = get_google_directions_route(origin_addr, dest_addr, connection)
                        if route_data:
                            distance_meters = route_data['distance_meters']
                        else:
                            continue
                    input_data = pd.DataFrame([{
                        'origin_lat': lat1,
                        'origin_lng': lng1,
                        'dest_lat': lat2,
                        'dest_lng': lng2,
                        'distance_meters': distance_meters,
                        'hour_of_day': datetime.now().hour,
                        'is_holiday': 0,
                        'weather_index': 1 if weather_condition == 'Lluvia' else 0,
                        'day_of_week': datetime.now().strftime('%A'),
                        'weather_condition': weather_condition,
                        'is_peak': 1 if datetime.now().hour in [7, 8, 9, 17, 18, 19] else 0,
                        'is_weekend': 1 if datetime.now().strftime('%A') in ['Saturday', 'Sunday'] else 0,
                        'hour_sin': np.sin(2 * np.pi * datetime.now().hour / 24),
                        'hour_cos': np.cos(2 * np.pi * datetime.now().hour / 24)
                    }])
                    travel_time, traffic_level = predict_traffic(model, input_data, scaler_mean, scaler_var, day_categories, weather_categories)
                    if travel_time is not None and traffic_level is not None:
                        correction_factor = 0.93 - 0.02 * ((len(ADDRESSES) - 1) // 3)
                        total_time += travel_time[0] * correction_factor
                        total_traffic_level += traffic_level[0] * 1.43
                        total_segments += 1
            
            # Aplicar corrección del 10% al tiempo total
            total_time *= 0.90
            
            routes[objective] = all_ordered_addresses
            total_times[objective] = total_time
            avg_traffic_levels[objective] = total_traffic_level / total_segments if total_segments > 0 else 0.0
        
        elapsed_time = time.time() - start_time
        
        if missing_addresses:
            logger.warning(f"Direcciones no incluidas en alguna ruta: {missing_addresses}")
        
        for objective in ['time', 'traffic', 'climate']:
            objective_name = "Tiempo" if objective == 'time' else "Tráfico" if objective == 'traffic' else "Clima"
            logger.info(f"\nRuta optimizada por {objective_name}:")
            logger.info(f"Direcciones en orden: {routes[objective]}")
            logger.info(f"Tiempo total estimado: {total_times[objective]:.2f} minutos")
            logger.info(f"Nivel de congestión promedio: {avg_traffic_levels[objective]:.2f} (0.0 a 1.0)")
            logger.info("")
    
    finally:
        connection.close()
        engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Error en la optimización: {e}")