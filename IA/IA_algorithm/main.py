from flask import Flask, request, jsonify
from flask_socketio import SocketIO
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
from tensorflow.keras.models import load_model
import requests
import logging
import json
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
import tensorflow as tf
from tensorflow.keras.metrics import Metric
import pygad

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/ubuntu/PF/IA/IA_algorithm/main.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Cargar variables de entorno
env_path = "/home/ubuntu/PF/.env"  # Ruta absoluta
if not os.path.exists(env_path):
    logger.error(f"No se encontró .env en {env_path}")
    raise FileNotFoundError(f"No se encontró .env en {env_path}")
load_dotenv(env_path)  # Usar la ruta absoluta definida

MYSQL_HOST = os.getenv('db_host')
MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))
MYSQL_USER = os.getenv('db_user')
MYSQL_PASSWORD = os.getenv('db_password')
MYSQL_DATABASE = os.getenv('db_name')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
TOMTOM_API_KEY = os.getenv('TOMTOM_API_KEY')
OPENWEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')


# Validar variables de entorno
if not all([MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, GOOGLE_API_KEY, OPENWEATHER_API_KEY]):
    logger.error("Faltan variables de entorno necesarias")
    raise ValueError("Faltan variables de entorno necesarias")

# Inicializar Flask y SocketIO
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Almacenar rutas globalmente
rutasIA = {}

# Métrica personalizada (mantenida igual)
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

# Funciones de conexión a la base de datos (mantenidas igual)
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

# Funciones auxiliares (mantenidas igual, pero resumidas aquí)
def geocode_address(address, connection, is_critical=False):
    # Implementación completa del código original (geocodificación con caché y Google API)
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
            data = json.loads(result['response_json'])
            cursor.close()
            return data['results'][0]['geometry']['location']['lat'], data['results'][0]['geometry']['location']['lng']
        # ... resto del código original ...
        logger.info(f"Consultando Geocoding API para: {address}")
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {'address': address, 'key': GOOGLE_API_KEY}
        response = requests.get(url, params=params, timeout=5)
        data = response.json()
        if response.status_code == 200 and data['status'] == 'OK':
            lat = data['results'][0]['geometry']['location']['lat']
            lng = data['results'][0]['geometry']['location']['lng']
            cursor.execute("INSERT INTO api_cache (origin, api_type, timestamp, response_json) VALUES (%s, %s, NOW(), %s)",
                           (address, 'google_geocoding', json.dumps(data)))
            connection.commit()
            cursor.close()
            return lat, lng
        cursor.close()
        return None, None
    except Exception as e:
        logger.error(f"Error en geocode_address para {address}: {e}")
        cursor.close()
        return None, None

def get_openweather_condition(lat, lng):
    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {
        'lat': lat,
        'lon': lng,
        'appid': OPENWEATHER_API_KEY,
        'units': 'metric'
    }
    try:
        response = requests.get(url, params=params, timeout=5)
        data = response.json()
        if response.status_code == 200:
            weather = data['weather'][0]['main']
            condition = "Lluvia" if weather in ['Rain', 'Drizzle', 'Thunderstorm'] else "Despejado"
            return condition
        return "Despejado"
    except Exception as e:
        logger.error(f"Error al consultar OpenWeather: {e}")
        return "Despejado"

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
        return model, scaler_mean, scaler_var, day_categories, weather_categories
    except Exception as e:
        logger.error(f"Error al cargar el modelo de tráfico: {e}")
        return None, None, None, [], []

def preprocess_input(data, scaler_mean, scaler_var, day_categories, weather_categories):
    try:
        required_cols = ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'distance_meters',
                        'hour_of_day', 'is_holiday', 'weather_index', 'day_of_week', 'weather_condition',
                        'is_peak', 'is_weekend', 'hour_sin', 'hour_cos']
        missing_cols = [col for col in required_cols if col not in data.columns]
        if missing_cols:
            raise ValueError(f"Faltan columnas: {missing_cols}")

        day_encoder = OneHotEncoder(sparse_output=False, categories=[day_categories], handle_unknown='ignore')
        weather_encoder = OneHotEncoder(sparse_output=False, categories=[weather_categories], handle_unknown='ignore')

        day_encoded = day_encoder.fit_transform(data[['day_of_week']])
        weather_encoded = weather_encoder.fit_transform(data[['weather_condition']])

        day_columns = [f"day_of_week_{cat}" for cat in day_categories]
        weather_columns = [f"weather_condition_{cat}" for cat in weather_categories]

        encoded_df = pd.DataFrame(day_encoded, columns=day_columns)
        encoded_df = pd.concat([encoded_df, pd.DataFrame(weather_encoded, columns=weather_columns)], axis=1)

        numeric_cols = ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'distance_meters',
                        'is_peak', 'is_weekend', 'hour_sin', 'hour_cos', 'weather_index']
        numeric_df = data[numeric_cols]

        X = pd.concat([numeric_df.reset_index(drop=True), encoded_df.reset_index(drop=True)], axis=1)
        X.fillna(X.mean(), inplace=True)

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
        travel_times = predictions[:, 0]
        traffic_levels = np.clip(predictions[:, 1], 0.0, 1.0)
        return travel_times, traffic_levels
    except Exception as e:
        logger.error(f"Error en predict_traffic: {e}")
        return None, None

