#include <lvgl.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <Adafruit_Fingerprint.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Preferences.h>
#include "var_config.h"

#define XPT2046_IRQ 36
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK 25
#define XPT2046_CS 33

lv_obj_t * title_label;
lv_obj_t * enroll_btn;
lv_obj_t * fingerprint_btn;
lv_obj_t * label_status;
lv_obj_t * back_btn;
lv_obj_t * main_panel;

SPIClass touchscreenSPI = SPIClass(VSPI);
XPT2046_Touchscreen touchscreen(XPT2046_CS, XPT2046_IRQ);

#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 240

static lv_disp_draw_buf_t draw_buf;
static lv_color_t buf[SCREEN_WIDTH * 5];

TFT_eSPI tft = TFT_eSPI(SCREEN_WIDTH, SCREEN_HEIGHT);

#define FINGERPRINT_RX 16
#define FINGERPRINT_TX 17

HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

bool fingerprintReading = false;
bool enrolling = false;
int nextEnrollID = 1; 

Preferences prefs; //guardar el ID en la memoria no volatil del esp32

WiFiClient tcpClient;
WiFiUDP udpClient;

void touchscreen_read(lv_indev_drv_t * indev, lv_indev_data_t * data) {
    if (touchscreen.touched()) {
        TS_Point p = touchscreen.getPoint();
        int x = map(p.x, 279, 3723, 0, SCREEN_WIDTH);
        int y = map(p.y, 272, 3777, 0, SCREEN_HEIGHT);
        x = constrain(x, 0, SCREEN_WIDTH - 1);
        y = constrain(y, 0, SCREEN_HEIGHT - 1);
        data->point.x = x;
        data->point.y = y;
        data->state = LV_INDEV_STATE_PRESSED;
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}

void my_disp_flush(lv_disp_drv_t * disp, const lv_area_t * area, lv_color_t * color_p) {
    uint32_t w = (area->x2 - area->x1 + 1);
    uint32_t h = (area->y2 - area->y1 + 1);
    tft.startWrite();
    tft.setAddrWindow(area->x1, area->y1, w, h);
    tft.pushColors((uint16_t*)&color_p->full, w * h, true);
    tft.endWrite();
    lv_disp_flush_ready(disp);
}

bool enviarDatoTCP(int id) {
    Serial.println("Iniciando enviarDatoTCP para ID: " + String(id));
    Serial.println("Memoria libre antes de TCP: " + String(ESP.getFreeHeap()));

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("❌ Error: No hay conexión WiFi");
        return false;
    }

    // Cerrar cualquier conexión previa para evitar estados inválidos
    if (tcpClient.connected()) {
        tcpClient.stop();
        Serial.println("Conexión TCP previa cerrada");
    }

    // Intentar conectar con timeout
    Serial.println("Conectando al servidor TCP: " + String(EC2_IP) + ":" + String(TCP_PORT));
    unsigned long startTime = millis();
    if (!tcpClient.connect(EC2_IP, TCP_PORT)) {
        Serial.println("❌ Error: No se pudo conectar al servidor TCP");
        tcpClient.stop();
        return false;
    }
    if (millis() - startTime > 2000) {
        Serial.println("❌ Timeout al conectar al servidor TCP");
        tcpClient.stop();
        return false;
    }
    Serial.println("✅ Conectado al servidor TCP");

    // Enviar el ID
    Serial.print("Enviando ID: ");
    Serial.println(id);
    tcpClient.print(String(id));
    tcpClient.flush();

    // Cerrar conexión después del envío
    tcpClient.stop();
    Serial.println("✅ Conexión TCP cerrada después del envío");

    Serial.println("Memoria libre después de TCP: " + String(ESP.getFreeHeap()));
    return true;
}

void startFingerprintReading() {
    fingerprintReading = true;
    lv_label_set_text(label_status, "Inserte su huella");
}

