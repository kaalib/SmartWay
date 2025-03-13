from flask import Flask, request, jsonify
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

rutasIA = []  # Almacena las rutas globalmente

# 📌 Ruta para procesar mensajes y actualizar rutasIA
@app.route('/api/process', methods=['POST'])
def process_message():
    global rutasIA
    try:
        data = request.get_json()
        direcciones = data.get("direcciones", [])

        if not direcciones:
            return jsonify({"status": "error", "message": "Lista de direcciones vacía"}), 400

        # Mantener el primer elemento fijo y solo invertir del segundo al último
        primer_elemento = direcciones[0]
        direcciones_restantes = direcciones[1:]
        rutasIA = [primer_elemento] + list(reversed(direcciones_restantes))

        print(f"🔄 Direcciones procesadas: {rutasIA}")

        # 📡 Emitir actualización a TODOS los clientes conectados al WebSocket
        socketio.emit("actualizar_rutas", {"rutasIA": rutasIA})

        return jsonify({"status": "success", "rutasIA": rutasIA}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# 📌 Nueva ruta para actualizar la ubicación del bus en tiempo real
@app.route('/actualizar_ubicacion', methods=['POST'])
def actualizar_ubicacion():
    global rutasIA
    try:
        data = request.json
        ubicacion_bus = data.get("ubicacion_bus")  # Debe ser { "lat": ..., "lng": ... }

        if not ubicacion_bus:
            return jsonify({"status": "error", "message": "Ubicación del bus no proporcionada"}), 400

        # 📍 Insertar el bus como primer elemento en rutasIA
        rutasIA = [ubicacion_bus] + [p for p in rutasIA if p.get("id") != "bus"]

        print("📡 Ubicación del bus actualizada en rutasIA:", rutasIA)

        # 🔥 Enviar actualización en tiempo real a todos los clientes WebSocket
        socketio.emit("actualizar_rutas", {"rutasIA": rutasIA})

        return jsonify({"status": "success", "message": "Ubicación actualizada"}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)