def get_route_points(origin_coords, dest_coords):
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
        logger.error(f"Error en cluster_addresses: {e}")
        return {0: addresses}

def get_distance_from_db(origin_addr, dest_addr, connection):
    cursor = connection.cursor()
    current_day = datetime.now().strftime('%A')
    current_hour = datetime.now().hour
    if current_day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
        days = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
    else:
        days = ('Saturday', 'Sunday')
    in_placeholders = ','.join(['%s'] * len(days))

    cache_key = f"{origin_addr}|{dest_addr}|google_directions"
    query = """
        SELECT distance_meters
        FROM api_cache
        WHERE origin = %s AND api_type = 'google_directions'
        AND timestamp > NOW() - INTERVAL 7 DAY
    """
    try:
        cursor.execute(query, (cache_key,))
        result = cursor.fetchone()
        if result and result['distance_meters']:
            cursor.close()
            return result['distance_meters']

        query = """
            SELECT AVG(distance_meters) as distance_meters
            FROM historical_data_real
            WHERE origin = %s AND destination = %s 
            AND distance_meters IS NOT NULL
            AND day_of_week IN (%s)
            AND hour_of_day = %s
        """ % ('%s', '%s', in_placeholders, '%s')
        params = (origin_addr, dest_addr) + days + (int(current_hour),)
        cursor.execute(query, params)
        result = cursor.fetchone()
        if result and result['distance_meters']:
            cursor.close()
            return result['distance_meters']

        query = """
            SELECT AVG(distance_meters) as distance_meters
            FROM historical_data_real
            WHERE origin = %s AND destination = %s 
            AND distance_meters IS NOT NULL
            AND day_of_week IN (%s)
            AND hour_of_day BETWEEN %s AND %s
        """ % ('%s', '%s', in_placeholders, '%s', '%s')
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

def get_google_directions_route(origin_addr, dest_addr, connection):
    cache_key = f"{origin_addr}|{dest_addr}|google_directions"
    cursor = connection.cursor()
    current_day = datetime.now().strftime('%A')
    current_hour = datetime.now().hour
    if current_day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
        days = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
    else:
        days = ('Saturday', 'Sunday')
    in_placeholders = ','.join(['%s'] * len(days))

    try:
        query = """
            SELECT AVG(distance_meters) as distance_meters
            FROM historical_data_real
            WHERE origin = %s AND destination = %s 
            AND distance_meters IS NOT NULL
            AND day_of_week IN (%s)
            AND hour_of_day = %s
        """ % ('%s', '%s', in_placeholders, '%s')
        params = (origin_addr, dest_addr) + days + (int(current_hour),)
        cursor.execute(query, params)
        result = cursor.fetchone()
        if result and result['distance_meters']:
            distance_meters = result['distance_meters']
            lat1, lng1 = geocode_address(origin_addr, connection, is_critical=True)
            lat2, lng2 = geocode_address(dest_addr, connection, is_critical=True)
            if lat1 is None or lng1 is None or lat2 is None or lng2 is None:
                cursor.close()
                return None
            points = get_route_points((lat1, lng1), (lat2, lng2))
            cursor.close()
            return {'distance_meters': distance_meters, 'points': points}

        query = """
            SELECT response_json, distance_meters
            FROM api_cache
            WHERE origin = %s AND api_type = 'google_directions' 
            AND timestamp > NOW() - INTERVAL 7 DAY
        """
        cursor.execute(query, (cache_key,))
        result = cursor.fetchone()
        if result:
            data = json.loads(result['response_json'])
            distance_meters = result['distance_meters'] or sum(leg['distance']['value'] for leg in data['routes'][0]['legs'])
            points = [(step['start_location']['lat'], step['start_location']['lng']) for leg in data['routes'][0]['legs'] for step in leg['steps']] + \
                     [(data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lat'], data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lng'])]
            cursor.close()
            return {'distance_meters': distance_meters, 'points': points}

        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            'origin': origin_addr,
            'destination': dest_addr,
            'key': GOOGLE_API_KEY,
            'mode': 'driving'
        }
        response = requests.get(url, params=params, timeout=5)
        data = response.json()
        if response.status_code == 200 and data['status'] == 'OK':
            distance_meters = sum(leg['distance']['value'] for leg in data['routes'][0]['legs'])
            points = [(step['start_location']['lat'], step['start_location']['lng']) for leg in data['routes'][0]['legs'] for step in leg['steps']] + \
                     [(data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lat'], data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lng'])]
            cursor.execute("INSERT INTO api_cache (origin, destination, api_type, distance_meters, timestamp, response_json) VALUES (%s, %s, %s, %s, NOW(), %s)",
                           (cache_key, dest_addr, 'google_directions', distance_meters, json.dumps(data)))
            connection.commit()
            cursor.close()
            return {'distance_meters': distance_meters, 'points': points}
        cursor.close()
        return None
    except Exception as e:
        logger.error(f"Error en get_google_directions_route para {cache_key}: {e}")
        cursor.close()
        return None

