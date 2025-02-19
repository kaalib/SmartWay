#include <HardwareSerial.h>
#include <Adafruit_Fingerprint.h>

HardwareSerial mySerial(2);  // UART2 en ESP32 (GPIO16 y GPIO17)
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

void setup() {
    Serial.begin(115200);
    mySerial.begin(57600, SERIAL_8N1, 16, 17);  // TX y RX del ESP32

    Serial.println("Iniciando sensor de huellas...");
    finger.begin(57600);

    if (finger.verifyPassword()) {
        Serial.println("Sensor de huellas detectado correctamente.");
    } else {
        Serial.println("Error: No se pudo encontrar el sensor.");
        while (1);
    }

    Serial.print("Capacidad del sensor: ");
    Serial.println(finger.capacity);
    Serial.print("Nivel de seguridad: ");
    Serial.println(finger.security_level);
}

void loop() {
    Serial.println("\nIngresa un ID para la nueva huella (0 - 127): ");
    while (Serial.available() == 0);
    
    int id = Serial.parseInt();
    while (Serial.available()) Serial.read();  // Limpia buffer
    
    if (id < 0 || id > 127) {
        Serial.println("ID fuera de rango. Intenta de nuevo.");
        return;
    }

    Serial.print("Registrando huella con ID: ");
    Serial.println(id);

    if (enrollFingerprint(id)) {
        Serial.println("Huella registrada exitosamente.");
    } else {
        Serial.println("Error al registrar la huella.");
    }
}

// Función para registrar una huella
bool enrollFingerprint(int id) {
    int p;

    Serial.println("Colocar el dedo en el sensor");
    while ((p = finger.getImage()) != FINGERPRINT_OK);

    p = finger.image2Tz(1);
    if (p != FINGERPRINT_OK) return false;

    Serial.println("Retira el dedo y espera...");
    delay(2000);

    Serial.println("Coloca el mismo dedo de nuevo...");
    while ((p = finger.getImage()) != FINGERPRINT_OK);

    p = finger.image2Tz(2);
    if (p != FINGERPRINT_OK) return false;

    p = finger.createModel();
    if (p != FINGERPRINT_OK) return false;

    p = finger.storeModel(id);
    return (p == FINGERPRINT_OK);
}
