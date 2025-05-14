import numpy as np
import pandas as pd
import mysql.connector
import googlemaps
from datetime import datetime
import matplotlib.pyplot as plt
import json
import os
from dotenv import load_dotenv
import pygad

# Cargar variables de entorno
load_dotenv("APIs.env")
MYSQL_HOST = os.getenv('db_host')
MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))
MYSQL_USER = os.getenv('db_user')
MYSQL_PASSWORD = os.getenv('db_password')
MYSQL_DATABASE = os.getenv('db_name')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')

# Configuración
gmaps = googlemaps.Client(key=GOOGLE_API_KEY)
JSON_FILE = "distance_matrix.json"

# Lista de direcciones (editar manualmente)
ADDRESSES = [
    "Cl. 90 #44-12, Barranquilla, Atlántico",
    "Cl. 38 #29-76, Barranquilla, Atlántico",
    "Cra. 10 #22-40, Soledad, Atlántico",
    "Cra. 32 #26-95, Soledad, Atlántico",
    "Cl. 32 #7D-66, Barranquilla, Atlántico",
    "Cra. 21 #68-56, Soledad, Atlántico",
    "Cra. 49C #76-120, Barranquilla, Atlántico",
    "Cl. 93 #49D-30, Barranquilla, Atlántico",
    "Cra. 8 #45-10, Barranquilla, Atlántico",
    "Cra. 10 #22-40, Soledad, Atlántico"
]

# Conexión a MySQL
def get_db_connection():
    return mysql.connector.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE
    )

# Obtener distancia de historical_data_real con filtro de hora
def get_distance_from_historical(origin, destination, cursor):
    current_time = datetime.now()
    current_hour = current_time.hour
    hour_lower = (current_hour - 2) % 24
    hour_upper = (current_hour + 2) % 24
    
    query = """
    SELECT distance_meters
    FROM historical_data_real
    WHERE (origin = %s AND destination = %s OR origin = %s AND destination = %s)
      AND (
          (HOUR(timestamp) >= %s AND HOUR(timestamp) <= %s)
          OR (HOUR(timestamp) >= %s AND HOUR(timestamp) <= %s)
      )
    LIMIT 1
    """
    if hour_lower <= hour_upper:
        params = (origin, destination, destination, origin, hour_lower, hour_upper, hour_lower, hour_upper)
    else:
        query = """
        SELECT distance_meters
        FROM historical_data_real
        WHERE (origin = %s AND destination = %s OR origin = %s AND destination = %s)
          AND (
              (HOUR(timestamp) >= %s OR HOUR(timestamp) <= %s)
          )
        LIMIT 1
        """
        params = (origin, destination, destination, origin, hour_lower, hour_upper)
    
    cursor.execute(query, params)
    result = cursor.fetchone()
    return result[0] if result else None

# Obtener distancia de api_cache con filtro de hora
def get_distance_from_api_cache(origin, destination, cursor):
    current_time = datetime.now()
    current_hour = current_time.hour
    hour_lower = (current_hour - 2) % 24
    hour_upper = (current_hour + 2) % 24
    
    query = """
    SELECT distance_meters
    FROM api_cache
    WHERE (origin = %s AND destination = %s OR origin = %s AND destination = %s)
          AND api_type = 'google_directions'
          AND (
              (HOUR(timestamp) >= %s AND HOUR(timestamp) <= %s)
              OR (HOUR(timestamp) >= %s AND HOUR(timestamp) <= %s)
          )
    LIMIT 1
    """
    if hour_lower <= hour_upper:
        params = (origin, destination, destination, origin, hour_lower, hour_upper, hour_lower, hour_upper)
    else:
        query = """
        SELECT distance_meters
        FROM api_cache
        WHERE (origin = %s AND destination = %s OR origin = %s AND destination = %s)
              AND api_type = 'google_directions'
              AND (
                  (HOUR(timestamp) >= %s OR HOUR(timestamp) <= %s)
              )
        LIMIT 1
        """
        params = (origin, destination, destination, origin, hour_lower, hour_upper)
    
    cursor.execute(query, params)
    result = cursor.fetchone()
    return result[0] if result else None

