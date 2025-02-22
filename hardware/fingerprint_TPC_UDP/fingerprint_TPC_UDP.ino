#include <HardwareSerial.h>
#include <Adafruit_Fingerprint.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WiFiClient.h>
#include "var_config.h"

// Instancias UDP y TCP
WiFiUDP udp;
WiFiClient tcpClient;

// Sensor de huellas
HardwareSerial mySerial(2);  // UART2 en ESP32 (GPIO16 y GPIO17)
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

void setup() {
    Serial.begin(115200);
    mySerial.begin(57600, SERIAL_8N1, 16, 17);  // TX y RX del ESP32

    Serial.println("\n Conectando a WiFi...");
    WiFi.begin(SSID, PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\n WiFi conectado");
    Serial.print("IP Local: ");
    Serial.println(WiFi.localIP());

    Serial.println("Iniciando sensor de huellas...");
    finger.begin(57600);
    if (finger.verifyPassword()) {
        Serial.println("✅ Sensor de huellas detectado.");
    } else {
        Serial.println("❌ No se encontró el sensor.");
        while (1);
    }
}

void loop() {
    if (finger.getImage() == FINGERPRINT_NOFINGER) {
        delay(500);  // Esperar un poco antes de volver a revisar
        return;  // No hay dedo en el sensor, salir del loop
    }

    Serial.println("\n🔎 Detectado un dedo. Escaneando huella...");
    int id = getFingerprintID();

    Serial.print("Resultado: ");
    Serial.println(id);

    // Enviar el ID al servidor (UDP y TCP)

    enviarDatoTCP(id);

    delay(2000);  // Pequeña pausa para evitar lecturas repetitivas
}

// 🛑 Función para leer y buscar la huella en la base de datos
int getFingerprintID() {
    if (finger.image2Tz() != FINGERPRINT_OK) return 0;
    
    if (finger.fingerFastSearch() == FINGERPRINT_OK) {
        return finger.fingerID;  // Devuelve el ID de la huella reconocida
    }
    
    return 0;  // Si no coincide, devuelve 0
}



// 🌐 Función para enviar el ID por TCP
void enviarDatoTCP(int id) {
    Serial.print("📤 Enviando ID ");
    Serial.print(id);
    Serial.println(" por TCP...");

    if (tcpClient.connect(EC2_IP, TCP_PORT)) {
        Serial.println("✅ Conectado al servidor TCP");
        // Enviar el ID como string
        tcpClient.print(String(id));
        tcpClient.stop();

        Serial.println("✅ ID enviado por TCP.");
    } else {
        Serial.println("❌ Error al conectar al servidor TCP.");
    }
}
