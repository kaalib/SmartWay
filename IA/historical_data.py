import requests
import json
import os
from datetime import datetime, timedelta
import time
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import Error
import logging

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('data_collection.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Cargar variables de entorno
env_path = os.path.join(os.getcwd(), ".env")
if not os.path.exists(env_path):
    logger.error(f"No se encontró APIs.env en {env_path}")
    raise FileNotFoundError(f"No se encontró APIs.env en {env_path}")
load_dotenv(".env")

MYSQL_HOST = os.getenv('db_host')
MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))
MYSQL_USER = os.getenv('db_user')
MYSQL_PASSWORD = os.getenv('db_password')
MYSQL_DATABASE = os.getenv('db_name')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
TOMTOM_API_KEY = os.getenv('TOMTOM_API_KEY')
OPENWEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')

# Lista completa de direcciones (máximo 40)
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
    "Carrera 13 #63B-42, Barranquilla, Atlántico",
    "Carrera 67 #76-122, Barranquilla, Atlántico",
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
    "Carrera 29 #35-50, Soledad, Atlántico",
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

def get_google_directions(origin, destination, connection):
    cursor = connection.cursor()
    query = """
        SELECT travel_time, distance_meters, response_json
        FROM api_cache
        WHERE origin = %s AND destination = %s AND api_type = 'google_directions'
        AND timestamp > NOW() - INTERVAL 1 HOUR
    """
    cursor.execute(query, (origin, destination))
    result = cursor.fetchone()
    
    if result:
        logger.info(f"Usando caché para Directions: {origin} -> {destination}")
        cursor.close()
        return result[0], result[1], json.loads(result[2])
    
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
            data = response.json()
            if response.status_code == 200 and data['status'] == 'OK':
                route = data['routes'][0]['legs'][0]
                travel_time = route['duration_in_traffic']['value'] / 60.0
                distance = route['distance']['value']
                cursor.execute("""
                    INSERT INTO api_cache (origin, destination, api_type, travel_time, distance_meters, timestamp, response_json)
                    VALUES (%s, %s, %s, %s, %s, NOW(), %s)
                """, (origin, destination, 'google_directions', travel_time, distance, json.dumps(data)))
                connection.commit()
                logger.info(f"Guardado en api_cache para: {origin} -> {destination}")
                cursor.close()
                return travel_time, distance, data
            else:
                logger.error(f"Error en Directions API: {data.get('status', 'Desconocido')}")
                return None, None, None
        except Exception as e:
            logger.error(f"Intento {attempt + 1} fallido en Directions API: {e}")
            time.sleep(2 ** attempt)
    logger.error(f"No se pudo obtener Directions para {origin} -> {destination}")
    cursor.close()
    return None, None, None

def get_tomtom_traffic(lat, lng):
    url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
    params = {
        'point': f"{lat},{lng}",
        'key': TOMTOM_API_KEY
    }
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            if response.status_code == 200:
                current_speed = data['flowSegmentData']['currentSpeed']
                free_flow_speed = data['flowSegmentData']['freeFlowSpeed']
                traffic_level = 1 - (current_speed / free_flow_speed)
                return min(max(traffic_level, 0), 1)
            else:
                logger.error(f"Error en TomTom API: {data.get('error', 'Desconocido')}")
                return 0.5
        except Exception as e:
            logger.error(f"Intento {attempt + 1} fallido en TomTom API: {e}")
            time.sleep(2 ** attempt)
    logger.warning("Usando tráfico por defecto (0.5) tras fallos en TomTom")
    return 0.5

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
                    return "Lluvia"
                elif weather == 'Clear':
                    return "Despejado"
                elif weather == 'Clouds':
                    return "Nublado"
                elif weather in ['Mist', 'Fog']:
                    return "Niebla"
                else:
                    return "Despejado"
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

def collect_real_data():
    logger.info("Iniciando recolección de datos reales")
    connection = connect_to_db()
    cursor = connection.cursor()
    
    # Geocodificar direcciones
    address_coords = {}
    arroyo_coords = {}
    for address in ADDRESSES:
        lat, lng = geocode_address(address, connection)
        if lat is not None and lng is not None:
            address_coords[address] = (lat, lng)
        else:
            logger.warning(f"Saltando dirección no geocodificada: {address}")
    
    for arroyo_address in ARROYO_ADDRESSES:
        lat, lng = geocode_address(arroyo_address, connection)
        if lat is not None and lng is not None:
            arroyo_coords[arroyo_address] = (lat, lng)
        else:
            logger.warning(f"Saltando arroyo no geocodificado: {arroyo_address}")
    
    if not address_coords:
        logger.error("No se geocodificaron direcciones válidas. Abortando.")
        cursor.close()
        connection.close()
        return
    
    # Preparar datos para inserción
    data_to_insert = []
    current_time = datetime.now()
    day_of_week = current_time.strftime('%A')
    is_holiday = 1 if current_time.strftime("%Y-%m-%d") in HOLIDAYS_2025 else 0
    hour_of_day = current_time.hour
    
    # Obtener clima (Barranquilla)
    central_lat, central_lng = 10.9878, -74.7889
    weather_condition = get_openweather_condition(central_lat, central_lng)
    
    for i, origin in enumerate(address_coords.keys()):
        for j, destination in enumerate(address_coords.keys()):
            if i != j:
                origin_coords = address_coords[origin]
                dest_coords = address_coords[destination]
                
                # Obtener datos de Google Maps
                travel_time, distance, directions_data = get_google_directions(origin, destination, connection)
                if travel_time is None:
                    logger.warning(f"Saltando ruta {origin} -> {destination} por fallo en Directions")
                    continue
                
                # Obtener tráfico de TomTom
                traffic_level = get_tomtom_traffic(origin_coords[0], origin_coords[1])
                
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
                    float(traffic_level), day_of_week, is_holiday,
                    weather_condition, hour_of_day, weather_index,
                    current_time.strftime('%Y-%m-%d %H:%M:%S')
                ))
                logger.info(f"Preparada ruta: {origin} -> {destination}")
                time.sleep(0.1)  # Evitar límites de API
    
    # Insertar en historical_data_real
    if data_to_insert:
        batch_size = 1000
        for i in range(0, len(data_to_insert), batch_size):
            batch = data_to_insert[i:i + batch_size]
            query = """
                INSERT INTO historical_data_real (
                    origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
                    travel_time, distance_meters, traffic_level, day_of_week, is_holiday,
                    weather_condition, hour_of_day, weather_index, timestamp
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            try:
                cursor.executemany(query, batch)
                connection.commit()
                logger.info(f"Insertados {len(batch)} registros en historical_data_real")
            except Error as e:
                logger.error(f"Error al insertar en historical_data_real: {e}")
                connection.rollback()
    
    cursor.close()
    connection.close()
    logger.info("Conexión a MySQL cerrada")

if __name__ == "__main__":
    try:
        collect_real_data()
    except Exception as e:
        logger.error(f"Error general en la recolección: {e}")