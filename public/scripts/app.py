from flask import Flask, request, jsonify
from flask_socketio import SocketIO
import time
import threading

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")  # Permitir conexiones desde cualquier origen

rutasIA = []  # Aquí guardaremos la ruta procesada
ultima_ruta_enviada = None  # Última versión enviada de rutasIA

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

        return jsonify({"status": "success", "rutasIA": rutasIA}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# 📡 Emitir datos solo si hay cambios en rutasIA
def enviar_rutas_si_cambian():
    global ultima_ruta_enviada

    while True:
        if rutasIA and rutasIA != ultima_ruta_enviada:  # Solo enviar si hay cambios
            print("📡 Enviando rutas actualizadas a los clientes WebSocket:", rutasIA)
            socketio.emit("actualizar_rutas", {"rutasIA": rutasIA})
            ultima_ruta_enviada = rutasIA.copy()  # Guardar la versión enviada
        time.sleep(10)  # Esperar 10 segundos antes de revisar nuevamente

# Iniciar el hilo en segundo plano
threading.Thread(target=enviar_rutas_si_cambian, daemon=True).start()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
