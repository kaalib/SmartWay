import googlemaps

API_KEY = "APIKEYLOL"

gmaps = googlemaps.Client(key=API_KEY)

# Direcciones en Barranquilla
origen = "Carrera 46 #72-188, Barranquilla, Colombia"
destino = "Calle 93 #49C-32, Barranquilla, Colombia"

# Obtener distancia y tiempo de viaje
ruta = gmaps.directions(origen, destino, mode="driving")

# Extraer información
distancia = ruta[0]["legs"][0]["distance"]["text"]
duracion = ruta[0]["legs"][0]["duration"]["text"]

print(f"Distancia: {distancia}")
print(f"Duración estimada: {duracion}")