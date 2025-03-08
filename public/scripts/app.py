from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/process', methods=['POST'])
def process_message():
    try:
        # Recibir JSON desde Node.js
        data = request.get_json()
        
        # Extraer direcciones (asumiendo que llegan como una lista)
        direcciones = data.get("direcciones", [])

        print(f"📩 Direcciones recibidas: {direcciones}")

        # Invertir el orden de las direcciones
        direcciones_invertidas = list(reversed(direcciones))

        print(f"🔄 Direcciones invertidas: {direcciones_invertidas}")

        # Respuesta con la nueva ruta procesada
        respuesta = {
            "status": "success",
            "rutasIA": direcciones_invertidas
        }

        return jsonify(respuesta), 200

    except Exception as e:
        print(f"❌ Error procesando mensaje: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
