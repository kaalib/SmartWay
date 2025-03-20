import requests
import random
import numpy as np
import os

# Tu clave de API de Google Maps
API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
print(API_KEY) 

# Función para obtener la distancia entre dos direcciones usando Google Maps
def get_distance(origin, destination):
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters"
    }
    body = {
        "origin": {"address": origin},
        "destination": {"address": destination}
    }
    response = requests.post(url, json=body, headers=headers)
    
    if response.status_code == 200:
        json_response = response.json()
        print(json_response)  # Para ver la respuesta de la API en consola
        if "routes" in json_response and json_response["routes"]:
            return json_response["routes"][0].get("distanceMeters", float("inf"))
    
    print(f"Error obteniendo distancia: {response.text}")
    return float("inf")

# Direcciones
ORIGIN = "universidad del norte, Barranquilla, Colombia"
DESTINATION = "universidad del norte, Barranquilla, Colombia"
DESTINOS = [
    "calle 71 #68-30, Barranquilla, Colombia",
    "cra 26b #74b-52, Barranquilla, Colombia",
    "calle 54 #55-127, Barranquilla, Colombia",
]

# Lista completa de ubicaciones
ALL_LOCATIONS = [ORIGIN] + DESTINOS + [DESTINATION]

# Crear la matriz de distancias
DISTANCE_MATRIX = {
    (ALL_LOCATIONS[i], ALL_LOCATIONS[j]): get_distance(ALL_LOCATIONS[i], ALL_LOCATIONS[j])
    for i in range(len(ALL_LOCATIONS)) for j in range(len(ALL_LOCATIONS)) if i != j
}

# Parámetros del Algoritmo Genético
POPULATION_SIZE = 50
GENERATIONS = 300
MUTATION_RATE = 0.2

# Función para calcular la distancia total de una ruta (incluye regreso al DESTINATION)
def fitness(route):
    distance = 0
    for i in range(len(route) - 1):
        distance += DISTANCE_MATRIX[(route[i], route[i + 1])]
    
    # Asegurar que la distancia final incluye el regreso al DESTINATION
    if route[-1] != DESTINATION:
        distance += DISTANCE_MATRIX[(route[-1], DESTINATION)]
    
    return distance

# Generar población inicial
def initialize_population():
    population = []
    for _ in range(POPULATION_SIZE):
        random_route = [ORIGIN] + random.sample(DESTINOS, len(DESTINOS))  # NO agregamos DESTINATION aquí
        population.append(random_route)
    return population

# Selección por torneo
def selection(population):
    return min(random.sample(population, k=5), key=fitness)

# Cruce (Crossover)
def crossover(parent1, parent2):
    cut1, cut2 = sorted(random.sample(range(1, len(parent1)), 2))
    child = parent1[:cut1] + [x for x in parent2 if x not in parent1[:cut1]]
    return child

# Mutación
def mutate(route):
    if random.random() < MUTATION_RATE:
        i, j = random.sample(range(1, len(route) - 1), 2)
        route[i], route[j] = route[j], route[i]
    return route

# Algoritmo Genético
def genetic_algorithm():
    population = initialize_population()
    for _ in range(GENERATIONS):
        new_population = []
        for _ in range(POPULATION_SIZE // 2):
            parent1 = selection(population)
            parent2 = selection(population)
            child1 = mutate(crossover(parent1, parent2))
            child2 = mutate(crossover(parent2, parent1))
            new_population.extend([child1, child2])
        population = sorted(new_population, key=fitness)[:POPULATION_SIZE]
    
    best_route = min(population, key=fitness)
    
    # Asegurar que la mejor ruta encontrada termine en DESTINATION
    if best_route[-1] != DESTINATION:
        best_route.append(DESTINATION)

    return best_route, fitness(best_route)

# Ejecutar el algoritmo
def main():
    best_route, best_distance = genetic_algorithm()
    print("\nMejor ruta encontrada:")
    for place in best_route:
        print(place)
    print(f"\nDistancia total: {best_distance / 1000:.2f} km")

if __name__ == "__main__":
    main()
