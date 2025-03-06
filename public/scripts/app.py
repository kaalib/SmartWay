from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/process', methods=['POST'])
def process_message():
    try:
        # Recibir JSON desde Node.js
        data = request.get_json()

        # Extraer información del JSON
        mensaje = data.get("mensaje", "Mensaje no especificado")
        origen = data.get("origen", "Desconocido")

        print(f"📩 Mensaje recibido: {mensaje} (Origen: {origen})")

        # Respuesta a Node.js
        respuesta = {
            "status": "success",
            "mensaje_recibido": mensaje,
            "origen": origen,
            "respuesta": f"Procesado correctamente desde Flask en {origen}"
        }

        return jsonify(respuesta), 200

    except Exception as e:
        print(f"❌ Error procesando mensaje: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)  # Escucha en el puerto 5000
