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
from tensorflow.keras.metrics import Metric, MeanSquaredError # type: ignore
from tensorflow.keras.utils import register_keras_serializable # type: ignore
import random

# Configurar logging
logging.basicConfig(
    level=logging.DEBUG,
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
TOMTOM_API_KEY = os.getenv('TOMTOM_API_KEY')

# Puntos de inicio y fin
ORIGIN = "Universidad del Norte, Barranquilla, Atlántico"
DESTINATION = "Colegio Karl C. Parrish, Barranquilla, Atlántico"

# Direcciones intermedias
ADDRESSES = [
    "Cra. 54 #55-127, Barranquilla, Atlántico",
    "Cra. 41 #57-18, Barranquilla, Atlántico",
    "Cl. 50 #33-22, Barranquilla, Atlántico",
    "Cra. 21 #68-56, Soledad, Atlántico",
    "Cl. 45D #17-12, Barranquilla, Atlántico"
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
            logger.info(f"Usando caché para geocodificación: {address}")
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
            logger.info(f"Clima actual: {condition}")
            return condition
        else:
            logger.error(f"Error en OpenWeather API: {data.get('message', 'Desconocido')}")
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
    @register_keras_serializable()
    class CustomAccuracy(Metric):
        def __init__(self, name='custom_accuracy', **kwargs):
            super().__init__(name=name, **kwargs)
            self.correct = self.add_weight(name='correct', initializer='zeros')
            self.total = self.add_weight(name='total', initializer='zeros')

        def update_state(self, y_true, y_pred, sample_weight=None):
            y_true = tf.cast(y_true, tf.float32)
            y_pred = tf.cast(y_pred, tf.float32)
            travel_time_threshold = 0.1 * y_true[:, 0]
            traffic_level_threshold = 0.1
            travel_time_correct = tf.abs(y_pred[:, 0] - y_true[:, 0]) <= travel_time_threshold
            traffic_level_correct = tf.abs(y_pred[:, 1] - y_true[:, 1]) <= traffic_level_threshold
            correct = tf.logical_and(travel_time_correct, traffic_level_correct)
            correct = tf.cast(correct, tf.float32)
            self.correct.assign_add(tf.reduce_sum(correct))
            self.total.assign_add(tf.cast(tf.size(correct), tf.float32))

        def result(self):
            return self.correct / self.total

        def reset_states(self):
            self.correct.assign(0.0)
            self.total.assign(0.0)

        @classmethod
        def from_config(cls, config):
            return cls(**config)

    custom_objects = {
        'CustomAccuracy': CustomAccuracy,
        'mse': MeanSquaredError()
    }

    try:
        model = load_model('traffic_model_simulated.h5', custom_objects=custom_objects)
        scaler_mean = np.load('scaler_simulated.npy', allow_pickle=True)
        scaler_var = np.load('scaler_simulated_var.npy', allow_pickle=True)
        with open('day_encoder_simulated.npy', 'rb') as f:
            day_categories = np.load(f, allow_pickle=True)
            if isinstance(day_categories, np.ndarray):
                day_categories = day_categories.flatten().tolist()
            elif isinstance(day_categories, list) and day_categories and isinstance(day_categories[0], (np.ndarray, list)):
                day_categories = np.array(day_categories[0]).flatten().tolist()
            day_categories = [str(cat) for cat in day_categories]
        with open('weather_encoder_simulated.npy', 'rb') as f:
            weather_categories = np.load(f, allow_pickle=True)
            if isinstance(weather_categories, np.ndarray):
                weather_categories = weather_categories.flatten().tolist()
            elif isinstance(weather_categories, list) and day_categories and isinstance(weather_categories[0], (np.ndarray, list)):
                weather_categories = np.array(weather_categories[0]).flatten().tolist()
            weather_categories = [str(cat) for cat in weather_categories]
        logger.info("Modelo y preprocesadores cargados")
        return model, scaler_mean, scaler_var, day_categories, weather_categories
    except Exception as e:
        logger.error(f"Error al cargar el modelo de tráfico: {e}")
        return None, None, None, [], []

def preprocess_input(data, scaler_mean, scaler_var, day_categories, weather_categories):
    try:
        if not all(col in data.columns for col in ['day_of_week', 'weather_condition']):
            logger.error("Faltan columnas requeridas en los datos de entrada")
            raise ValueError("Faltan columnas 'day_of_week' o 'weather_condition' en los datos")

        data['day_of_week'] = data['day_of_week'].astype(str)
        data['weather_condition'] = data['weather_condition'].astype(str)

        day_encoder = OneHotEncoder(sparse_output=False, categories=[day_categories], handle_unknown='ignore')
        weather_encoder = OneHotEncoder(sparse_output=False, categories=[weather_categories], handle_unknown='ignore')

        day_encoded = day_encoder.fit_transform(data[['day_of_week']])
        weather_encoded = weather_encoder.fit_transform(data[['weather_condition']])

        day_columns = [f"day_of_week_{cat}" for cat in day_categories]
        weather_columns = [f"weather_condition_{cat}" for cat in weather_categories]

        encoded_df = pd.DataFrame(day_encoded, columns=day_columns)
        encoded_df = pd.concat([encoded_df, pd.DataFrame(weather_encoded, columns=weather_columns)], axis=1)

        numeric_cols = ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'distance_meters',
                        'traffic_level', 'hour_of_day', 'is_holiday', 'weather_index']
        if not all(col in data.columns for col in numeric_cols):
            logger.error(f"Faltan columnas numéricas en los datos: {numeric_cols}")
            raise ValueError(f"Faltan columnas numéricas en los datos: {numeric_cols}")

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
        return predictions[:, 0], predictions[:, 1]  # travel_time, traffic_level
    except Exception as e:
        logger.error(f"Error en predict_traffic: {e}")
        return None, None

def get_google_directions_route(origin_addr, dest_addr, connection):
    cache_key = f"{origin_addr}|{dest_addr}|google_directions"
    cursor = connection.cursor()
    query = """
        SELECT response_json, travel_time, distance_meters, traffic_level
        FROM api_cache
        WHERE origin = %s AND api_type = 'google_directions' AND timestamp > NOW() - INTERVAL 30 DAY
    """
    try:
        cursor.execute(query, (cache_key,))
        result = cursor.fetchone()
        
        if result:
            logger.info(f"Usando caché para Google Directions: {cache_key}")
            data = json.loads(result['response_json'])
            cursor.close()
            return {
                'travel_time': result['travel_time'] or sum(leg['duration']['value'] for leg in data['routes'][0]['legs']) / 60,
                'distance_meters': result['distance_meters'] or sum(leg['distance']['value'] for leg in data['routes'][0]['legs']),
                'points': [(step['start_location']['lat'], step['start_location']['lng']) for leg in data['routes'][0]['legs'] for step in leg['steps']] + 
                          [(data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lat'], data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lng'])],
                'cost': result['travel_time'] or sum(leg['duration']['value'] for leg in data['routes'][0]['legs']) / 60,
                'traffic_level': result['traffic_level'] or 0.5
            }
        
        logger.info(f"Consultando Google Directions API para: {cache_key}")
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            'origin': origin_addr,
            'destination': dest_addr,
            'key': GOOGLE_API_KEY,
            'mode': 'driving',
            'departure_time': 'now'
        }
        
        for attempt in range(3):
            try:
                response = requests.get(url, params=params, timeout=5)
                data = response.json()
                if response.status_code == 200 and data['status'] == 'OK':
                    travel_time = sum(leg['duration']['value'] for leg in data['routes'][0]['legs']) / 60
                    distance = sum(leg['distance']['value'] for leg in data['routes'][0]['legs'])
                    points = [(step['start_location']['lat'], step['start_location']['lng']) for leg in data['routes'][0]['legs'] for step in leg['steps']] + \
                             [(data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lat'], data['routes'][0]['legs'][-1]['steps'][-1]['end_location']['lng'])]
                    traffic_level = 0.5  # Valor por defecto
                    cursor.execute("""
                        INSERT INTO api_cache (origin, destination, api_type, travel_time, distance_meters, traffic_level, timestamp, response_json)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s)
                    """, (cache_key, dest_addr, 'google_directions', travel_time, distance, traffic_level, json.dumps(data)))
                    connection.commit()
                    logger.info(f"Guardado en api_cache para: {cache_key}")
                    cursor.close()
                    return {
                        'travel_time': travel_time,
                        'distance_meters': distance,
                        'points': points,
                        'cost': travel_time,
                        'traffic_level': traffic_level
                    }
                else:
                    logger.error(f"Error en Google Directions API: {data.get('status', 'Desconocido')}")
                    time.sleep(2 ** attempt)
            except Exception as e:
                logger.error(f"Intento {attempt + 1} fallido para Google Directions: {e}")
                time.sleep(2 ** attempt)
        cursor.close()
        return None
    except Exception as e:
        logger.error(f"Error en get_google_directions_route: {e}")
        cursor.close()
        return None

def solve_tsp(addresses, cost_matrix, objective):
    if len(addresses) <= 1:  # Si no hay direcciones intermedias o solo una
        return list(range(len(addresses)))
    
    n = len(addresses)
    manager = pywrapcp.RoutingIndexManager(n, 1, 0)  # 1 vehículo, depot=0 (primer nodo)
    routing = pywrapcp.RoutingModel(manager)
    
    # Aumentar la perturbación para tráfico
    perturbed_matrix = cost_matrix.copy()
    if objective == 'traffic':
        perturbation = np.random.uniform(0.2, 0.5, perturbed_matrix.shape)  # Aumentado el rango
        perturbed_matrix = np.where(perturbed_matrix != float('inf'), perturbed_matrix * (1 + perturbation), perturbed_matrix)
    
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(perturbed_matrix[from_node][to_node] * 1000)
    
    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
    
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC if objective in ['time', 'climate'] else
        routing_enums_pb2.FirstSolutionStrategy.GLOBAL_CHEAPEST_ARC  # Más diverso para tráfico
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
        logger.debug(f"Ruta TSP para {objective}: {route}")
        return route
    logger.warning(f"No se encontró solución TSP para {objective}, usando orden por defecto")
    return list(range(len(addresses)))

def get_google_routes_route(origin_coords, dest_coords, connection, objective, arroyo_coords=None, weather_condition="Despejado"):
    cache_key = f"{origin_coords[0]},{origin_coords[1]}|{dest_coords[0]},{dest_coords[1]}|google_routes_{objective}"
    cursor = connection.cursor()
    
    logger.info(f"Consultando Google Routes API para: {cache_key} (sin caché)")
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.legs,routes.travelAdvisory'
    }
    departure_time = (datetime.utcnow() + timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M:%SZ')
    logger.debug(f"Usando departureTime: {departure_time}")
    body = {
        'origin': {'location': {'latLng': {'latitude': origin_coords[0], 'longitude': origin_coords[1]}}},
        'destination': {'location': {'latLng': {'latitude': dest_coords[0], 'longitude': dest_coords[1]}}},
        'travelMode': 'DRIVE',
        'routingPreference': 'TRAFFIC_AWARE' if objective == 'traffic' else 'TRAFFIC_AWARE_OPTIMAL',
        'computeAlternativeRoutes': objective == 'traffic',
        'departureTime': departure_time
    }
    
    for attempt in range(3):
        try:
            response = requests.post(url, json=body, headers=headers, timeout=5)
            data = response.json()
            if response.status_code == 200 and 'routes' in data and len(data['routes']) > 0:
                selected_route = data['routes'][0]
                if objective == 'traffic' and len(data['routes']) > 1:
                    selected_route = min(data['routes'], key=lambda r: r.get('travelAdvisory', {}).get('trafficCondition', {}).get('severity', 0.5))
                
                travel_time = int(selected_route['duration'].replace('s', '')) / 60
                distance = selected_route['distanceMeters']
                points = [(step['startLocation']['latLng']['latitude'], step['startLocation']['latLng']['longitude']) 
                          for leg in selected_route.get('legs', []) for step in leg.get('steps', [])] + \
                         [(selected_route['legs'][-1]['steps'][-1]['endLocation']['latLng']['latitude'], 
                           selected_route['legs'][-1]['steps'][-1]['endLocation']['latLng']['longitude'])] if selected_route.get('legs') else []
                traffic_level = selected_route.get('travelAdvisory', {}).get('trafficCondition', {}).get('severity', 0.5)
                cost = travel_time * (1.0 + traffic_level * 5.0) if objective == 'traffic' else travel_time
                cursor.execute("""
                    INSERT INTO api_cache (origin, api_type, travel_time, distance_meters, traffic_level, timestamp, response_json)
                    VALUES (%s, %s, %s, %s, %s, NOW(), %s)
                """, (cache_key, f'google_routes_{objective}', travel_time, distance, traffic_level, json.dumps(data)))
                connection.commit()
                logger.info(f"Guardado en api_cache para: {cache_key}")
                logger.debug(f"Coste para {cache_key}: {cost} (travel_time={travel_time}, traffic_level={traffic_level})")
                cursor.close()
                return {
                    'travel_time': travel_time,
                    'distance_meters': distance,
                    'traffic_level': traffic_level,
                    'points': points,
                    'cost': cost
                }
            else:
                logger.error(f"Error en Google Routes API: {data.get('error', 'Desconocido')}")
                time.sleep(2 ** attempt)
        except Exception as e:
            logger.error(f"Intento {attempt + 1} fallido para Google Routes: {e}")
            time.sleep(2 ** attempt)
    cursor.close()
    logger.error(f"No se pudo obtener ruta para {cache_key} tras 3 intentos")
    return None

def optimize_routes(addresses, objective, weather_condition, arroyo_coords, connection, model, scaler_mean, scaler_var, day_categories, weather_categories):
    if len(addresses) < 1:
        logger.warning("Se requiere al menos 1 dirección intermedia para optimizar")
        return [], 0.0, []
    
    # Lista de direcciones para TSP (solo intermedias)
    tsp_addresses = addresses
    n = len(tsp_addresses)
    time_matrix = np.zeros((n, n))
    traffic_matrix = np.zeros((n, n))
    climate_matrix = np.zeros((n, n))
    coords = {}
    
    # Geocodificar todas las direcciones, incluyendo ORIGIN y DESTINATION
    all_addresses = [ORIGIN] + addresses + [DESTINATION]
    for addr in all_addresses:
        lat, lng = geocode_address(addr, connection, is_critical=True)
        if lat is None or lng is None:
            logger.error(f"No se pudo geocodificar: {addr}")
            return [], 0.0, []
        coords[addr] = (lat, lng)
    
    # Calcular matrices de costos solo para direcciones intermedias
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            origin = tsp_addresses[i]
            destination = tsp_addresses[j]
            if objective == 'traffic':
                route_data = get_google_routes_route(coords[origin], coords[destination], connection, objective, arroyo_coords, weather_condition)
                if not route_data:
                    logger.error(f"No se pudo obtener ruta de tráfico de {origin} a {destination}")
                    # Usar modelo de tráfico como respaldo
                    route_data = get_google_directions_route(origin, destination, connection)
                    if route_data:
                        input_data = pd.DataFrame({
                            'origin_lat': [coords[origin][0]],
                            'origin_lng': [coords[origin][1]],
                            'dest_lat': [coords[destination][0]],
                            'dest_lng': [coords[destination][1]],
                            'distance_meters': [route_data['distance_meters']],
                            'traffic_level': [0.5],
                            'hour_of_day': [datetime.now().hour],
                            'is_holiday': [0],
                            'weather_index': [1 if weather_condition == 'Lluvia' else 0],
                            'day_of_week': [datetime.now().strftime('%A')],
                            'weather_condition': [weather_condition]
                        })
                        _, traffic_level = predict_traffic(model, input_data, scaler_mean, scaler_var, day_categories, weather_categories)
                        if traffic_level is not None:
                            route_data['traffic_level'] = max(0.0, min(1.0, float(traffic_level[0])))
                        else:
                            route_data['traffic_level'] = 0.5
            else:
                route_data = get_google_routes_route(coords[origin], coords[destination], connection, 'time', arroyo_coords, weather_condition)
                if not route_data:
                    route_data = get_google_directions_route(origin, destination, connection)
            
            if not route_data:
                logger.error(f"No se pudo obtener ruta de {origin} a {destination}")
                return [], 0.0, []
            
            time_matrix[i][j] = route_data['travel_time']
            traffic_matrix[i][j] = route_data['travel_time'] * (1.0 + route_data['traffic_level'] * 5.0)
            route_points = route_data['points']
            weather_index = 0
            if weather_condition == 'Lluvia':
                for arroyo_addr, arroyo_coord in arroyo_coords.items():
                    if check_arroyo_in_route(route_points, arroyo_coord, weather_condition):
                        weather_index += 1
            climate_matrix[i][j] = time_matrix[i][j] * (1.0 + weather_index * 0.5)  # Ajuste suave para clima
    
    # Depuración: inspeccionar matrices
    logger.debug(f"time_matrix para {objective}:\n{time_matrix}")
    logger.debug(f"traffic_matrix para {objective}:\n{traffic_matrix}")
    logger.debug(f"climate_matrix para {objective}:\n{climate_matrix}")
    
    # Seleccionar matriz según el objetivo
    cost_matrix = time_matrix if objective in ['time', 'climate'] else traffic_matrix
    
    # Resolver TSP solo para direcciones intermedias
    route_indices = solve_tsp(tsp_addresses, cost_matrix, objective)
    
    # Construir ruta completa: ORIGIN + direcciones intermedias ordenadas + DESTINATION
    ordered_intermediate = [tsp_addresses[i] for i in route_indices]
    ordered_addresses = [ORIGIN] + ordered_intermediate + [DESTINATION]
    # Construir route_indices para la ruta completa
    addr_to_index = {addr: i for i, addr in enumerate(all_addresses)}
    route_indices = [addr_to_index[addr] for addr in ordered_addresses]
    
    # Calcular tiempo total usando Google Routes
    total_time = 0.0
    for i in range(len(ordered_addresses) - 1):
        origin_addr = ordered_addresses[i]
        dest_addr = ordered_addresses[i + 1]
        route_data = get_google_routes_route(
            coords[origin_addr], coords[dest_addr], connection, objective, arroyo_coords, weather_condition
        )
        if not route_data:
            logger.error(f"No se pudo obtener tiempo de {origin_addr} a {dest_addr}")
            return [], 0.0, []
        total_time += route_data['travel_time']
        logger.debug(f"Segmento {origin_addr} -> {dest_addr}: {route_data['travel_time']} minutos, traffic_level={route_data['traffic_level']}")
    
    return route_indices, total_time, ordered_addresses

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
    
    query = """
        SELECT origin, AVG(traffic_level) as avg_traffic_level, origin_lat, origin_lng
        FROM historical_data_simulated
        GROUP BY origin
    """
    try:
        df = pd.read_sql(query, engine)
        features = df[df['origin'].isin(addresses)][['origin_lat', 'origin_lng', 'avg_traffic_level']]
        
        if features.empty or len(features) < n_clusters:
            logger.warning("Datos insuficientes en historical_data_simulated. Usando un solo clúster.")
            return {0: addresses}
        
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)
        
        gmm = GaussianMixture(n_components=n_clusters, random_state=42)
        clusters = gmm.fit_predict(features_scaled)
        
        address_clusters = {addr: cluster for addr, cluster in zip(df[df['origin'].isin(addresses)]['origin'], clusters)}
        clusters_dict = {i: [] for i in range(n_clusters)}
        for addr in addresses:
            cluster = address_clusters.get(addr, 0)
            clusters_dict[cluster].append(addr)
        
        clusters_dict = {k: v for k, v in clusters_dict.items() if v}
        if not clusters_dict:
            logger.warning("No se generaron clústeres válidos. Usando un solo clúster.")
            return {0: addresses}
        
        logger.info(f"Clústeres creados con GMM: {len(clusters_dict)} clústeres para {n_addresses} direcciones")
        return clusters_dict
    except Exception as e:
        logger.error(f"Error al consultar historical_data_simulated: {e}")
        return {0: addresses}



def main():
    engine = connect_to_db()
    
    model, scaler_mean, scaler_var, day_categories, weather_categories = load_traffic_model()
    
    barranquilla_lat, barranquilla_lng = 10.9878, -74.7889
    weather_condition = get_openweather_condition(barranquilla_lat, barranquilla_lng)
    
    connection = get_db_connection()
    try:
        arroyo_coords = {}
        for addr in ARROYO_ADDRESSES:
            lat, lng = geocode_address(addr, connection, is_critical=False)
            if lat is not None and lng is not None:
                arroyo_coords[addr] = (lat, lng)
        
        start_time = time.time()
        routes = {}
        total_times = {}
        missing_addresses = []
        
        for objective in ['time', 'traffic', 'climate']:
            route_indices, total_time, ordered_addresses = optimize_routes(
                ADDRESSES, objective, weather_condition, arroyo_coords, connection,
                model, scaler_mean, scaler_var, day_categories, weather_categories
            )
            
            if len([addr for addr in ordered_addresses if addr in ADDRESSES]) < len(ADDRESSES):
                missing_addresses.extend([addr for addr in ADDRESSES if addr not in ordered_addresses])
            
            routes[objective] = ordered_addresses
            total_times[objective] = total_time
        
        elapsed_time = time.time() - start_time
        logger.info(f"Tiempo de ejecución: {elapsed_time:.2f} segundos")
        
        if missing_addresses:
            logger.warning(f"Direcciones no geocodificadas: {missing_addresses}")
        
        for objective in ['time', 'traffic', 'climate']:
            objective_name = "Tiempo" if objective == 'time' else "Tráfico" if objective == 'traffic' else "Clima"
            logger.info(f"Ruta optimizada por {objective_name}:")
            logger.info(f"Direcciones en orden: {routes[objective]}")
            logger.info(f"Tiempo total estimado del recorrido: {total_times[objective]:.2f} minutos")
            logger.info("")
    
    finally:
        connection.close()
        engine.dispose()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Error en la optimización: {e}")