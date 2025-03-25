from flask import Flask, request, jsonify
from flask_socketio import SocketIO
import requests
import random
import numpy as np
from dotenv import load_dotenv
import os
from pathlib import Path

# Cargar variables de entorno
dotenv_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=dotenv_path)
API_KEY = os.getenv("api_key2")

if API_KEY:
    print("✅ API Key cargada correctamente")
else:
    print("⚠️ ERROR: No se pudo cargar la API Key")
    
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

rutasIA = []  # Almacena las rutas globalmente

# Función para obtener distancia y tráfico entre dos direcciones
def get_route_data(origin, destination):
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"
    }
    body = {
        "origin": {"address": origin},
        "destination": {"address": destination},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE"
    }
    response = requests.post(url, json=body, headers=headers)
    
    if response.status_code == 200:
        json_response = response.json()
        if "routes" in json_response and json_response["routes"]:
            distance = json_response["routes"][0].get("distanceMeters", float("inf"))
            duration_str = json_response["routes"][0].get("duration", "0s")
            duration = int("".join(filter(str.isdigit, duration_str)))
            return distance, duration
    
    return float("inf"), float("inf")

# Algoritmo genético para optimizar la ruta
POPULATION_SIZE = 50
GENERATIONS = 100
MUTATION_RATE = 0.2

def fitness_distance(route, distance_matrix):
    return sum(distance_matrix.get((route[i], route[i + 1]), float("inf")) for i in range(len(route) - 1))

def fitness_traffic(route, traffic_matrix):
    return sum(traffic_matrix.get((route[i], route[i + 1]), float("inf")) for i in range(len(route) - 1))

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
    return min(population, key=lambda x: fitness_func(x, distance_matrix if fitness_func == fitness_distance else traffic_matrix))

@app.route('/api/process', methods=['POST'])
def process_message():
    global rutasIA
    try:
        data = request.get_json()
        direcciones = data.get("direcciones", [])
        if not direcciones:
            return jsonify({"status": "error", "message": "Lista de direcciones vacía"}), 400
        
        origin = direcciones[0]
        destination = direcciones[0]
        destinos = direcciones[1:]

        distance_matrix = {}
        traffic_matrix = {}
        for i in range(len(direcciones)):
            for j in range(len(direcciones)):
                if i != j:
                    distance, duration = get_route_data(direcciones[i], direcciones[j])
                    distance_matrix[(direcciones[i], direcciones[j])] = distance
                    traffic_matrix[(direcciones[i], direcciones[j])] = duration

        best_route_distance = genetic_algorithm(destinos, origin, destination, distance_matrix, traffic_matrix, fitness_distance)
        best_route_traffic = genetic_algorithm(destinos, origin, destination, distance_matrix, traffic_matrix, fitness_traffic)

        rutasIA = {
            "mejor_ruta_distancia": best_route_distance,
            "distancia_total_km": fitness_distance(best_route_distance, distance_matrix) / 1000,
            "mejor_ruta_trafico": best_route_traffic,
            "tiempo_total_min": fitness_traffic(best_route_traffic, traffic_matrix) / 60
        }

        socketio.emit("actualizar_rutas", {"rutasIA": rutasIA})
        return jsonify({"status": "success", "rutasIA": rutasIA}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
