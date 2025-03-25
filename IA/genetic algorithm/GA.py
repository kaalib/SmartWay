import requests
import random
import numpy as np
from dotenv import load_dotenv
import os
from pathlib import Path

#APIKEY
dotenv_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=dotenv_path)
API_KEY = os.getenv("api_key2")

# Función para obtener la distancia y tráfico entre dos direcciones
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

# Direcciones
ORIGIN = "universidad del norte, Barranquilla, Colombia"
DESTINATION = "universidad del norte, Barranquilla, Colombia"
DESTINOS = [
    "calle 71 #68-30, Barranquilla, Colombia",
    "cra 26b #74b-52, Barranquilla, Colombia",
    "calle 54 #55-127, Barranquilla, Colombia",
]

# Crear matrices de distancia y tráfico
ALL_LOCATIONS = [ORIGIN] + DESTINOS + [DESTINATION]
DISTANCE_MATRIX = {}
TRAFFIC_MATRIX = {}

for i in range(len(ALL_LOCATIONS)):
    for j in range(len(ALL_LOCATIONS)):
        if i != j:
            distance, duration = get_route_data(ALL_LOCATIONS[i], ALL_LOCATIONS[j])
            DISTANCE_MATRIX[(ALL_LOCATIONS[i], ALL_LOCATIONS[j])] = distance
            TRAFFIC_MATRIX[(ALL_LOCATIONS[i], ALL_LOCATIONS[j])] = duration

# Parámetros del Algoritmo Genético
POPULATION_SIZE = 50
GENERATIONS = 100
MUTATION_RATE = 0.2

# Función de aptitud para distancia
def fitness_distance(route):
    total_distance = 0
    for i in range(len(route) - 1):
        key = (route[i], route[i + 1])
        if key not in DISTANCE_MATRIX:
            print(f"⚠️ Falta distancia entre: {key}")  # Debug para ver qué dirección falta
            return float("inf")  # Para evitar que falle si falta algún dato
        total_distance += DISTANCE_MATRIX[key]
    return total_distance



# Función de aptitud para tráfico
def fitness_traffic(route):
    return sum(TRAFFIC_MATRIX[(route[i], route[i + 1])] for i in range(len(route) - 1))

# Inicializar población
def initialize_population():
    population = []
    for _ in range(POPULATION_SIZE):
        shuffled = random.sample(DESTINOS, len(DESTINOS))
        route = [ORIGIN] + shuffled + [DESTINATION]
        population.append(route)
    return population

# Selección por torneo
def selection(population, fitness_func):
    return min(random.sample(population, k=5), key=fitness_func)

# Cruce
def crossover(parent1, parent2):
    cut1, cut2 = sorted(random.sample(range(1, len(parent1) - 1), 2))
    child = parent1[:cut1] + [x for x in parent2 if x not in parent1[:cut1]]
    
    # Asegurar que el último nodo sea el DESTINATION
    if child[-1] != DESTINATION:
        child.append(DESTINATION)
    
    return child


# Mutación
def mutate(route):
    if random.random() < MUTATION_RATE:
        i, j = random.sample(range(1, len(route) - 1), 2)
        route[i], route[j] = route[j], route[i]
    return route

# Algoritmo Genético
def genetic_algorithm(fitness_func):
    population = initialize_population()
    for _ in range(GENERATIONS):
        new_population = []
        for _ in range(POPULATION_SIZE // 2):
            parent1 = selection(population, fitness_func)
            parent2 = selection(population, fitness_func)
            child1 = mutate(crossover(parent1, parent2))
            child2 = mutate(crossover(parent2, parent1))
            new_population.extend([child1, child2])
        population = sorted(new_population, key=fitness_func)[:POPULATION_SIZE]
    return min(population, key=fitness_func)

# Ejecutar el algoritmo
def main():
    best_route_distance = genetic_algorithm(fitness_distance)
    best_route_traffic = genetic_algorithm(fitness_traffic)

    
    print("\nMejor ruta por distancia:")
    for place in best_route_distance:
        print(place)
    print(f"\nDistancia total: {fitness_distance(best_route_distance) / 1000:.2f} km")
    
    print("\nMejor ruta por tráfico:")
    for place in best_route_traffic:
        print(place)
    print(f"\nTiempo total estimado: {fitness_traffic(best_route_traffic) / 60:.2f} min")

if __name__ == "__main__":
    main()
