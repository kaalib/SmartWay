import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suprimir mensajes de TensorFlow
import pandas as pd
import numpy as np
from sqlalchemy import create_engine
import pymysql
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from tensorflow.keras.models import load_model # type: ignore
import requests
import logging
import polyline
from datetime import datetime
from dotenv import load_dotenv
from math import radians, sin, cos, sqrt, atan2
from sklearn.preprocessing import OneHotEncoder
import tensorflow as tf
import json
import time

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
    "Cra. 54 #55-127, Barranquilla, Atlántico",
    "Cra. 42 #51-35, Barranquilla, Atlántico",
    "Cl. 45D #17-12, Barranquilla, Atlántico",
    "Cl. 85 #53-25, Barranquilla, Atlántico",
    "Cra. 17 #80-10, Soledad, Atlántico",
    "Cra. 51B #135-01, Barranquilla, Atlántico",
    "Cl. 58 #45-30, Barranquilla, Atlántico",
    "Cra. 26B #74B-52, Barranquilla, Atlántico"
]

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

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # Radio de la Tierra en metros
    phi1, phi2 = radians(lat1), radians(lat2)
    delta_phi = radians(lat2 - lat1)
    delta_lambda = radians(lon2 - lon1)
    a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c

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
                response = requests.get(url, params=params, timeout=10)
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
        response = requests.get(url, params=params, timeout=10)
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

def check_arroyo_in_route(origin_coords, dest_coords, arroyo_coords, weather_condition):
    if weather_condition != "Lluvia":
        return False
    
    arroyo_lat, arroyo_lng = arroyo_coords
    if arroyo_lat is None or arroyo_lng is None:
        return False
    
    ox, oy = origin_coords
    dx, dy = dest_coords
    ax, ay = arroyo_lat, arroyo_lng
    
    len_sq = (dx - ox) ** 2 + (dy - oy) ** 2
    if len_sq == 0:
        return False
    
    t = max(0, min(1, ((ax - ox) * (dx - ox) + (ay - oy) * (dy - oy)) / len_sq))
    proj_x = ox + t * (dx - ox)
    proj_y = oy + t * (dy - oy)
    
    distance = ((ax - proj_x) ** 2 + (ay - proj_y) ** 2) ** 0.5
    return distance < 0.005

def load_traffic_model():
    from tensorflow.keras.metrics import MeanSquaredError, Metric # type: ignore
    from tensorflow.keras.utils import register_keras_serializable # type: ignore
    import tensorflow as tf

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

    model = load_model('traffic_model_simulated.h5', custom_objects=custom_objects)
    scaler_mean = np.load('scaler_simulated.npy', allow_pickle=True)
    scaler_var = np.load('scaler_simulated_var.npy', allow_pickle=True)
    with open('day_encoder_simulated.npy', 'rb') as f:
        day_categories = np.load(f, allow_pickle=True)
        # Aplanar si es un ndarray anidado o una lista con un solo ndarray
        if isinstance(day_categories, np.ndarray):
            day_categories = day_categories.flatten().tolist()
        elif isinstance(day_categories, list) and day_categories and isinstance(day_categories[0], (np.ndarray, list)):
            day_categories = np.array(day_categories[0]).flatten().tolist()
        # Validar que sean cadenas
        day_categories = [str(cat) for cat in day_categories]
    with open('weather_encoder_simulated.npy', 'rb') as f:
        weather_categories = np.load(f, allow_pickle=True)
        # Aplanar si es un ndarray anidado o una lista con un solo ndarray
        if isinstance(weather_categories, np.ndarray):
            weather_categories = weather_categories.flatten().tolist()
        elif isinstance(weather_categories, list) and weather_categories and isinstance(weather_categories[0], (np.ndarray, list)):
            weather_categories = np.array(weather_categories[0]).flatten().tolist()
        # Validar que sean cadenas
        weather_categories = [str(cat) for cat in weather_categories]
    logger.info("Modelo y preprocesadores cargados")
    logger.debug(f"day_categories: {day_categories}")
    logger.debug(f"weather_categories: {weather_categories}")
    return model, scaler_mean, scaler_var, day_categories, weather_categories