def optimize_routes_by_distance(addresses, connection, model, scaler_mean, scaler_var, day_categories, weather_categories, weather_condition):
    if len(addresses) < 1:
        return [], 0.0, [], 0.0, 0.0

    all_addresses = [addresses[0]] + addresses[1:-1] + [addresses[-1]]
    coords = {}
    for addr in all_addresses:
        lat, lng = geocode_address(addr, connection, is_critical=True)
        if lat is None or lng is None:
            return [], 0.0, [], 0.0, 0.0
        coords[addr] = (lat, lng)

    n = len(all_addresses)
    distance_matrix = np.zeros((n, n))
    distance_dict = {}
    for i in range(n):
        for j in range(i + 1, n):
            origin = all_addresses[i]
            dest = all_addresses[j]
            distance = get_distance_from_db(origin, dest, connection)
            if distance is None:
                route_data = get_google_directions_route(origin, dest, connection)
                if route_data:
                    distance = route_data['distance_meters']
                else:
                    return [], 0.0, [], 0.0, 0.0
            distance_matrix[i][j] = distance_matrix[j][i] = distance
            distance_dict[(origin, dest)] = distance
            distance_dict[(dest, origin)] = distance

    best_distance = float('inf')
    best_route_indices = None

    def fitness_func(ga_instance, solution, solution_idx):
        nonlocal best_distance, best_route_indices
        solution = [int(i) for i in solution]
        if len(set(solution)) != len(solution):
            return -float('inf')
        route = [0] + [idx + 1 for idx in solution] + [len(all_addresses) - 1]
        total_distance = sum(distance_matrix[route[i]][route[i + 1]] for i in range(len(route) - 1))
        if total_distance <= 0:
            return -float('inf')
        if total_distance < best_distance:
            best_distance = total_distance
            best_route_indices = route
        return -total_distance

    def on_generation(ga_instance):
        nonlocal best_distance
        if ga_instance.generations_completed % 50 == 0:
            logger.info(f"Generación {ga_instance.generations_completed}, mejor distancia: {best_distance/1000:.2f} km")

    num_intermediate = len(addresses) - 2
    population_size = max(50, num_intermediate * 10)
    num_generations = max(200, num_intermediate * 50)

    ga_instance = pygad.GA(
        num_generations=num_generations,
        num_parents_mating=max(10, population_size // 5),
        fitness_func=fitness_func,
        sol_per_pop=population_size,
        num_genes=num_intermediate,
        gene_space=list(range(num_intermediate)),
        gene_type=int,
        allow_duplicate_genes=False,
        parent_selection_type="tournament",
        K_tournament=5,
        crossover_type="single_point",
        mutation_type="swap",
        mutation_probability=0.2 if num_intermediate > 10 else 0.1,
        on_generation=on_generation,
        keep_elitism=5,
        random_seed=42,
        suppress_warnings=True
    )

    ga_instance.run()

    if best_distance == float('inf'):
        return [], 0.0, [], 0.0, 0.0

    ordered_addresses = [all_addresses[i] for i in best_route_indices]
    route_indices = best_route_indices

    total_time = 0.0
    total_traffic_level = 0.0
    total_distance = 0.0
    segment_count = 0
    current_day = datetime.now().strftime('%A')
    current_hour = datetime.now().hour
    correction_factor = 0.93 - 0.02 * ((len(addresses) - 1) // 3)

    for i in range(len(ordered_addresses) - 1):
        origin_addr = ordered_addresses[i]
        dest_addr = ordered_addresses[i + 1]
        distance_meters = distance_dict.get((origin_addr, dest_addr))
        if distance_meters is None:
            return [], 0.0, [], 0.0, 0.0

        total_distance += distance_meters

        input_data = pd.DataFrame([{
            'origin_lat': coords[origin_addr][0],
            'origin_lng': coords[origin_addr][1],
            'dest_lat': coords[dest_addr][0],
            'dest_lng': coords[dest_addr][1],
            'distance_meters': distance_meters,
            'hour_of_day': current_hour,
            'is_holiday': 0,
            'weather_index': 1 if weather_condition == 'Lluvia' else 0,
            'day_of_week': current_day,
            'weather_condition': weather_condition,
            'is_peak': 1 if current_hour in [7, 8, 9, 17, 18, 19] else 0,
            'is_weekend': 1 if current_day in ['Saturday', 'Sunday'] else 0,
            'hour_sin': np.sin(2 * np.pi * current_hour / 24),
            'hour_cos': np.cos(2 * np.pi * current_hour / 24)
        }])
        travel_time, traffic_level = predict_traffic(model, input_data, scaler_mean, scaler_var, day_categories, weather_categories)
        if travel_time is None or traffic_level is None:
            return [], 0.0, [], 0.0, 0.0
        total_time += travel_time[0] * correction_factor
        total_traffic_level += traffic_level[0] * 1.43
        segment_count += 1

    total_time *= 0.85
    avg_traffic_level = total_traffic_level / segment_count if segment_count > 0 else 0.0

    return route_indices, total_time, ordered_addresses, avg_traffic_level, total_distance

def optimize_routes(addresses, objective, weather_condition, arroyo_coords, connection, model, scaler_mean, scaler_var, day_categories, weather_categories):
    if len(addresses) < 1:
        return [], 0.0, [], 0.0

    all_addresses = [addresses[0]] + addresses[1:-1] + [addresses[-1]]
    coords = {}
    for addr in all_addresses:
        lat, lng = geocode_address(addr, connection, is_critical=True)
        if lat is None or lng is None:
            return [], 0.0, [], 0.0
        coords[addr] = (lat, lng)

    tsp_addresses = addresses[1:-1]
    n = len(tsp_addresses)
    time_matrix = np.zeros((n, n))
    traffic_matrix = np.zeros((n, n))
    climate_matrix = np.zeros((n, n))

    correction_factor = 0.93 - 0.02 * ((n - 1) // 3)

    distance_dict = {}
    current_day = datetime.now().strftime('%A')
    current_hour = datetime.now().hour
    if current_day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
        days = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
    else:
        days = ('Saturday', 'Sunday')
    in_placeholders_days = ','.join(['%s'] * len(days))
    in_placeholders_addrs = ','.join(['%s'] * len(all_addresses))

    query = f"""
        SELECT origin, destination, distance_meters
        FROM api_cache
        WHERE origin IN ({in_placeholders_addrs}) 
        AND destination IN ({in_placeholders_addrs})
        AND api_type = 'google_directions'
        AND timestamp > NOW() - INTERVAL 7 DAY
    """
    cursor = connection.cursor()
    try:
        params = tuple(all_addresses) + tuple(all_addresses)
        cursor.execute(query, params)
        results = cursor.fetchall()
        for result in results:
            cache_key = result['origin']
            origin_addr, dest_addr, _ = cache_key.split('|')
            distance_dict[(origin_addr, dest_addr)] = result['distance_meters']

        query = f"""
            SELECT origin, destination, AVG(distance_meters) as distance_meters
            FROM historical_data_real
            WHERE origin IN ({in_placeholders_addrs}) 
            AND destination IN ({in_placeholders_addrs})
            AND distance_meters IS NOT NULL
            AND day_of_week IN ({in_placeholders_days})
            AND hour_of_day = %s
            GROUP BY origin, destination
        """
        params = tuple(all_addresses) + tuple(all_addresses) + days + (int(current_hour),)
        cursor.execute(query, params)
        results = cursor.fetchall()
        for result in results:
            if (result['origin'], result['destination']) not in distance_dict:
                distance_dict[(result['origin'], result['destination'])] = result['distance_meters']
    except Exception:
        pass
    finally:
        cursor.close()

    input_data = []
    route_points_dict = {}
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            origin = tsp_addresses[i]
            destination = tsp_addresses[j]

            distance_meters = distance_dict.get((origin, destination))
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
                'hour_of_day': current_hour,
                'is_holiday': 0,
                'weather_index': 1 if weather_condition == 'Lluvia' else 0,
                'day_of_week': current_day,
                'weather_condition': weather_condition,
                'is_peak': 1 if current_hour in [7, 8, 9, 17, 18, 19] else 0,
                'is_weekend': 1 if current_day in ['Saturday', 'Sunday'] else 0,
                'hour_sin': np.sin(2 * np.pi * current_hour / 24),
                'hour_cos': np.cos(2 * np.pi * current_hour / 24)
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
    ordered_addresses = [addresses[0]] + ordered_intermediate + [addresses[-1]]
    addr_to_index = {addr: i for i, addr in enumerate(all_addresses)}
    route_indices = [addr_to_index[addr] for addr in ordered_addresses]

    total_time = 0.0
    total_traffic_level = 0.0
    segment_count = 0
    for i in range(len(ordered_addresses) - 1):
        origin_addr = ordered_addresses[i]
        dest_addr = ordered_addresses[i + 1]
        distance_meters = distance_dict.get((origin_addr, dest_addr))
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
            'hour_of_day': current_hour,
            'is_holiday': 0,
            'weather_index': 1 if weather_condition == 'Lluvia' else 0,
            'day_of_week': current_day,
            'weather_condition': weather_condition,
            'is_peak': 1 if current_hour in [7, 8, 9, 17, 18, 19] else 0,
            'is_weekend': 1 if current_day in ['Saturday', 'Sunday'] else 0,
            'hour_sin': np.sin(2 * np.pi * current_hour / 24),
            'hour_cos': np.cos(2 * np.pi * current_hour / 24)
        }])
        travel_time, traffic_level = predict_traffic(model, input_data, scaler_mean, scaler_var, day_categories, weather_categories)
        if travel_time is None or traffic_level is None:
            return [], 0.0, [], 0.0
        total_time += travel_time[0] * correction_factor
        total_traffic_level += traffic_level[0] * 1.43
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
    search_parameters.time_limit.seconds = 5

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

