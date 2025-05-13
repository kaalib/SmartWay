import requests
import json
import os
from datetime import datetime
import time
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import Error
import logging
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
OPENWEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')

# Lista de direcciones (40 direcciones)
ADDRESSES = [
    "Cra. 54 #55-127, Barranquilla, Atlántico",
    "Cra. 41 #57-18, Barranquilla, Atlántico",
    "Cl. 45D #17-12, Barranquilla, Atlántico",
    "Cra. 21 #68-56, Soledad, Atlántico",
    "Cl. 50 #33-22, Barranquilla, Atlántico",
    "Cl. 90 #44-12, Barranquilla, Atlántico",
    "Cl. 38 #29-76, Barranquilla, Atlántico",
    "Cra. 10 #22-40, Soledad, Atlántico",
    "Cra. 32 #26-95, Soledad, Atlántico",
    "Cl. 81 #19A-28, Soledad, Atlántico",
    "Cl. 32 #7D-66, Barranquilla, Atlántico",
    "Cra. 13 #63B-42, Barranquilla, Atlántico",
    "Cra. 67 #76-122, Barranquilla, Atlántico",
    "Cl. 70 #38-15, Barranquilla, Atlántico",
    "Cl. 22 #25-30, Barranquilla, Atlántico",
    "Cl. 45 #23-55, Barranquilla, Atlántico",
    "Cl. 85 #53-25, Barranquilla, Atlántico",
    "Cra. 17 #80-10, Soledad, Atlántico",
    "Cra. 51B #135-01, Barranquilla, Atlántico",
    "Cl. 58 #45-30, Barranquilla, Atlántico",
    "Cra. 26B #74B-52, Barranquilla, Atlántico",
    "Cl. 76 #46-20, Barranquilla, Atlántico",
    "Cra. 38 #48-22, Barranquilla, Atlántico",
    "Cl. 84 #42F-15, Barranquilla, Atlántico",
    "Cra. 14 #54-25, Soledad, Atlántico",
    "Cl. 63 #23-40, Barranquilla, Atlántico",
    "Cra. 49C #76-120, Barranquilla, Atlántico",
    "Cl. 93 #49C-130, Barranquilla, Atlántico",
    "Carrera 53 #68-70, Barranquilla, Atlántico",
    "Cl. 47 #20-50, Barranquilla, Atlántico",
    "Cra. 53 #75-90, Barranquilla, Atlántico",
    "Carrera 18 #76D-10, Soledad, Atlántico",
    "Cra. 65 #84-60, Barranquilla, Atlántico",
    "Cl. 55 #27-35, Barranquilla, Atlántico",
    "Cra. 24 #60-15, Barranquilla, Atlántico",
    "Carrera 29 #35-50, Soledad, Atlántico",
    "Cra. 46 #82-106, Barranquilla, Atlántico",
    "Cl. 18 #10-20, Soledad, Atlántico",
    "Cra. 59 #70-45, Barranquilla, Atlántico",
    "Cl. 64 #50-25, Barranquilla, Atlántico"
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
            database=MYSQL_DATABASE,
            auth_plugin='mysql_native_password',
            connect_timeout=5
        )
        if connection.is_connected():
            db_info = connection.server_info
            logger.info(f"Conectado a MySQL Server versión {db_info}")
            return connection
    except Error as e:
        logger.error(f"Error al conectar a MySQL: {e}")
        raise

def geocode_address(address, connection):
    cursor = connection.cursor()
    try:
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
            return data['results'][0]['geometry']['location']['lat'], data['results'][0]['geometry']['location']['lng']
        
        logger.info(f"Consultando Geocoding API para: {address}")
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {'address': address, 'key': GOOGLE_API_KEY}
        
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
            return lat, lng
        else:
            logger.error(f"Error en Geocoding API para {address}: {data.get('status', 'Desconocido')}")
            return None, None
    except Exception as e:
        logger.error(f"Error al geocodificar {address}: {e}")
        return None, None
    finally:
        cursor.close()

def get_tomtom_traffic_data(origin, destination, distance_meters, connection):
    """Obtiene tiempos de viaje con y sin tráfico usando TomTom Routing API."""
    #logger.info(f"Consultando TomTom Routing API para tráfico de {origin} a {destination}")
    
    # Obtener coordenadas desde la caché o Google Geocoding
    origin_lat, origin_lng = geocode_address(origin, connection)
    dest_lat, dest_lng = geocode_address(destination, connection)
    
    if not origin_lat or not origin_lng or not dest_lat or not dest_lng:
        logger.warning(f"No se pudieron geocodificar las direcciones para TomTom: {origin} a {destination}")
        return None, None, None
    
    origin_coords = f"{origin_lat},{origin_lng}"
    dest_coords = f"{dest_lat},{dest_lng}"
    
    # Llamar a Routing API con tráfico
    url = f"https://api.tomtom.com/routing/1/calculateRoute/{origin_coords}:{dest_coords}/json"
    params = {
        "key": TOMTOM_API_KEY,
        "travelMode": "car",
        "traffic": "true",
        "computeTravelTimeFor": "all"
    }
    
    try:
        response = requests.get(url, params=params, timeout=15)
        data = response.json()
        if response.status_code == 200 and "routes" in data and data["routes"]:
            route = data["routes"][0]
            summary = route["summary"]
            live_traffic_time = summary.get("liveTrafficIncidentsTravelTime", summary["travelTimeInSeconds"])
            no_traffic_time = summary.get("noTrafficTravelTimeInSeconds", live_traffic_time)
            # Calcular velocidad actual (km/h) usando la distancia de Google Routes
            current_speed = (distance_meters / 1000) / (live_traffic_time / 3600) if live_traffic_time > 0 else None
            return live_traffic_time, no_traffic_time, current_speed
        else:
            logger.error(f"Error en TomTom Routing API: {data.get('error', 'Unknown error')}")
            return None, None, None
    except Exception as e:
        logger.error(f"Error en TomTom Routing API: {e}")
        return None, None, None

