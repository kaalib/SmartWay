import requests
import json
import os
from datetime import datetime, timedelta
import time
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import Error
import logging
from math import radians, sin, cos, sqrt, atan2
import random

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/ubuntu/PF/IA/historical_data.log'),
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
TOMTOM_API_KEY_ACCIDENTS = os.getenv('TOMTOM_API_KEY_ACCIDENTS')
OPENWEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')

# Lista completa de direcciones (40 direcciones)
ADDRESSES = [
    "Carrera 54 #55-127, Barranquilla, Atlántico",
    "Carrera 26B #74B-52, Barranquilla, Atlántico",
    "Calle 45d #17-12, Barranquilla, Atlántico",
    "Carrera 21 #56-78, Soledad, Atlántico",
    "Calle 50 #33-22, Barranquilla, Atlántico",
    "Calle 90 #44-12, Barranquilla, Atlántico",
    "Calle 38 #29-76, Barranquilla, Atlántico",
    "Carrera 10 #22-40, Soledad, Atlántico",
    "Calle 75D #22D-33, Soledad, Atlántico",
    "Calle 10 #8-25, Galapa, Atlántico",
    "Calle 32 #7D-66, Barranquilla, Atlántico",
    "Carrera 13 # 63B-42 Barranquilla, Atlántico",
    "Carrera 67 # 76-122, Barranquilla, Atlántico",
    "Calle 70 #38-15, Barranquilla, Atlántico",
    "Calle 22 #25-30, Barranquilla, Atlántico",
    "Calle 45 #23-55, Barranquilla, Atlántico",
    "Calle 85 #53-25, Barranquilla, Atlántico",
    "Carrera 17 #80-10, Soledad, Atlántico",
    "Cra. 51B #135-01, Barranquilla, Atlántico",
    "Carrera 43 #72-30, Barranquilla, Atlántico",
    "Calle 53 #46-50, Barranquilla, Atlántico",
    "Carrera 38 #48-22, Barranquilla, Atlántico",
    "Carrera 25 #77-89, Soledad, Atlántico",
    "Carrera 49 #75-60, Barranquilla, Atlántico",
    "Carrera 14 #20-60, Soledad, Atlántico",
    "Carrera 3 #20-33, Soledad, Atlántico",
    "Calle 65 #39-28, Barranquilla, Atlántico",
    "Carrera 53 #68-70, Barranquilla, Atlántico",
    "Calle 47 #34-12, Barranquilla, Atlántico",
    "Carrera 41 #40-55, Barranquilla, Atlántico",
    "Carrera 7 #55-22, Soledad, Atlántico",
    "Carrera 18 #10-44, Soledad, Atlántico",
    "Carrera 29 # 35-50, Soledad, Atlántico",
    "Carrera 44 #57-88, Barranquilla, Atlántico",
    "Calle 74 #50-20, Barranquilla, Atlántico",
    "Carrera 39 #73-64, Barranquilla, Atlántico",
    "Calle 58 #45-30, Barranquilla, Atlántico",
    "Carrera 47 #69-83, Barranquilla, Atlántico",
    "Calle 79 #42-41, Barranquilla, Atlántico",
    "Carrera 42 #51-35, Barranquilla, Atlántico"
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

HOLIDAYS_2025 = [
    "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18",
    "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20",
    "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17",
    "2025-12-08", "2025-12-25"
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
        connection = mysql.connector.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DATABASE
        )
        if connection.is_connected():
            logger.info("Conexión exitosa a MySQL")
            return connection
    except Error as e:
        logger.error(f"Error al conectar a MySQL: {e}")
        raise

def geocode_address(address, connection):
    cursor = connection.cursor()
    query = """
        SELECT response_json
        FROM api_cache
        WHERE origin = %s AND api_type = 'google_geocoding' AND timestamp > NOW() - INTERVAL 30 DAY
    """
    cursor.execute(query, (address,))
    result = cursor.fetchone()
    
    if result:
        logger.info(f"Usando caché para geocodificación: {address}")
        data = json.loads(result[0])
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
                logger.error(f"Error en Geocoding API para {address}: {data.get('status', 'Desconocido')}")
                return None, None
        except Exception as e:
            logger.error(f"Intento {attempt + 1} fallido para geocodificar {address}: {e}")
            time.sleep(2 ** attempt)
    logger.error(f"No se pudo geocodificar {address} tras 3 intentos")
    cursor.close()
    return None, None

def get_google_directions(origin, destination, connection, direction_calls, is_peak_hour):
    cursor = connection.cursor()
    
    # En horas no pico, intentar usar caché
    if not is_peak_hour:
        query = """
            SELECT travel_time, distance_meters, response_json
            FROM api_cache
            WHERE origin = %s AND destination = %s AND api_type = 'google_directions'
            AND timestamp > NOW() - INTERVAL 1 HOUR
        """
        cursor.execute(query, (origin, destination))
        result = cursor.fetchone()
        
        if result:
            logger.info(f"Usando caché para Directions en hora no pico: {origin} -> {destination}")
            cursor.close()
            return result[0], result[1], json.loads(result[2]), direction_calls
    
    # En horas pico o si no hay caché, consultar la API
    logger.info(f"Consultando Directions API para: {origin} -> {destination}")
    url = "https://maps.googleapis.com/maps/api/directions/json"
    params = {
        'origin': origin,
        'destination': destination,
        'key': GOOGLE_API_KEY,
        'departure_time': 'now',
        'traffic_model': 'best_guess',
        'mode': 'driving'
    }
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, timeout=10)
            logger.info(f"Google Directions API request: {url} with params origin={origin}, destination={destination}")
            data = response.json()
            if response.status_code == 200 and data['status'] == 'OK':
                route = data['routes'][0]['legs'][0]
                travel_time = route['duration_in_traffic']['value'] / 60.0
                distance = route['distance']['value']
                # Guardar en caché solo en horas no pico
                if not is_peak_hour:
                    cursor.execute("""
                        INSERT INTO api_cache (origin, destination, api_type, travel_time, distance_meters, timestamp, response_json)
                        VALUES (%s, %s, %s, %s, %s, NOW(), %s)
                    """, (origin, destination, 'google_directions', travel_time, distance, json.dumps(data)))
                    connection.commit()
                    logger.info(f"Guardado en api_cache para: {origin} -> {destination}")
                cursor.close()
                return travel_time, distance, data, direction_calls + 1
            else:
                logger.error(f"Error en Directions API para {origin} -> {destination}: status={data.get('status', 'Desconocido')}, message={data.get('error_message', 'N/A')}")
                cursor.close()
                return 0.0, 0.0, None, direction_calls
        except Exception as e:
            logger.error(f"Intento {attempt + 1} fallido en Directions API para {origin} -> {destination}: {e}")
            time.sleep(2 ** attempt)
    logger.error(f"No se pudo obtener Directions para {origin} -> {destination} tras 3 intentos")
    cursor.close()
    return 0.0, 0.0, None, direction_calls

