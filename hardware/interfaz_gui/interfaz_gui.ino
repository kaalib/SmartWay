#include <lvgl.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <HardwareSerial.h>
#include <Adafruit_Fingerprint.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WiFiClient.h>
#include "var_config.h"

// táctil pins
#define XPT2046_IRQ 36   // T_IRQ
#define XPT2046_MOSI 32  // T_DIN
#define XPT2046_MISO 39  // T_OUT
#define XPT2046_CLK 25   // T_CLK
#define XPT2046_CS 33    // T_CS

SPIClass touchscreenSPI = SPIClass(VSPI);
XPT2046_Touchscreen touchscreen(XPT2046_CS, XPT2046_IRQ);

#define SCREEN_WIDTH 240
#define SCREEN_HEIGHT 320

// Touchscreen coordinates: (x, y) and pressure (z)
int x, y, z;

#define DRAW_BUF_SIZE (SCREEN_WIDTH * SCREEN_HEIGHT / 10 * (LV_COLOR_DEPTH / 8))
uint32_t draw_buf[DRAW_BUF_SIZE / 4];

// Instancias de WiFi
WiFiUDP udp;
WiFiClient tcpClient;

// Sensor de huellas
HardwareSerial mySerial(2);  // UART2 en ESP32 (GPIO16 y GPIO17)
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// Estados del sistema
enum Mode { ENROLL, FINGERPRINT };
Mode currentMode = FINGERPRINT;


// If logging is enabled, it will inform the user about what is happening in the library
void log_print(lv_log_level_t level, const char * buf) {
  LV_UNUSED(level);
  Serial.println(buf);
  Serial.flush();
}

// Get the Touchscreen data
void touchscreen_read(lv_indev_t * indev, lv_indev_data_t * data) {
  if(touchscreen.tirqTouched() && touchscreen.touched()) {
    TS_Point p = touchscreen.getPoint();
    x = map(p.x, 200, 3700, 1, SCREEN_WIDTH);
    y = map(p.y, 240, 3800, 1, SCREEN_HEIGHT);
    z = p.z;

    data->state = LV_INDEV_STATE_PRESSED;
    data->point.x = x;
    data->point.y = y;
  }
  else {
    data->state = LV_INDEV_STATE_RELEASED;
  }
}

// Callback que se activa cuando se hace clic en el botón "Enroll"
static void event_handler_btn_enroll(lv_event_t * e) {
  lv_event_code_t code = lv_event_get_code(e);
  if(code == LV_EVENT_CLICKED) {
    currentMode = ENROLL;
    lv_label_set_text(lv_obj_get_child(lv_screen_active(), 0), "Modo Enroll");
  }
}

// Callback que se activa cuando se hace clic en el botón "Fingerprint"
static void event_handler_btn_fingerprint(lv_event_t * e) {
  lv_event_code_t code = lv_event_get_code(e);
  if(code == LV_EVENT_CLICKED) {
    currentMode = FINGERPRINT;
    lv_label_set_text(lv_obj_get_child(lv_screen_active(), 0), "Modo Fingerprint");
  }
}

