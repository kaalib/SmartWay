from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/process', methods=['POST'])
def process_message():
    try:
        # Recibir JSON desde Node.js
        data = request.get_json()
        
        # Extraer direcciones (asegurar que sea una lista)
        direcciones = data.get("direcciones", [])
        
        if not direcciones:
            return jsonify({"status": "error", "message": "Lista de direcciones vacía"}), 400

        print(f"📩 Direcciones recibidas: {direcciones}")

        # Mantener el primer elemento fijo y solo invertir del segundo al último
        primer_elemento = direcciones[0]
        direcciones_restantes = direcciones[1:]
        direcciones_procesadas = [primer_elemento] + list(reversed(direcciones_restantes))

        print(f"🔄 Direcciones procesadas: {direcciones_procesadas}")

        # Respuesta con la nueva ruta procesada
        respuesta = {
            "status": "success",
            "rutasIA": direcciones_procesadas
        }

        return jsonify(respuesta), 200

    except Exception as e:
        print(f"❌ Error procesando mensaje: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