# Endpoint para optimizar rutas
@app.route('/api/optimize', methods=['POST'])
def optimize():
    global rutasIA
    try:
        data = request.get_json()
        logger.info(f"Datos recibidos: {data}")
        addresses = data.get("addresses", [])
        if not addresses or len(addresses) < 2:
            return jsonify({"status": "error", "message": "Lista de direcciones insuficiente, debe incluir al menos origen y destino"}), 400

        # Extraer origen, destino y direcciones intermedias
        origin = addresses[0]
        destination = addresses[-1]
        intermediate_addresses = addresses[1:-1]

        # Cargar modelo y conectar a la base de datos
        engine = connect_to_db()
        model, scaler_mean, scaler_var, day_categories, weather_categories = load_traffic_model()
        if model is None:
            return jsonify({"status": "error", "message": "No se pudo cargar el modelo de tráfico"}), 500

        # Obtener clima
        barranquilla_lat, barranquilla_lng = 10.9878, -74.7889
        weather_condition = get_openweather_condition(barranquilla_lat, barranquilla_lng)

        connection = get_db_connection()
        try:
            # Obtener coordenadas de arroyos
            arroyo_coords = {}
            arroyo_addresses = [
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
            for addr in arroyo_addresses:
                lat, lng = geocode_address(addr, connection, is_critical=False)
                if lat is not None and lng is not None:
                    arroyo_coords[addr] = (lat, lng)

            # Ruta por distancia (sin clústeres)
            start_time = time.time()
            routes = {}
            total_times = {}
            avg_traffic_levels = {}
            total_distances = {}
            missing_addresses = []

            # Optimizar ruta por distancia
            route_indices, total_time, ordered_addresses, avg_traffic_level, total_distance = optimize_routes_by_distance(
                addresses, connection, model, scaler_mean, scaler_var, day_categories, weather_categories, weather_condition
            )
            if route_indices:
                routes['distance'] = ordered_addresses
                total_times['distance'] = total_time
                avg_traffic_levels['distance'] = avg_traffic_level
                total_distances['distance'] = total_distance / 1000
                missing_addresses.extend([addr for addr in intermediate_addresses if addr not in ordered_addresses])

            # Rutas por tiempo, tráfico y clima (con clústeres)
            clusters = cluster_addresses(intermediate_addresses, engine)
            if not clusters:
                return jsonify({"status": "error", "message": "No se pudieron generar clústeres"}), 500

            for objective in ['time', 'traffic', 'climate']:
                all_ordered_addresses = [origin]
                total_time = 0.0
                total_traffic_level = 0.0
                total_distance = 0.0
                total_segments = 0

                for cluster_id, cluster_addrs in clusters.items():
                    cluster_addresses = [origin] + cluster_addrs + [destination]
                    route_indices, cluster_time, ordered_addresses, cluster_avg_traffic = optimize_routes(
                        cluster_addresses, objective, weather_condition, arroyo_coords, connection,
                        model, scaler_mean, scaler_var, day_categories, weather_categories
                    )

                    if not route_indices:
                        continue

                    cluster_ordered = [addr for addr in ordered_addresses if addr not in [origin, destination]]
                    all_ordered_addresses.extend(cluster_ordered)

                    total_time += cluster_time
                    total_traffic_level += cluster_avg_traffic * (len(ordered_addresses) - 1)
                    total_segments += (len(ordered_addresses) - 1)

                    missing = [addr for addr in cluster_addrs if addr not in ordered_addresses]
                    if missing:
                        missing_addresses.extend(missing)

                all_ordered_addresses.append(destination)

                for i in range(len(all_ordered_addresses) - 1):
                    origin_addr = all_ordered_addresses[i]
                    dest_addr = all_ordered_addresses[i + 1]
                    distance_meters = get_distance_from_db(origin_addr, dest_addr, connection)
                    if distance_meters is None:
                        route_data = get_google_directions_route(origin_addr, dest_addr, connection)
                        if route_data:
                            distance_meters = route_data['distance_meters']
                        else:
                            continue
                    total_distance += distance_meters

                    lat1, lng1 = geocode_address(origin_addr, connection, is_critical=True)
                    lat2, lng2 = geocode_address(dest_addr, connection, is_critical=True)
                    if lat1 is None or lng1 is None or lat2 is None or lng2 is None:
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
                        correction_factor = 0.93 - 0.02 * ((len(addresses) - 1) // 3)
                        total_time += travel_time[0] * correction_factor
                        total_traffic_level += traffic_level[0] * 1.43
                        total_segments += 1

                total_time *= 0.85

                routes[objective] = all_ordered_addresses
                total_times[objective] = total_time
                avg_traffic_levels[objective] = total_traffic_level / total_segments if total_segments > 0 else 0.0
                total_distances[objective] = total_distance / 1000

            elapsed_time = time.time() - start_time

            if missing_addresses:
                logger.warning(f"Direcciones no incluidas en alguna ruta: {missing_addresses}")

            # Construir respuesta
            rutasIA = {
                "distance": {
                    "route": routes.get('distance', []),
                    "total_time_min": total_times.get('distance', 0.0),
                    "avg_traffic_level": avg_traffic_levels.get('distance', 0.0),
                    "total_distance_km": total_distances.get('distance', 0.0)
                },
                "time": {
                    "route": routes.get('time', []),
                    "total_time_min": total_times.get('time', 0.0),
                    "avg_traffic_level": avg_traffic_levels.get('time', 0.0),
                    "total_distance_km": total_distances.get('time', 0.0)
                },
                "traffic": {
                    "route": routes.get('traffic', []),
                    "total_time_min": total_times.get('traffic', 0.0),
                    "avg_traffic_level": avg_traffic_levels.get('traffic', 0.0),
                    "total_distance_km": total_distances.get('traffic', 0.0)
                },
                "climate": {
                    "route": routes.get('climate', []),
                    "total_time_min": total_times.get('climate', 0.0),
                    "avg_traffic_level": avg_traffic_levels.get('climate', 0.0),
                    "total_distance_km": total_distances.get('climate', 0.0)
                },
                "weather": {
                    "condition": weather_condition,
                    "is_raining": weather_condition == "Lluvia"
                },
                "elapsed_time": elapsed_time
            }

            logger.info(f"Rutas calculadas: {rutasIA}")
            socketio.emit("actualizar_rutas", {"rutasIA": rutasIA})
            return jsonify({"status": "success", "rutasIA": rutasIA}), 200

        finally:
            connection.close()
            engine.dispose()

    except Exception as e:
        logger.error(f"Error en /api/optimize: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)