void checkFingerprint() {
    if (!fingerprintReading) return;

    uint8_t p = finger.getImage();
    if (p == FINGERPRINT_OK) {
        p = finger.image2Tz();
        if (p == FINGERPRINT_OK) {
            p = finger.fingerSearch();
            if (p == FINGERPRINT_OK) {
                lv_label_set_text(title_label, "Huella detectada exitosamente");
                Serial.println("Huella reconocida, ID: " + String(finger.fingerID));
                if (!enviarDatoTCP(finger.fingerID)) {
                    lv_label_set_text(label_status, "Error al enviar ID por TCP");
                    lv_task_handler();
                    delay(3000);
                    lv_label_set_text(label_status, "Inserte su huella");
                }
            } else {
                lv_label_set_text(title_label, "Huella no registrada en el sistema");
                Serial.println("Huella no registrada");
            }
            lv_task_handler(); // Actualizar LVGL antes del delay
            delay(2000); // Restaurar delay original
            lv_task_handler(); // Actualizar LVGL después del delay
            lv_label_set_text(label_status, "Inserte su huella");
            lv_label_set_text(title_label, "");
        } else {
            Serial.println("Error en image2Tz: " + String(p));
        }
    } else if (p != FINGERPRINT_NOFINGER) {
        Serial.println("Error al leer huella: " + String(p));
    }
}

int getFingerprintID() {
    uint8_t p = finger.getImage();
    if (p != FINGERPRINT_OK) return -1;
    p = finger.image2Tz();
    if (p != FINGERPRINT_OK) return -1;
    p = finger.fingerSearch();
    if (p == FINGERPRINT_OK) {
        return finger.fingerID;
    }
    return -1;
}

bool connectToWiFi() {
    Serial.println("Iniciando connectToWiFi");
    Serial.println("Memoria libre antes de WiFi: " + String(ESP.getFreeHeap()));

    WiFi.mode(WIFI_STA); // Modo estación
    WiFi.begin(SSID, PASSWORD);
    Serial.println("Conectando a WiFi: " + String(SSID));

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startTime < 10000) {
        lv_timer_handler();
        delay(100);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✅ Conectado a WiFi: " + String(SSID));
        Serial.println("Memoria libre después de WiFi: " + String(ESP.getFreeHeap()));
        lv_label_set_text(label_status, "Conectado a WiFi");
        lv_task_handler();
        delay(1000);
        lv_label_set_text(label_status, "Seleccione un modo");
        return true;
    } else {
        Serial.println("\n❌ Error: No se pudo conectar a WiFi");
        Serial.println("Memoria libre después de WiFi: " + String(ESP.getFreeHeap()));
        lv_label_set_text(label_status, "Error de conexion WiFi");
        lv_task_handler();
        delay(2000);
        lv_label_set_text(label_status, "Seleccione un modo");
        WiFi.disconnect(); // Desconectar para liberar recursos
        return false;
    }
}