def preprocess_input(data, scaler_mean, scaler_var, day_categories, weather_categories):
    try:
        # Asegurar que los datos sean un DataFrame con las columnas esperadas
        if not all(col in data.columns for col in ['day_of_week', 'weather_condition']):
            logger.error("Faltan columnas requeridas en los datos de entrada")
            raise ValueError("Faltan columnas 'day_of_week' o 'weather_condition' en los datos")

        # Convertir columnas a strings para asegurar compatibilidad con OneHotEncoder
        data['day_of_week'] = data['day_of_week'].astype(str)
        data['weather_condition'] = data['weather_condition'].astype(str)

        # Inicializar OneHotEncoder con categorías predefinidas
        day_encoder = OneHotEncoder(sparse_output=False, categories=[day_categories], handle_unknown='ignore')
        weather_encoder = OneHotEncoder(sparse_output=False, categories=[weather_categories], handle_unknown='ignore')

        # Transformar variables categóricas
        day_encoded = day_encoder.fit_transform(data[['day_of_week']])
        weather_encoded = weather_encoder.fit_transform(data[['weather_condition']])

        # Crear nombres de columnas para las variables codificadas
        day_columns = [f"day_of_week_{cat}" for cat in day_categories]
        weather_columns = [f"weather_condition_{cat}" for cat in weather_categories]

        # Crear DataFrames para las variables codificadas
        encoded_df = pd.DataFrame(day_encoded, columns=day_columns)
        encoded_df = pd.concat([encoded_df, pd.DataFrame(weather_encoded, columns=weather_columns)], axis=1)

        # Seleccionar columnas numéricas
        numeric_cols = ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'distance_meters',
                        'hour_of_day', 'is_holiday', 'weather_index']
        if not all(col in data.columns for col in numeric_cols):
            logger.error(f"Faltan columnas numéricas en los datos: {numeric_cols}")
            raise ValueError(f"Faltan columnas numéricas en los datos: {numeric_cols}")

        numeric_df = data[numeric_cols]

        # Combinar datos numéricos y codificados
        X = pd.concat([numeric_df.reset_index(drop=True), encoded_df.reset_index(drop=True)], axis=1)
        X.fillna(X.mean(), inplace=True)

        # Escalar datos (convertir a array NumPy para evitar advertencia de nombres de características)
        scaler = StandardScaler()
        scaler.mean_ = scaler_mean
        scaler.var_ = scaler_var
        scaler.scale_ = np.sqrt(scaler_var)
        X_scaled = scaler.transform(X.values)  # Usar .values para eliminar nombres de columnas

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
        raise

def cluster_addresses(addresses, engine):
    n_addresses = len(addresses)
    if n_addresses <= 5:
        n_clusters = 1
    elif n_addresses <= 15:
        n_clusters = 2
    elif n_addresses <= 25:
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
    except Exception as e:
        logger.error(f"Error al consultar historical_data_simulated: {e}")
        return {0: addresses}
    
    features = df[df['origin'].isin(addresses)][['origin_lat', 'origin_lng', 'avg_traffic_level']]
    if features.empty:
        logger.warning("No se encontraron datos para las direcciones intermedias en historical_data_simulated")
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
    
    logger.info(f"Clústeres creados con GMM: {n_clusters} clústeres para {n_addresses} direcciones")
    return clusters_dict

def solve_tsp(addresses, cost_matrix):
    if len(addresses) <= 1:
        return list(range(len(addresses)))
    
    manager = pywrapcp.RoutingIndexManager(len(addresses), 1, 0)
    routing = pywrapcp.RoutingModel(manager)
    
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(cost_matrix[from_node][to_node] * 1000)
    
    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
    
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    
    solution = routing.SolveWithParameters(search_parameters)
    if solution:
        route = []
        index = routing.Start(0)
        while not routing.IsEnd(index):
            route.append(manager.IndexToNode(index))
            index = solution.Value(routing.NextVar(index))
        route.append(manager.IndexToNode(index))
        return route[:-1]
    return list(range(len(addresses)))

