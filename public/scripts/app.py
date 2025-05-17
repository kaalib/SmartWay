from flask import Flask, request, jsonify
from flask_socketio import SocketIO
import requests
import random
import numpy as np
from dotenv import load_dotenv
import os
from pathlib import Path

# Cargar variables de entorno
dotenv_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=dotenv_path)
API_KEY = os.getenv("api_key2")

if API_KEY:
    print("✅ API Key cargada correctamente")
else:
    print("⚠️ ERROR: No se pudo cargar la API Key")

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

rutasIA = {}  # Almacena las rutas globalmente como objeto

# Función para obtener distancia y tráfico entre dos direcciones
def get_route_data(origin, destination):
    # Validar que las direcciones no estén vacías
    if not origin or not destination:
        print(f"⚠️ Dirección inválida detectada: origin='{origin}', destination='{destination}'")
        return float("inf"), float("inf")

    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"
    }

    # Detectar si el origen/destino es coordenadas ("lat,lng") o texto
    def parse_location(loc):
        if isinstance(loc, str) and ',' in loc:
            try:
                lat, lng = map(float, loc.split(','))
                return {"location": {"latLng": {"latitude": lat, "longitude": lng}}}
            except ValueError:
                print(f"⚠️ Error parseando coordenadas: {loc}")
                return None
        return {"address": loc}

    origin_parsed = parse_location(origin)
    destination_parsed = parse_location(destination)

    # Si alguna ubicación no se pudo parsear, retornar infinito
    if origin_parsed is None or destination_parsed is None:
        print(f"⚠️ No se pudo parsear una ubicación: origin={origin}, destination={destination}")
        return float("inf"), float("inf")

    body = {
        "origin": origin_parsed,
        "destination": destination_parsed,
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE"
    }

    try:
        response = requests.post(url, json=body, headers=headers)
        if response.status_code == 200:
            json_response = response.json()
            if "routes" in json_response and json_response["routes"]:
                distance = json_response["routes"][0].get("distanceMeters", float("inf"))
                duration_str = json_response["routes"][0].get("duration", "0s")
                duration = int("".join(filter(str.isdigit, duration_str)))
                print(f"📏 Distancia entre {origin} y {destination}: {distance}m, Duración: {duration}s")
                return distance, duration
            else:
                print(f"⚠️ No se encontraron rutas entre {origin} y {destination}: {json_response}")
        else:
            print(f"⚠️ Error en la solicitud a la API de Google Routes: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"⚠️ Excepción al obtener datos de la ruta entre {origin} y {destination}: {str(e)}")

    return float("inf"), float("inf")

# Algoritmo genético para optimizar la ruta
POPULATION_SIZE = 50
GENERATIONS = 100
MUTATION_RATE = 0.2

def fitness_distance(route, distance_matrix):
    total_distance = 0
    for i in range(len(route) - 1):
        dist = distance_matrix.get((route[i], route[i + 1]), float("inf"))
        total_distance += dist
        if dist == float("inf"):
            print(f"⚠️ Distancia infinita detectada entre {route[i]} y {route[i + 1]}")
    return total_distance

def fitness_traffic(route, traffic_matrix):
    total_time = 0
    for i in range(len(route) - 1):
        time = traffic_matrix.get((route[i], route[i + 1]), float("inf"))
        total_time += time
        if time == float("inf"):
            print(f"⚠️ Tiempo infinito detectado entre {route[i]} y {route[i + 1]}")
    return total_time

def initialize_population(destinos, origin, destination):
    population = []
    for _ in range(POPULATION_SIZE):
        shuffled = random.sample(destinos, len(destinos))
        route = [origin] + shuffled + [destination]
        population.append(route)
    return population

def selection(population, fitness_func, matrix):
    return min(random.sample(population, k=5), key=lambda x: fitness_func(x, matrix))

def crossover(parent1, parent2, destination):
    cut1, cut2 = sorted(random.sample(range(1, len(parent1) - 1), 2))
    child = parent1[:cut1] + [x for x in parent2 if x not in parent1[:cut1]]
    if child[-1] != destination:
        child.append(destination)
    return child

def mutate(route):
    if random.random() < MUTATION_RATE:
        i, j = random.sample(range(1, len(route) - 1), 2)
        route[i], route[j] = route[j], route[i]
    return route

def genetic_algorithm(destinos, origin, destination, distance_matrix, traffic_matrix, fitness_func):
    population = initialize_population(destinos, origin, destination)
    for _ in range(GENERATIONS):
        new_population = []
        for _ in range(POPULATION_SIZE // 2):
            parent1 = selection(population, fitness_func, distance_matrix if fitness_func == fitness_distance else traffic_matrix)
            parent2 = selection(population, fitness_func, distance_matrix if fitness_func == fitness_distance else traffic_matrix)
            child1 = mutate(crossover(parent1, parent2, destination))
            child2 = mutate(crossover(parent2, parent1, destination))
            new_population.extend([child1, child2])
        population = sorted(new_population, key=lambda x: fitness_func(x, distance_matrix if fitness_func == fitness_distance else traffic_matrix))[:POPULATION_SIZE]
    best_route = min(population, key=lambda x: fitness_func(x, distance_matrix if fitness_func == fitness_distance else traffic_matrix))
    return best_route

@app.route('/api/process', methods=['POST'])
def process_message():
    global rutasIA
    try:
        data = request.get_json()
        print(f"📥 Datos recibidos: {data}")
        direcciones = data.get("direcciones", [])
        if not direcciones or len(direcciones) < 2:
            return jsonify({"status": "error", "message": "Lista de direcciones insuficiente"}), 400

        # Normalizar direcciones y filtrar vacías o inválidas
        def normalize_direccion(d):
            if isinstance(d, dict) and "lat" in d and "lng" in d:
                return f"{d['lat']},{d['lng']}"
            return str(d)  # Convertir todo a string para consistencia

        direcciones = [normalize_direccion(d) for d in direcciones if d and str(d).strip()]  # Filtrar vacíos
        if len(direcciones) < 2:
            return jsonify({"status": "error", "message": "No hay suficientes direcciones válidas después de filtrar"}), 400

        origin = direcciones[0]  # Posición del bus
        destination = direcciones[-1]  # Punto final
        destinos = direcciones[1:-1]  # Paradas intermedias

        print(f"📍 Direcciones normalizadas y filtradas: {direcciones}")

        # Construir matrices de distancia y tráfico
        distance_matrix = {}
        traffic_matrix = {}
        for i in range(len(direcciones)):
            for j in range(len(direcciones)):
                if i != j:
                    distance, duration = get_route_data(direcciones[i], direcciones[j])
                    distance_matrix[(direcciones[i], direcciones[j])] = distance
                    traffic_matrix[(direcciones[i], direcciones[j])] = duration

        # Depurar matrices
        print(f"📏 Distance Matrix: {distance_matrix}")
        print(f"⏱️ Traffic Matrix: {traffic_matrix}")

        # Calcular las mejores rutas
        best_route_distance = genetic_algorithm(destinos, origin, destination, distance_matrix, traffic_matrix, fitness_distance)
        best_route_traffic = genetic_algorithm(destinos, origin, destination, distance_matrix, traffic_matrix, fitness_traffic)

        # Calcular métricas finales
        total_distance_km = fitness_distance(best_route_distance, distance_matrix) / 1000
        total_time_min = fitness_traffic(best_route_traffic, traffic_matrix) / 60

        # Validar si las métricas son infinitas
        if total_distance_km == float("inf") or total_time_min == float("inf"):
            print("❌ Error: No se pudo calcular una ruta válida. Posiblemente una dirección no es válida o no hay ruta disponible.")
            return jsonify({"status": "error", "message": "No se pudo calcular una ruta válida. Revisa las direcciones proporcionadas."}), 400

        rutasIA = {
            "mejor_ruta_distancia": best_route_distance,
            "distancia_total_km": total_distance_km,
            "mejor_ruta_trafico": best_route_traffic,
            "tiempo_total_min": total_time_min
        }

        print(f"✅ Rutas calculadas: {rutasIA}")
        socketio.emit("actualizar_rutas", {"rutasIA": rutasIA})
        return jsonify({"status": "success", "rutasIA": rutasIA}), 200

    except Exception as e:
        print(f"❌ Error en /api/process: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)