def get_tomtom_traffic(lat, lng, connection, traffic_calls):
    url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
    params = {
        'point': f"{lat},{lng}",
        'key': TOMTOM_API_KEY,
        'unit': 'kmph'
    }
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, timeout=10)
            logger.info(f"TomTom Traffic API request: {url} with params point={lat},{lng}, unit=kmph")
            traffic_calls += 1
            data = response.json()
            if response.status_code == 200:
                current_speed = data['flowSegmentData']['currentSpeed']
                free_flow_speed = data['flowSegmentData']['freeFlowSpeed']
                traffic_level = 1 - (current_speed / free_flow_speed) if free_flow_speed > 0 else 0.5
                traffic_level = min(max(traffic_level, 0), 1)
                logger.info(f"Consultado TomTom Traffic para ({lat}, {lng}): traffic_level={traffic_level}, current_speed={current_speed}")
                return traffic_level, current_speed, traffic_calls
            else:
                logger.error(f"Error en TomTom Traffic API: {data.get('error', 'Desconocido')}, status_code={response.status_code}")
                return 0.5, None, traffic_calls
        except Exception as e:
            logger.error(f"Intento {attempt + 1} fallido en TomTom Traffic API: {e}")
            time.sleep(2 ** attempt)
    logger.warning("Usando valores por defecto tras fallos en TomTom Traffic: traffic_level=0.5, current_speed=None")
    return 0.5, None, traffic_calls