def generate_polyline(addresses, address_coords, route_indices):
    coords = [(address_coords[addresses[i]][0], address_coords[addresses[i]][1]) 
              for i in route_indices if addresses[i] in address_coords]
    return polyline.encode(coords) if len(coords) >= 2 else ""

def optimize_routes(addresses, arroyo_coords, weather_condition, engine, model, scaler_mean, scaler_var, day_categories, weather_categories):
    logger.debug("Iniciando optimize_routes")
    if len(addresses) < 1:
        raise ValueError("Se requiere al menos 1 dirección intermedia")
    
    all_addresses = [ORIGIN] + addresses + [DESTINATION]
    logger.debug(f"Direcciones totales: {all_addresses}")
    
    clusters = cluster_addresses(addresses, engine)
    logger.debug(f"Clústeres generados: {clusters}")
    
    current_time = datetime.now()
    day_of_week = current_time.strftime('%A')
    hour_of_day = current_time.hour
    is_holiday = 1 if current_time.strftime("%Y-%m-%d") in [
        "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18",
        "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20",
        "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17",
        "2025-12-08", "2025-12-25"
    ] else 0
    
    connection = get_db_connection()
    address_coords = {}
    missing_addresses = []
    try:
        for addr in all_addresses + list(arroyo_coords.keys()):
            logger.debug(f"Geocodificando dirección: {addr}")
            is_critical = addr in [ORIGIN, DESTINATION]
            lat, lng = geocode_address(addr, connection, is_critical=is_critical)
            if lat is None or lng is None:
                logger.warning(f"No se pudo geocodificar la dirección: {addr}. Se omitirá.")
                missing_addresses.append(addr)
            else:
                address_coords[addr] = (lat, lng)
                logger.debug(f"Coordenadas para {addr}: ({lat}, {lng})")
    finally:
        connection.close()
    
    if ORIGIN not in address_coords or DESTINATION not in address_coords:
        missing = [addr for addr in [ORIGIN, DESTINATION] if addr not in address_coords]
        raise ValueError(f"No se pudieron geocodificar direcciones críticas: {missing}")
    
    valid_addresses = [addr for addr in all_addresses if addr in address_coords]
    logger.debug(f"Direcciones válidas: {valid_addresses}")
    if len(valid_addresses) < 3:
        raise ValueError("No hay suficientes direcciones geocodificadas para optimizar la ruta")
    
    data = []
    for i, origin in enumerate(valid_addresses):
        for j, destination in enumerate(valid_addresses):
            if i != j:
                distance = haversine(address_coords[origin][0], address_coords[origin][1],
                                   address_coords[destination][0], address_coords[destination][1])
                weather_index = 1 if any(check_arroyo_in_route(address_coords[origin], address_coords[destination],
                                                              address_coords.get(arroyo, (0, 0)), weather_condition)
                                        for arroyo in arroyo_coords) else 0
                data.append({
                    'origin_lat': address_coords[origin][0],
                    'origin_lng': address_coords[origin][1],
                    'dest_lat': address_coords[destination][0],
                    'dest_lng': address_coords[destination][1],
                    'distance_meters': distance,
                    'hour_of_day': hour_of_day,
                    'is_holiday': is_holiday,
                    'weather_condition': str(weather_condition),
                    'weather_index': weather_index,
                    'day_of_week': str(day_of_week)
                })
    
    data_df = pd.DataFrame(data)
    logger.debug(f"Datos para predicción: {data_df.shape}")
    travel_times, traffic_levels = predict_traffic(model, data_df, scaler_mean, scaler_var, day_categories, weather_categories)
    
    time_matrix = np.zeros((len(valid_addresses), len(valid_addresses)))
    traffic_matrix = np.zeros((len(valid_addresses), len(valid_addresses)))
    climate_matrix = np.zeros((len(valid_addresses), len(valid_addresses)))
    
    idx = 0
    max_travel_time = np.max(travel_times) if len(travel_times) > 0 else 1.0  # Evitar división por cero
    high_cost = max_travel_time * 10  # Costo alto pero finito para rutas con arroyos
    for i in range(len(valid_addresses)):
        for j in range(len(valid_addresses)):
            if i != j:
                time_matrix[i][j] = travel_times[idx]
                traffic_matrix[i][j] = traffic_levels[idx]
                climate_matrix[i][j] = high_cost if weather_condition == "Lluvia" and data_df['weather_index'].iloc[idx] == 1 else travel_times[idx]
                idx += 1
            else:
                time_matrix[i][j] = float('inf')
                traffic_matrix[i][j] = float('inf')
                climate_matrix[i][j] = float('inf')
    
    routes = {'time': [], 'traffic': [], 'climate': []}
    total_costs = {'time': 0, 'traffic': 0, 'climate': 0}
    polylines = {'time': '', 'traffic': '', 'climate': ''}
    
    for objective, matrix in [('time', time_matrix), ('traffic', traffic_matrix), ('climate', climate_matrix)]:
        cluster_routes = []
        valid_cluster_addresses = []
        
        for cluster_id in clusters:
            cluster_addrs = [addr for addr in clusters.get(cluster_id, []) if addr in valid_addresses]
            if not cluster_addrs:
                continue
            valid_cluster_addresses.extend(cluster_addrs)
            indices = [valid_addresses.index(addr) for addr in cluster_addrs]
            if len(indices) < 1:
                continue
            sub_matrix = matrix[np.ix_(indices, indices)]
            route_indices = solve_tsp(cluster_addrs, sub_matrix)
            if route_indices:
                cluster_routes.append([cluster_addrs[i] for i in route_indices])
        
        full_route = [ORIGIN] if ORIGIN in valid_addresses else []
        if cluster_routes:
            for cluster in cluster_routes:
                full_route.extend(cluster)
        if DESTINATION in valid_addresses:
            full_route.append(DESTINATION)
        
        routes[objective] = full_route
        
        route_indices = [valid_addresses.index(addr) for addr in full_route if addr in valid_addresses]
        polylines[objective] = generate_polyline(valid_addresses, address_coords, route_indices)
        
        cost = 0
        for i in range(len(full_route) - 1):
            idx_i = valid_addresses.index(full_route[i]) if full_route[i] in valid_addresses else None
            idx_j = valid_addresses.index(full_route[i + 1]) if full_route[i + 1] in valid_addresses else None
            if idx_i is not None and idx_j is not None:
                cost += matrix[idx_i][idx_j]
        total_costs[objective] = cost
    
    return routes, total_costs, polylines, missing_addresses