void lv_create_main_gui(void) {
    lv_obj_t * header_panel = lv_obj_create(lv_scr_act());
    lv_obj_set_size(header_panel, SCREEN_WIDTH, 35);
    lv_obj_align(header_panel, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_color(header_panel, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_border_width(header_panel, 0, LV_PART_MAIN);
    lv_obj_clear_flag(header_panel, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t * brand_label = lv_label_create(header_panel);
    lv_label_set_recolor(brand_label, true);
    lv_label_set_text(brand_label, "#0059FF SMART##000000 WAY#");
    lv_obj_align(brand_label, LV_ALIGN_TOP_MID, 10, -7);
    lv_obj_set_style_text_font(brand_label, &lv_font_montserrat_20, 0);

    main_panel = lv_obj_create(lv_scr_act());
    lv_obj_set_size(main_panel, SCREEN_WIDTH, SCREEN_HEIGHT - 40);
    lv_obj_align(main_panel, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(main_panel, lv_color_hex(0xF7F5F5), LV_PART_MAIN);
    lv_obj_set_style_border_width(main_panel, 0, LV_PART_MAIN);
    lv_obj_clear_flag(main_panel, LV_OBJ_FLAG_SCROLLABLE);

    static lv_style_t style_title;
    lv_style_init(&style_title);
    lv_style_set_text_font(&style_title, &lv_font_montserrat_26);
    lv_style_set_text_color(&style_title, lv_color_hex(0x0055FF));
    lv_style_set_text_align(&style_title, LV_TEXT_ALIGN_CENTER);

    title_label = lv_label_create(main_panel);
    lv_label_set_text(title_label, "Transformando el\nTransporte Empresarial");
    lv_obj_add_style(title_label, &style_title, 0);
    lv_obj_set_width(title_label, SCREEN_WIDTH - 40);
    lv_style_set_text_font(&style_title, &lv_font_montserrat_22);
    lv_style_set_text_color(&style_title, lv_color_hex(0x0059FF));
    lv_obj_align(title_label, LV_ALIGN_TOP_MID, 0, 2);

    enroll_btn = lv_btn_create(main_panel);
    lv_obj_set_size(enroll_btn, 125, 45);
    lv_obj_align(enroll_btn, LV_ALIGN_TOP_LEFT, 5, 125);
    lv_obj_set_style_bg_color(enroll_btn, lv_color_hex(0x0059FF), LV_PART_MAIN);
    lv_obj_set_style_radius(enroll_btn, 20, LV_PART_MAIN);

    static lv_style_t style_btn_label;
    lv_style_init(&style_btn_label);
    lv_style_set_text_font(&style_btn_label, &lv_font_montserrat_16);

    lv_obj_t * enroll_label = lv_label_create(enroll_btn);
    lv_label_set_text(enroll_label, "Registrar");
    lv_obj_add_style(enroll_label, &style_btn_label, 0);
    lv_style_set_text_font(&style_btn_label, &lv_font_montserrat_18);
    lv_obj_center(enroll_label);
    lv_obj_add_event_cb(enroll_btn, btn_enroll_event_handler, LV_EVENT_CLICKED, NULL);

    fingerprint_btn = lv_btn_create(main_panel);
    lv_obj_set_size(fingerprint_btn, 125, 45);
    lv_obj_align(fingerprint_btn, LV_ALIGN_TOP_LEFT, 165, 125);
    lv_obj_set_style_bg_color(fingerprint_btn, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_border_color(fingerprint_btn, lv_color_hex(0x0055FF), LV_PART_MAIN);
    lv_obj_set_style_border_width(fingerprint_btn, 2, LV_PART_MAIN);
    lv_obj_set_style_radius(fingerprint_btn, 20, LV_PART_MAIN);

    lv_obj_t * fingerprint_label = lv_label_create(fingerprint_btn);
    lv_label_set_text(fingerprint_label, "Ingresar");
    lv_obj_add_style(fingerprint_label, &style_btn_label, 0);
    lv_style_set_text_font(&style_btn_label, &lv_font_montserrat_18);
    lv_obj_set_style_text_color(fingerprint_label, lv_color_hex(0x0055FF), LV_PART_MAIN);
    lv_obj_center(fingerprint_label);
    lv_obj_add_event_cb(fingerprint_btn, btn_fingerprint_event_handler, LV_EVENT_CLICKED, NULL);
    lv_obj_set_style_bg_color(fingerprint_btn, lv_color_hex(0xF7F5F5), LV_PART_MAIN);

    label_status = lv_label_create(main_panel);
    lv_label_set_text(label_status, "Inicializando...");
    lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -80);
    static lv_style_t style_status;
    lv_style_init(&style_status);
    lv_style_set_text_font(&style_status, &lv_font_montserrat_18);
    lv_obj_add_style(label_status, &style_status, 0);
}

static void btn_enroll_event_handler(lv_event_t * e) {
    Serial.println("Enroll button pressed");
    lv_obj_add_flag(enroll_btn, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(fingerprint_btn, LV_OBJ_FLAG_HIDDEN);

    back_btn = lv_btn_create(main_panel);
    lv_obj_set_size(back_btn, 125, 45);
    lv_obj_align(back_btn, LV_ALIGN_CENTER, 0, 60);
    lv_obj_set_style_bg_color(back_btn, lv_color_hex(0x0059FF), LV_PART_MAIN);
    lv_obj_add_event_cb(back_btn, back_event_handler, LV_EVENT_CLICKED, NULL);
    lv_obj_set_style_radius(back_btn, 20, LV_PART_MAIN);
    lv_obj_clear_flag(back_btn, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t * back_label = lv_label_create(back_btn);
    lv_label_set_text(back_label, "Volver");
    lv_obj_center(back_label);

    lv_label_set_text(title_label, "Siga las instrucciones de\nabajo para registrarse");
    lv_obj_align(title_label, LV_ALIGN_TOP_MID, 0, -7);
    lv_label_set_text(label_status, "Coloque su huella 1\nvez y retire el dedo");
    lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);

    lv_task_handler();

    enrolling = true;
}

static void btn_fingerprint_event_handler(lv_event_t * e) {
    Serial.println("Fingerprint button pressed");
    lv_obj_add_flag(enroll_btn, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(fingerprint_btn, LV_OBJ_FLAG_HIDDEN);

    back_btn = lv_btn_create(main_panel);
    lv_obj_set_size(back_btn, 125, 45);
    lv_obj_align(back_btn, LV_ALIGN_CENTER, 0, 50);
    lv_obj_set_style_bg_color(back_btn, lv_color_hex(0x0059FF), LV_PART_MAIN);
    lv_obj_add_event_cb(back_btn, back_event_handler, LV_EVENT_CLICKED, NULL);
    lv_obj_set_style_radius(back_btn, 20, LV_PART_MAIN);
    lv_obj_clear_flag(back_btn, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t * back_label = lv_label_create(back_btn);
    lv_label_set_text(back_label, "Volver");
    lv_obj_center(back_label);

    lv_label_set_text(label_status, "Inserte su huella");
    lv_label_set_text(title_label, "");
    lv_obj_align(title_label, LV_ALIGN_TOP_MID, 0, 12);
    lv_task_handler();

    startFingerprintReading();
}

static void back_event_handler(lv_event_t * e) {
    Serial.println("Back button pressed");
    fingerprintReading = false;
    enrolling = false;
    if (tcpClient.connected()) {
        tcpClient.stop();
        Serial.println("✅ Conexión TCP cerrada");
    }
    lv_obj_add_flag(back_btn, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(enroll_btn, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(fingerprint_btn, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(title_label, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(label_status, LV_OBJ_FLAG_HIDDEN);

    lv_label_set_text(title_label, "Transformando el\nTransporte Empresarial");
    lv_obj_align(title_label, LV_ALIGN_TOP_MID, 0, 2);
    lv_label_set_text(label_status, "Seleccione un modo");
    lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -80);
    lv_task_handler();
}

void enrollFingerprint() {
    if (!enrolling) return;

    if (nextEnrollID > 127) {
        lv_obj_align(title_label, LV_ALIGN_TOP_MID, 0, -3);
        lv_label_set_text(title_label, "Maximo número de\nhuellas registrado");
        lv_label_set_text(label_status, "No se pueden registrar más huellas");
        Serial.println("❌ Maximo número de huellas alcanzado");
        enrolling = false;
        lv_task_handler();
        delay(2000);
        back_event_handler(NULL);
        return;
    }

    int id = nextEnrollID;
    Serial.println("Iniciando registro para ID: " + String(id));

    finger.deleteModel(id);
    Serial.println("Eliminando huella previa en ID: " + String(id));

    uint8_t p = FINGERPRINT_NOFINGER;
    while (p != FINGERPRINT_OK) {
        p = finger.getImage();
        if (p == FINGERPRINT_NOFINGER) {
            lv_timer_handler();
            delay(1);
            if (!enrolling) return;
            continue;
        }
        if (p != FINGERPRINT_OK) {
            lv_label_set_text(label_status, "Ha ocurrido un error, coloque el\n    dedo y retirelo");
            delay(5000);
            lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
            Serial.println("❌ Error al leer huella (primera vez): " + String(p));
            lv_task_handler();
            delay(1000);
            lv_label_set_text(label_status, "Coloque su huella 1\nvez y retire el dedo");
            p = FINGERPRINT_NOFINGER;
        }
    }

    p = finger.image2Tz(1);
    if (p != FINGERPRINT_OK) {
        lv_label_set_text(label_status, "Ha ocurrido un error, vuelva a\n    colocar el dedo y retirelo");
        delay(5000);
        lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
        Serial.println("❌ Error en image2Tz(1): " + String(p));
        lv_task_handler();
        delay(1000);
        lv_label_set_text(label_status, "Coloque su huella 1\nvez y retire el dedo");
        return;
    }

    lv_label_set_text(label_status, "     Coloque su huella una\nsegunda vez y retire el dedo");
    lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
    lv_task_handler();
    delay(2000);

    p = FINGERPRINT_NOFINGER;
    while (p != FINGERPRINT_OK) {
        p = finger.getImage();
        if (p == FINGERPRINT_NOFINGER) {
            lv_timer_handler();
            delay(1);
            if (!enrolling) return;
            continue;
        }
        if (p != FINGERPRINT_OK) {
            lv_label_set_text(label_status, "Ha ocurrido un error, vuelva a\n    colocar el dedo y retirelo");
            delay(5000);
            lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
            Serial.println("❌ Error al leer huella (segunda vez): " + String(p));
            lv_task_handler();
            delay(1000);
            lv_label_set_text(label_status, "     Coloque su huella una\nsegunda vez y retire el dedo");
            lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
            p = FINGERPRINT_NOFINGER;
        }
    }

    p = finger.image2Tz(2);
    if (p != FINGERPRINT_OK) {
        lv_label_set_text(label_status, "Ha ocurrido un error, vuelva a\n    colocar el dedo y retirelo");
        delay(5000);
        lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
        lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
        Serial.println("❌ Error en image2Tz(2): " + String(p));
        lv_task_handler();
        delay(1000);
        lv_label_set_text(label_status, "     Coloque su huella una\nsegunda vez y retire el dedo");
        lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
        return;
    }

    p = finger.createModel();
    if (p != FINGERPRINT_OK) {
        lv_label_set_text(label_status, "Ha ocurrido un error, vuelva a\n    colocar el dedo y retirelo");
        delay(5000);
        lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
        Serial.println("❌ Error en createModel: " + String(p));
        lv_task_handler();
        delay(1000);
        lv_label_set_text(label_status, "Coloque su huella 1\nvez y retire el dedo");
        return;
    }

    p = finger.storeModel(id);
    if (p != FINGERPRINT_OK) {
        lv_label_set_text(label_status, "Ha ocurrido un error, vuelva a\n    colocar el dedo y retirelo");
        delay(5000);
        lv_obj_align(label_status, LV_ALIGN_BOTTOM_MID, 0, -70);
        Serial.println("❌ Error en storeModel: " + String(p));
        lv_task_handler();
        delay(1000);
        lv_label_set_text(label_status, "Coloque su huella 1\nvez y retire el dedo");
        return;
    }

    lv_label_set_text(label_status, ("Huella #" + String(id) + " registrada\nexitosamente").c_str());
    Serial.println("✅ Huella registrada con ID: " + String(id));

    nextEnrollID++;
    prefs.putInt("nextEnrollID", nextEnrollID);
    Serial.println("Guardando nextEnrollID: " + String(nextEnrollID));

    enrolling = false;
    lv_task_handler();
    delay(2000);
    lv_label_set_text(label_status, "Coloque su huella 1\nvez y retire el dedo");
}

void setup() {
    Serial.begin(115200);
    lv_init();

    prefs.begin("fingerprint", false);
    nextEnrollID = prefs.getInt("nextEnrollID", 1);
    Serial.println("Cargando nextEnrollID: " + String(nextEnrollID));

    tft.begin();
    delay(100);
    tft.setRotation(1);

    lv_disp_draw_buf_init(&draw_buf, buf, NULL, SCREEN_WIDTH * 5);
    static lv_disp_drv_t disp_drv;
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = 320;
    disp_drv.ver_res = 240;
    disp_drv.flush_cb = my_disp_flush;
    disp_drv.draw_buf = &draw_buf;
    lv_disp_drv_register(&disp_drv);

    touchscreenSPI.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
    touchscreenSPI.setFrequency(1000000);
    touchscreen.begin(touchscreenSPI);
    delay(100);
    touchscreen.setRotation(1);

    static lv_indev_drv_t indev_drv;
    lv_indev_drv_init(&indev_drv);
    indev_drv.type = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = touchscreen_read;
    lv_indev_drv_register(&indev_drv);

    lv_create_main_gui();
    Serial.println("✅ Pantalla inicializada");
    Serial.println("Memoria libre después de pantalla: " + String(ESP.getFreeHeap()));

    mySerial.begin(57600, SERIAL_8N1, FINGERPRINT_RX, FINGERPRINT_TX);
    finger.begin(57600);

    if (finger.verifyPassword()) {
        Serial.println("✅ Sensor de huellas conectado");
    } else {
        Serial.println("❌ No se detectó el sensor de huellas");
        lv_label_set_text(label_status, "Error con sensor de huellas");
        delay(2000);
    }
    Serial.println("Memoria libre después de sensor: " + String(ESP.getFreeHeap()));

    connectToWiFi();

    Serial.println("✅ Interfaz lista");
}

void loop() {
    lv_timer_handler();
    if (fingerprintReading) {
        checkFingerprint();
    }
    if (enrolling) {
        enrollFingerprint();
    }
    delay(1);
}