# Obtener distancia con Google Directions API
def get_distance_from_google(origin, destination, cursor, conn):
    try:
        result = gmaps.directions(
            origin=origin,
            destination=destination,
            mode="driving"
        )
        distance_meters = result[0]['legs'][0]['distance']['value']
        response_json = json.dumps(result)
        
        insert_query = """
        INSERT INTO api_cache
        (origin, destination, api_type, distance_meters, timestamp, response_json)
        VALUES (%s, %s, %s, %s, %s, %s)
        """
        cursor.execute(insert_query, (
            origin, destination, 'google_directions', distance_meters,
            datetime.now(), response_json
        ))
        conn.commit()
        return distance_meters
    except Exception as e:
        raise ValueError(f"Error al consultar Google Directions API para {origin} -> {destination}: {e}")

# Cargar matriz desde JSON
def load_distance_matrix_from_json(points):
    if not os.path.exists(JSON_FILE):
        return None, None
    
    try:
        with open(JSON_FILE, 'r') as f:
            data = json.load(f)
        
        json_points = data['points']
        json_matrix = np.array(data['matrix'])
        
        if not all(p in json_points for p in points):
            return None, None
        
        indices = [json_points.index(p) for p in points]
        sub_matrix = json_matrix[np.ix_(indices, indices)]
        return points, sub_matrix
    except Exception as e:
        print(f"Error al cargar JSON: {e}")
        return None, None

# Guardar matriz en JSON
def save_distance_matrix_to_json(points, matrix):
    data = {
        "points": points,
        "matrix": matrix.tolist()
    }
    with open(JSON_FILE, 'w') as f:
        json.dump(data, f, indent=4)

# Obtener o calcular distancia
def get_distance(origin, destination, cursor, conn):
    distance = get_distance_from_historical(origin, destination, cursor)
    if distance is not None:
        return distance
    
    distance = get_distance_from_api_cache(origin, destination, cursor)
    if distance is not None:
        return distance
    
    return get_distance_from_google(origin, destination, cursor, conn)

# Crear o actualizar matriz de distancias
def get_distance_matrix(points, addresses):
    json_points, json_matrix = load_distance_matrix_from_json(points)
    if json_matrix is not None:
        return json_matrix
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    n = len(points)
    distance_matrix = np.zeros((n, n))
    
    for i in range(n):
        for j in range(i + 1, n):
            distance = get_distance(points[i], points[j], cursor, conn)
            distance_matrix[i, j] = distance_matrix[j, i] = distance
    
    save_distance_matrix_to_json(points, distance_matrix)
    
    cursor.close()
    conn.close()
    return distance_matrix