def get_tomtom_accidents(lat, lng, connection, accidents_calls):
    delta = 0.009
    bbox = f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}"
    url = "https://api.tomtom.com/traffic/services/5/incidentDetails"
    params = {
        'key': TOMTOM_API_KEY_ACCIDENTS,
        'bbox': bbox,
        'fields': '{incidents{type,properties{iconCategory}}}',
        'categoryFilter': 'Accident',
        'timeValidityFilter': 'present'
    }
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, timeout=10)
            logger.info(f"TomTom Incidents API request: {url} with params bbox={bbox}")
            accidents_calls += 1
            data = response.json()
            if response.status_code == 200:
                incidents = data.get('incidents', [])
                has_accident = 1 if any(incident['properties']['iconCategory'] == 1 for incident in incidents) else 0
                logger.info(f"Consultado TomTom Incidents para ({lat}, {lng}): has_accident={has_accident}")
                return has_accident, accidents_calls
            else:
                logger.error(f"Error en TomTom Incidents API: {data.get('error', 'Desconocido')}, status_code={response.status_code}")
                return 0, accidents_calls
        except Exception as e:
            logger.error(f"Intento {attempt + 1} fallido en TomTom Incidents API: {e}")
            time.sleep(2 ** attempt)
    logger.warning("Usando valor por defecto tras fallos en TomTom Incidents: has_accident=0")
    return 0, accidents_calls

def get_openweather_condition(lat, lng):
    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {
        'lat': lat,
        'lon': lng,
        'appid': OPENWEATHER_API_KEY,
        'units': 'metric'
    }
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            if response.status_code == 200:
                weather = data['weather'][0]['main']
                if weather in ['Rain', 'Drizzle', 'Thunderstorm']:
                    condition = "Lluvia"
                elif weather == 'Clear':
                    condition = "Despejado"
                elif weather == 'Clouds':
                    condition = "Nublado"
                elif weather in ['Mist', 'Fog']:
                    condition = "Niebla"
                else:
                    condition = "Despejado"
                logger.info(f"Consultado OpenWeather para ({lat}, {lng}): {condition}")
                return condition
            else:
                logger.error(f"Error en OpenWeather API: {data.get('message', 'Desconocido')}")
                return "Despejado"
        except Exception as e:
            logger.error(f"Intento {attempt + 1} fallido en OpenWeather API: {e}")
            time.sleep(2 ** attempt)
    logger.warning("Usando clima por defecto (Despejado) tras fallos en OpenWeather")
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

def select_route_pairs(addresses, current_hour, is_peak_hour):
    all_pairs = [(o, d) for i, o in enumerate(addresses) for j, d in enumerate(addresses) if i != j]
    return random.sample(all_pairs, min(101, len(all_pairs)))  # 101 pares de rutas