def get_route_data(origin, destination, connection):
    """Usa Google Routes API estándar para obtener distancia y duración con tráfico."""
    logger.info(f"Consultando Google Routes API para {origin} a {destination}")
    
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
    }
    
    body = {
        "origin": {"address": origin},
        "destination": {"address": destination},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": False,
        "units": "METRIC",
        "languageCode": "es"
    }
    
    try:
        response = requests.post(url, headers=headers, json=body, timeout=15)
        data = response.json()
        if response.status_code == 200 and "routes" in data and data["routes"]:
            # Guardar en caché
            cursor = connection.cursor()
            cursor.execute("""
                INSERT INTO api_cache (api_type, origin, destination, timestamp, response_json)
                VALUES (%s, %s, %s, NOW(), %s)
            """, ('google_routes', origin, destination, json.dumps(data)))
            connection.commit()
            cursor.close()
            
            return data["routes"][0]
        else:
            logger.error(f"Error en Routes API: {data.get('error', {}).get('message', 'Unknown error')}")
            return None
    except Exception as e:
        logger.error(f"Error en Routes API: {e}")
        return None

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
        logger.error(f"Error en OpenWeather API: {e}")
        return "Despejado"

def check_arroyo_in_route(origin_coords, dest_coords, arroyo_coords, weather_condition):
    """Verifica si un arroyo está cerca de la ruta entre origen y destino durante lluvia."""
    if weather_condition != "Lluvia":
        return False
    
    arroyo_lat, arroyo_lng = arroyo_coords
    if arroyo_lat is None or arroyo_lng is None:
        return False
    
    ox, oy = origin_coords
    dx, dy = dest_coords
    ax, ay = arroyo_lat, arroyo_lng
    
    # Calcular la proyección del arroyo en la línea recta entre origen y destino
    len_sq = (dx - ox) ** 2 + (dy - oy) ** 2
    if len_sq == 0:
        return False
    
    t = max(0, min(1, ((ax - ox) * (dx - ox) + (ay - oy) * (dy - oy)) / len_sq))
    proj_x = ox + t * (dx - ox)
    proj_y = oy + t * (dy - oy)
    
    # Verificar si el arroyo está dentro de 0.005 grados (~550 metros)
    distance = ((ax - proj_x) ** 2 + (ay - proj_y) ** 2) ** 0.5
    return distance < 0.005