void lv_create_main_gui(void) {
  // Crear un contenedor principal que ocupe toda la pantalla
  lv_obj_t * container = lv_obj_create(lv_screen_active());
  lv_obj_set_size(container, lv_disp_get_hor_res(NULL), lv_disp_get_ver_res(NULL));
  lv_obj_center(container);

  // Aplicar color de fondo al contenedor (gris claro)
  lv_obj_set_style_bg_color(container, lv_color_hex(0xF8F9FA), LV_PART_MAIN);

  // Etiqueta para mostrar el modo seleccionado
  lv_obj_t * status_label = lv_label_create(container);
  lv_label_set_long_mode(status_label, LV_LABEL_LONG_WRAP);
  lv_label_set_text(status_label, "Seleccione un modo");
  lv_obj_set_width(status_label, 200);
  lv_obj_set_style_text_align(status_label, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_align(status_label, LV_ALIGN_CENTER, 0, -90);

  // Crear un contenedor para los botones
  lv_obj_t * btn_container = lv_obj_create(container);
  lv_obj_set_size(btn_container, 220, 60);
  lv_obj_align(btn_container, LV_ALIGN_CENTER, 0, -30);

  // Configurar layout flexible para organizar los botones
  lv_obj_set_flex_flow(btn_container, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(btn_container, LV_FLEX_ALIGN_SPACE_AROUND, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_bg_opa(btn_container, LV_OPA_TRANSP, LV_PART_MAIN); // Hacer el fondo del contenedor transparente

  // Botón para "Enroll"
  lv_obj_t * btn_enroll = lv_button_create(btn_container);
  lv_obj_set_size(btn_enroll, 90, 50);
  lv_obj_add_event_cb(btn_enroll, event_handler_btn_enroll, LV_EVENT_CLICKED, NULL);
  lv_obj_t * btn_enroll_label = lv_label_create(btn_enroll);
  lv_label_set_text(btn_enroll_label, "Enroll");
  lv_obj_center(btn_enroll_label);
  lv_obj_set_style_bg_color(btn_enroll, lv_color_hex(0x007BFF), LV_PART_MAIN); // Color azul

  // Botón para "Fingerprint"
  lv_obj_t * btn_fingerprint = lv_button_create(btn_container);
  lv_obj_set_size(btn_fingerprint, 90, 50);
  lv_obj_add_event_cb(btn_fingerprint, event_handler_btn_fingerprint, LV_EVENT_CLICKED, NULL);
  lv_obj_t * btn_fingerprint_label = lv_label_create(btn_fingerprint);
  lv_label_set_text(btn_fingerprint_label, "Fingerprint");
  lv_obj_center(btn_fingerprint_label);
  lv_obj_set_style_bg_color(btn_fingerprint, lv_color_hex(0x28A745), LV_PART_MAIN); // Color verde
}



// Función para conectar a WiFi
void connectToWiFi() {
  Serial.println("Conectando a WiFi...");
  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado");
  Serial.print("IP Local: ");
  Serial.println(WiFi.localIP());
}

// Función para enviar datos por UDP
void sendDataUDP(int id) {
  Serial.print("Enviando ID ");
  Serial.print(id);
  Serial.println(" por UDP...");

  udp.beginPacket(EC2_IP, UDP_PORT);
  udp.print(id);
  udp.endPacket();

  Serial.println("ID enviado por UDP.");
}

// Función para enviar datos por TCP
void sendDataTCP(int id) {
  Serial.print("Enviando ID ");
  Serial.print(id);
  Serial.println(" por TCP...");

  if (tcpClient.connect(EC2_IP, TCP_PORT)) {
    tcpClient.print(id);
    tcpClient.stop();
    Serial.println("ID enviado por TCP.");
  } else {
    Serial.println("Error al conectar al servidor TCP.");
  }
}


void setup() {
  // 1. Inicializar el Serial para depuración
  Serial.begin(115200);
  String LVGL_Arduino = String("LVGL Library Version: ") + lv_version_major() + "." + lv_version_minor() + "." + lv_version_patch();
  Serial.println(LVGL_Arduino);

  // 2. Inicializar la comunicación con el sensor de huellas
  mySerial.begin(57600, SERIAL_8N1, 16, 17);  // TX y RX del ESP32
  finger.begin(57600);
  if (finger.verifyPassword()) {
    Serial.println("Sensor de huellas detectado correctamente.");
  } else {
    Serial.println("Error: No se pudo encontrar el sensor.");
    while (1);  // Detener el programa si el sensor no está conectado
  }

  // 3. Conectar a WiFi
  connectToWiFi();

  // 4. Inicializar LVGL y la pantalla táctil
  lv_init();
  lv_log_register_print_cb(log_print);

  touchscreenSPI.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  touchscreen.begin(touchscreenSPI);
  touchscreen.setRotation(2);

  lv_display_t * disp = lv_tft_espi_create(SCREEN_WIDTH, SCREEN_HEIGHT, draw_buf, sizeof(draw_buf));
  lv_display_set_rotation(disp, LV_DISPLAY_ROTATION_270);

  lv_indev_t * indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, touchscreen_read);

  // 5. Crear la interfaz gráfica
  lv_create_main_gui();
}

void loop() {
  lv_task_handler();  // Manejar las tareas de LVGL
  lv_tick_inc(5);     // Incrementar el tiempo de LVGL
  delay(5);           // Esperar un poco

  // Ejecutar la lógica según el modo seleccionado
  if (currentMode == ENROLL) {
    enrollMode();
  } else if (currentMode == FINGERPRINT) {
    fingerprintMode();
  }
}

// Función para el modo "Enroll"
int currentID = 0;  // Empieza en 0 y se incrementa hasta 39

void enrollMode() {
    if (currentID > 39) {
        Serial.println("Límite de huellas alcanzado (40). No se pueden registrar más.");
        return;
    }

    Serial.print("Registrando huella en ID: ");
    Serial.println(currentID);

    if (enrollFingerprint(currentID)) {
        Serial.println("Huella registrada exitosamente.");
        currentID++;  // Incrementa el ID solo si la huella se registró correctamente
    } else {
        Serial.println("Error al registrar la huella. Intente de nuevo.");
    }
}

// Función para registrar una huella
bool enrollFingerprint(int id) {
    int p;

    Serial.println("Coloca el dedo en el sensor...");
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


// Función para el modo "Fingerprint"
void fingerprintMode() {
  Serial.println("Modo Fingerprint: Coloca el dedo en el sensor...");
  int id = getFingerprintID();
  if (id >= 0 && id <= 39) {
    Serial.print("Huella reconocida con ID: ");
    Serial.println(id);
    sendDataUDP(id);  // Enviar ID por UDP
    sendDataTCP(id);  // Enviar ID por TCP
  } else if (id > 39) {
    Serial.println("Huella fuera del rango.");
  } else {
    Serial.println("Huella no reconocida.");
  }
}

// Función para leer y buscar la huella en la base de datos
int getFingerprintID() {
  if (finger.getImage() != FINGERPRINT_OK) return -1;
  if (finger.image2Tz() != FINGERPRINT_OK) return -1;
  if (finger.fingerFastSearch() == FINGERPRINT_OK) {
    return finger.fingerID;  // Devuelve el ID de la huella reconocida
  }
  return -1;
}