def collect_real_data():
    logger.info("Iniciando recolección de datos reales")
    connection = connect_to_db()
    cursor = connection.cursor()
    
    # Contadores de llamadas
    direction_calls = 0
    geocode_calls = 0
    traffic_calls = 0
    accidents_calls = 0
    
    # Geocodificar direcciones
    address_coords = {}
    arroyo_coords = {}
    for address in ADDRESSES:
        lat, lng = geocode_address(address, connection)
        if lat is not None and lng is not None:
            address_coords[address] = (lat, lng)
        else:
            logger.warning(f"Saltando dirección no geocodificada: {address}")
        geocode_calls += 1 if not cursor._executed or 'SELECT' not in cursor._executed.decode() else 0
    
    for arroyo_address in ARROYO_ADDRESSES:
        lat, lng = geocode_address(arroyo_address, connection)
        if lat is not None and lng is not None:
            arroyo_coords[arroyo_address] = (lat, lng)
        else:
            logger.warning(f"Saltando arroyo no geocodificado: {arroyo_address}")
        geocode_calls += 1 if not cursor._executed or 'SELECT' not in cursor._executed.decode() else 0
    
    if not address_coords:
        logger.error("No se geocodificaron direcciones válidas. Abortando.")
        cursor.close()
        connection.close()
        return
    
    # Determinar si es hora pico
    current_time = datetime.now()
    current_hour = current_time.hour
    is_peak_hour = current_hour in [7, 8, 17, 18, 19]
    
    # Seleccionar pares de rutas
    route_pairs = select_route_pairs(list(address_coords.keys()), current_hour, is_peak_hour)
    logger.info(f"Procesando {len(route_pairs)} pares de rutas (hora pico: {is_peak_hour})")
    
    # Preparar datos para inserción
    data_to_insert = []
    day_of_week = current_time.strftime('%A')
    is_holiday = 1 if current_time.strftime("%Y-%m-%d") in HOLIDAYS_2025 else 0
    hour_of_day = current_hour
    
    # Obtener clima (Barranquilla) una sola vez por ejecución
    central_lat, central_lng = 10.9878, -74.7889
    weather_condition = get_openweather_condition(central_lat, central_lng)
    
    routes_processed = 0
    for origin, destination in route_pairs:
        logger.info(f"Procesando ruta {routes_processed + 1}/{len(route_pairs)}: {origin} -> {destination}")
        origin_coords = address_coords[origin]
        dest_coords = address_coords[destination]
        
        # Obtener datos de Google Maps
        travel_time, distance, directions_data, direction_calls = get_google_directions(origin, destination, connection, direction_calls, is_peak_hour)
        
        # Consultar tráfico y velocidad en la dirección de destino
        traffic_level, current_speed, traffic_calls = get_tomtom_traffic(dest_coords[0], dest_coords[1], connection, traffic_calls)
        
        # Consultar accidentes en la dirección de destino
        has_accident, accidents_calls = get_tomtom_accidents(dest_coords[0], dest_coords[1], connection, accidents_calls)
        
        # Verificar impacto de arroyos
        weather_index = 0
        for arroyo_address in arroyo_coords:
            if check_arroyo_in_route(origin_coords, dest_coords, arroyo_coords[arroyo_address], weather_condition):
                weather_index = 1
                break
        
        # Agregar a la lista para inserción
        data_to_insert.append((
            origin, destination,
            float(origin_coords[0]), float(origin_coords[1]),
            float(dest_coords[0]), float(dest_coords[1]),
            float(travel_time), float(distance),
            float(traffic_level), current_speed,
            day_of_week, is_holiday,
            weather_condition, hour_of_day, weather_index,
            has_accident,
            current_time.strftime('%Y-%m-%d %H:%M:%S')
        ))
        routes_processed += 1
        logger.info(f"Completada ruta: {origin} -> {destination}, travel_time={travel_time}, distance={distance}, traffic_level={traffic_level}, current_speed={current_speed}, has_accident={has_accident}")
        time.sleep(0.2)  # Retardo para evitar límites de QPS
    
    # Insertar en historical_data_real
    if data_to_insert:
        batch_size = 1000
        for i in range(0, len(data_to_insert), batch_size):
            batch = data_to_insert[i:i + batch_size]
            query = """
                INSERT INTO historical_data_real (
                    origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
                    travel_time, distance_meters, traffic_level, current_speed,
                    day_of_week, is_holiday, weather_condition, hour_of_day, weather_index,
                    has_accident, timestamp
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            try:
                cursor.executemany(query, batch)
                connection.commit()
                logger.info(f"Insertados {len(batch)} registros en historical_data_real")
            except Error as e:
                logger.error(f"Error al insertar en historical_data_real: {e}")
                connection.rollback()
    
    logger.info(f"Total de rutas procesadas: {routes_processed}")
    logger.info(f"Total de llamadas a Google Directions: {direction_calls}")
    logger.info(f"Total de llamadas a Google Geocoding: {geocode_calls}")
    logger.info(f"Total de llamadas a TomTom Traffic: {traffic_calls}")
    logger.info(f"Total de llamadas a TomTom Incidents: {accidents_calls}")
    cursor.close()
    connection.close()
    logger.info("Conexión a MySQL cerrada")

if __name__ == "__main__":
    try:
        collect_real_data()
    except Exception as e:
        logger.error(f"Error general en la recolección: {e}")