def select_route_pairs(addresses):
    """Selecciona 100 pares únicos de direcciones (origen, destino) rotando entre las 40 direcciones,
    evitando repeticiones recientes usando un archivo JSON."""
    pairs_file = 'used_pairs.json'
    
    # Generar todos los pares posibles (excluyendo origen == destino)
    all_possible_pairs = [(i, j) for i in range(len(addresses)) for j in range(len(addresses)) if i != j]
    
    # Leer pares usados recientemente
    try:
        with open(pairs_file, 'r') as f:
            last_used_pairs = set(tuple(pair) for pair in json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        last_used_pairs = set()
    
    # Excluir pares usados recientemente
    available_pairs = [pair for pair in all_possible_pairs if pair not in last_used_pairs]
    
    # Si no hay suficientes pares, reiniciar
    if len(available_pairs) < 70:
        last_used_pairs = set()
        available_pairs = all_possible_pairs
    
    # Seleccionar 50 pares únicos aleatoriamente
    selected_pairs = random.sample(available_pairs, min(70, len(available_pairs)))  #solo genera 50 pares
    
    # Actualizar los pares usados y guardar en el archivo
    last_used_pairs = set(selected_pairs)
    with open(pairs_file, 'w') as f:
        json.dump([[pair[0], pair[1]] for pair in last_used_pairs], f)
    
    # Convertir índices a direcciones
    pairs = [(addresses[pair[0]], addresses[pair[1]]) for pair in selected_pairs]
    
    return pairs

def process_route_data(route, address_coords, arroyo_coords, weather_condition, current_time, origin, destination, connection):
    """Procesa los datos de la ruta para extraer distancia y duración de Google Routes y congestión de TomTom."""
    try:
        # Duración y distancia desde Google Routes
        duration_str = route.get('duration', '0s').replace('s', '')
        distance_meters = route.get('distanceMeters', 0)
        
        travel_time = float(duration_str) / 60  # segundos a minutos
        
        # Obtener datos de tráfico desde TomTom
        live_traffic_time, no_traffic_time, current_speed = get_tomtom_traffic_data(origin, destination, distance_meters, connection)
        
        # Calcular nivel de tráfico (0 a 1) usando la fórmula de TomTom
        if live_traffic_time and no_traffic_time and no_traffic_time > 0:
            congestion_ratio = live_traffic_time / no_traffic_time
            traffic_level = min((congestion_ratio - 1) / 2, 1)
            traffic_level = max(0, traffic_level)  # Asegurar que esté entre 0 y 1
        else:
            traffic_level = 0.5  # Valor por defecto si no hay datos
            current_speed = None
            logger.warning(f"No se pudieron obtener datos de tráfico de TomTom para {origin} a {destination}, usando valor por defecto")

        # Verificar impacto de arroyos
        weather_index = 0
        for arroyo_address in arroyo_coords:
            if check_arroyo_in_route(
                address_coords[origin],
                address_coords[destination],
                arroyo_coords[arroyo_address],
                weather_condition
            ):
                weather_index = 1
                break

        # Preparar datos para inserción
        result = {
            'origin': origin,
            'destination': destination,
            'origin_coords': address_coords[origin],
            'dest_coords': address_coords[destination],
            'travel_time': round(travel_time, 2),
            'distance': round(distance_meters, 2),
            'traffic_level': round(traffic_level, 2),
            'current_speed': round(current_speed, 2) if current_speed else None,
            'day_of_week': current_time.strftime('%A'),
            'is_holiday': 1 if current_time.strftime("%Y-%m-%d") in HOLIDAYS_2025 else 0,
            'weather_condition': weather_condition,
            'hour_of_day': current_time.hour,
            'weather_index': weather_index,
            'timestamp': current_time.strftime('%Y-%m-%d %H:%M:%S')
        }
        return result

    except Exception as e:
        logger.error(f"Error procesando ruta {origin} a {destination}: {str(e)}")
        return None

def collect_real_data():
    """Recolecta datos reales cada hora. Configura límites de cuota en Google Cloud Console
    para evitar exceder el Free Tier ($200/mes)."""
    logger.info("Iniciando recolección de datos reales")
    connection = None
    try:
        connection = connect_to_db()
        
        logger.info("Geocodificando direcciones...")
        address_coords = {}
        for address in ADDRESSES:
            lat, lng = geocode_address(address, connection)
            if lat is not None and lng is not None:
                address_coords[address] = (lat, lng)
            else:
                logger.warning(f"Saltando dirección no geocodificada: {address}")
        
        logger.info("Geocodificando arroyos...")
        arroyo_coords = {}
        for arroyo_address in ARROYO_ADDRESSES:
            lat, lng = geocode_address(arroyo_address, connection)
            if lat is not None and lng is not None:
                arroyo_coords[arroyo_address] = (lat, lng)
            else:
                logger.warning(f"Saltando arroyo no geocodificado: {arroyo_address}")
        
        if not address_coords:
            logger.error("No se geocodificaron direcciones válidas. Abortando.")
            return
        
        current_time = datetime.now()
        weather_condition = get_openweather_condition(10.9878, -74.7889)
        
        pairs = select_route_pairs(ADDRESSES)
        
        route_data = []
        for origin, destination in pairs:
            route = get_route_data(origin, destination, connection)
            if route:
                processed_data = process_route_data(
                    route, address_coords, arroyo_coords, weather_condition, current_time, origin, destination, connection
                )
                if processed_data:
                    route_data.append(processed_data)
            
            time.sleep(0.2)  # Evitar límites de cuota
        
        cursor = connection.cursor()
        for data in route_data:
            try:
                cursor.execute("""
                    INSERT INTO historical_data_real (
                        origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
                        travel_time, distance_meters, traffic_level, current_speed,
                        day_of_week, is_holiday, weather_condition, hour_of_day, weather_index,
                        has_accident, timestamp
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    data['origin'], data['destination'],
                    data['origin_coords'][0], data['origin_coords'][1],
                    data['dest_coords'][0], data['dest_coords'][1],
                    data['travel_time'], data['distance'],
                    data['traffic_level'], data['current_speed'],
                    data['day_of_week'],
                    data['is_holiday'],
                    data['weather_condition'],
                    data['hour_of_day'],
                    data['weather_index'],
                    0,  # has_accident
                    data['timestamp']
                ))
            except Error as e:
                logger.error(f"Error al insertar datos: {e}")
                connection.rollback()
        
        connection.commit()
        
        logger.info(f"Datos insertados correctamente. Total de rutas procesadas: {len(route_data)}")
        
    except Exception as e:
        logger.error(f"Error general en la recolección: {e}")
        if connection:
            connection.rollback()
    finally:
        if connection and connection.is_connected():
            if 'cursor' in locals():
                cursor.close()
            connection.close()
            logger.info("Conexión a MySQL cerrada")

if __name__ == "__main__":
    collect_real_data()