def main():
    engine = connect_to_db()
    
    barranquilla_lat, barranquilla_lng = 10.9878, -74.7889
    weather_condition = get_openweather_condition(barranquilla_lat, barranquilla_lng)
    
    model, scaler_mean, scaler_var, day_categories, weather_categories = load_traffic_model()
    
    connection = get_db_connection()
    try:
        arroyo_coords = {}
        for addr in ARROYO_ADDRESSES:
            lat, lng = geocode_address(addr, connection, is_critical=False)
            if lat is not None and lng is not None:
                arroyo_coords[addr] = (lat, lng)
    finally:
        connection.close()
    
    routes, total_costs, polylines, missing_addresses = optimize_routes(
        ADDRESSES, arroyo_coords, weather_condition, engine, model,
        scaler_mean, scaler_var, day_categories, weather_categories
    )
    
    if missing_addresses:
        logger.warning(f"Direcciones no geocodificadas: {missing_addresses}")
    
    # Imprimir rutas en el orden solicitado: tipo de ruta, polilínea, direcciones, costo
    for objective in ['time', 'traffic', 'climate']:
        objective_name = "Tiempo" if objective == 'time' else "Tráfico" if objective == 'traffic' else "Clima"
        logger.info(f"Ruta optimizada por {objective_name}:")
        logger.info(f"Polilínea: {polylines[objective]}")
        logger.info(f"Direcciones en orden: {routes[objective]}")
        if objective == 'traffic':
            logger.info(f"Nivel de tráfico total estimado: {total_costs[objective]:.2f}")
        else:
            logger.info(f"Tiempo total estimado: {total_costs[objective]:.2f} minutos")
        logger.info("")  # Línea en blanco para separar rutas
    
    engine.dispose()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Error en la optimización: {e}")