# Función principal
def optimize_route(origin, destination, intermediate_points, addresses):
    points = [origin] + intermediate_points + [destination]
    if not all(p in addresses for p in intermediate_points):
        raise ValueError("Algunas direcciones intermedias no están en la lista predefinida")
    
    # Remove duplicates from points while preserving order
    unique_points = []
    seen = set()
    for p in points:
        if p not in seen:
            unique_points.append(p)
            seen.add(p)
    points = unique_points
    
    distance_matrix = get_distance_matrix(points, addresses)
    
    best_distance = float('inf')
    best_route_indices = None
    distance_history = []
    stagnation_count = 0
    last_best_distance = float('inf')
    STAGNATION_THRESHOLD = 10  # Generations without significant improvement
    IMPROVEMENT_THRESHOLD = 0.0001  # 0.01% improvement
    
    def fitness_func(ga_instance, solution, solution_idx):
        nonlocal best_distance, best_route_indices
        solution = [int(i) for i in solution]
        if len(set(solution)) != len(solution):
            return -float('inf')
        route = [0] + [idx + 1 for idx in solution] + [len(points) - 1]
        total_distance = sum(distance_matrix[route[i]][route[i + 1]] for i in range(len(route) - 1))
        if total_distance <= 0:
            return -float('inf')
        if total_distance < best_distance:
            best_distance = total_distance
            best_route_indices = route
        return -total_distance  # Minimize distance (negative for PyGAD)
    
    def on_generation(ga_instance):
        nonlocal best_distance, distance_history, stagnation_count, last_best_distance
        current_best_distance = best_distance
        distance_history.append(current_best_distance / 1000)  # Store in km
        improvement = (last_best_distance - current_best_distance) / max(last_best_distance, 1e-6)
        if improvement < IMPROVEMENT_THRESHOLD:
            stagnation_count += 1
        else:
            stagnation_count = 0
        last_best_distance = current_best_distance
        if stagnation_count >= STAGNATION_THRESHOLD:
            print(f"Stopping: No significant improvement after {STAGNATION_THRESHOLD} generations.")
            return "stop"
    
    num_intermediate = len(points) - 2
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
        raise ValueError("No valid route found by GA")
    
    def two_opt(route, distance_matrix):
        best = route[:]
        best_dist = sum(distance_matrix[best[i]][best[i+1]] for i in range(len(best)-1))
        improved = True
        while improved:
            improved = False
            for i in range(1, len(route) - 2):
                for j in range(i + 1, len(route) - 1):
                    new_route = route[:i] + route[i:j+1][::-1] + route[j+1:]
                    new_dist = sum(distance_matrix[new_route[k]][new_route[k+1]] for k in range(len(new_route)-1))
                    if new_dist < best_dist - 0.01:
                        best = new_route
                        best_dist = new_dist
                        improved = True
            route = best
        return best, best_dist
    
    final_route_indices, final_cost = two_opt(best_route_indices, distance_matrix)
    
    if num_intermediate <= 3:
        from itertools import permutations
        best_perm_dist = float('inf')
        best_perm_route = None
        for perm in permutations(range(1, len(points) - 1)):
            route = [0] + list(perm) + [len(points) - 1]
            dist = sum(distance_matrix[route[i]][route[i+1]] for i in range(len(route)-1))
            if dist < best_perm_dist:
                best_perm_dist = dist
                best_perm_route = route
        if best_perm_dist < final_cost - 0.01:
            final_cost = best_perm_dist
            final_route_indices = best_perm_route
    
    route_names = [points[i] for i in final_route_indices]
    
    # Extend distance_history to include final cost after 2-opt/brute-force
    if distance_history:
        distance_history.append(final_cost / 1000)
    
    plt.figure(figsize=(10, 6))
    plt.plot(distance_history, label='Mejor Distancia', color='blue')
    plt.axhline(y=final_cost/1000, color='red', linestyle='--', label=f'Distancia Final ({final_cost/1000:.3f} km)')
    if num_intermediate <= 3:
        plt.axhline(y=best_perm_dist/1000, color='green', linestyle=':', label=f'Óptimo Teórico ({best_perm_dist/1000:.3f} km)')
    plt.xlabel('Generación')
    plt.ylabel('Distancia Total (kilómetros)')
    plt.title('Convergencia del Algoritmo Genético')
    plt.grid(True)
    plt.legend()
    plt.savefig('convergence_plot.png')
    plt.show()
    
    print(f"Distancia final en gráfica: {distance_history[-1]:.3f} km")
    print(f"Distancia final después de 2-opt/brute-force: {final_cost/1000:.3f} km")
    
    return route_names, final_cost

# Ejemplo de uso
if __name__ == "__main__":
    ORIGIN = "Universidad del Norte, Barranquilla, Atlántico"
    DESTINATION = "Colegio Karl C. Parrish, Barranquilla, Atlántico"
    intermediate_points = [addr for addr in ADDRESSES if addr not in (ORIGIN, DESTINATION)]
    
    route, total_distance = optimize_route(ORIGIN, DESTINATION, intermediate_points, ADDRESSES)
    print("Ruta óptima:", " -> ".join(route))
    print(f"Distancia total: {total_distance:.2f} metros")