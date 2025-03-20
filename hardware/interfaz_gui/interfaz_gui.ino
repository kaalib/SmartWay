#include <lvgl.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <Adafruit_Fingerprint.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include "var_config.h"

#define XPT2046_IRQ 36
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK 25
#define XPT2046_CS 33

SPIClass touchscreenSPI = SPIClass(VSPI);
XPT2046_Touchscreen touchscreen(XPT2046_CS, XPT2046_IRQ);

#define SCREEN_WIDTH 240
#define SCREEN_HEIGHT 320

static lv_disp_draw_buf_t draw_buf;
static lv_color_t buf[SCREEN_WIDTH * 10];

TFT_eSPI tft = TFT_eSPI(SCREEN_WIDTH, SCREEN_HEIGHT);

#define FINGERPRINT_RX 16
#define FINGERPRINT_TX 17



HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

lv_obj_t *label_status;
bool readingFingerprint = false;

WiFiClient tcpClient;
WiFiUDP udpClient;

void touchscreen_read(lv_indev_drv_t * indev, lv_indev_data_t * data) {
    if (touchscreen.tirqTouched() && touchscreen.touched()) {
        TS_Point p = touchscreen.getPoint();
        int x = map(p.x, 200, 3700, 0, SCREEN_WIDTH);
        int y = map(p.y, 240, 3800, 0, SCREEN_HEIGHT);
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


void enviarDatoTCP(int id) {
    Serial.print("📤 Enviando ID ");
    Serial.print(id);
    Serial.println(" por TCP...");

    if (!tcpClient.connected()) {
        if (!tcpClient.connect(EC2_IP, TCP_PORT)) {
            Serial.println("❌ Error al conectar al servidor TCP.");
            return;
        }
        Serial.println("✅ Conectado al servidor TCP");
    }

    tcpClient.print(String(id));
    tcpClient.flush();
    Serial.println("✅ ID enviado por TCP.");
    tcpClient.stop();
}

void enviarDatoUDP(int id) {
    Serial.print("📤 Enviando ID ");
    Serial.print(id);
    Serial.println(" por UDP...");

    if (udpClient.beginPacket(EC2_IP, UDP_PORT)) {
        udpClient.print(String(id));
        udpClient.endPacket();
        Serial.println("✅ ID enviado por UDP.");
    } else {
        Serial.println("❌ Error al enviar el paquete UDP.");
    }
}


void readFingerprint() {
    Serial.println("Coloca tu dedo en el sensor");
    lv_label_set_text(label_status, "Inserte su huella");
    lv_task_handler();

    while (finger.getImage() != FINGERPRINT_OK) {
        delay(100);
    }

    Serial.println("Dedo detectado, iniciando lectura...");

    int intentos = 0;
    while (intentos < 4) {
        int id = getFingerprintID();
        if (id >= 0) {
            Serial.print("Huella reconocida, ID: ");
            Serial.println(id);
            char msg[40];
            snprintf(msg, sizeof(msg), "Huella reconocida, ID: %d", id);
            lv_label_set_text(label_status, msg);
            lv_task_handler();
            delay(2000);
            enviarDatoTCP(id);
            enviarDatoUDP(id);
            lv_label_set_text(label_status, "Inserte su huella");
            lv_task_handler();
            return;
        }
        intentos++;
        delay(800);
    }

    lv_label_set_text(label_status, "Huella no registrada");
    lv_task_handler();
    delay(1000);
    lv_label_set_text(label_status, "Inserte su huella");
    lv_task_handler();
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

static void btn_fingerprint_event_handler(lv_event_t * e) {
    Serial.println("Fingerprint button pressed");
    lv_label_set_text(label_status, "Coloque su dedo en el sensor...");
    lv_task_handler();
    readingFingerprint = true;
}

void lv_create_main_gui(void) {
    lv_obj_t * text_label = lv_label_create(lv_scr_act());
    lv_label_set_text(text_label, "Escoja un modo");
    lv_obj_align(text_label, LV_ALIGN_TOP_MID, 0, 20);
    
    lv_obj_t * btn_fingerprint = lv_btn_create(lv_scr_act());
    lv_obj_set_size(btn_fingerprint, 120, 50);
    lv_obj_align(btn_fingerprint, LV_ALIGN_CENTER, 0, -30);
    lv_obj_set_style_bg_color(btn_fingerprint, lv_palette_main(LV_PALETTE_RED), LV_PART_MAIN);
    lv_obj_add_event_cb(btn_fingerprint, btn_fingerprint_event_handler, LV_EVENT_CLICKED, NULL);
    
    lv_obj_t * label_fingerprint = lv_label_create(btn_fingerprint);
    lv_label_set_text(label_fingerprint, "Fingerprint");
    lv_obj_center(label_fingerprint);
    
    label_status = lv_label_create(lv_scr_act());
    lv_label_set_text(label_status, "Seleccione un modo");
    lv_obj_align(label_status, LV_ALIGN_CENTER, 0, 40);
}
//k
void setup() {
    Serial.begin(115200);
    WiFi.begin(SSID, PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\n✅ Conectado a WiFi");
    udpClient.begin(UDP_PORT);
    
    lv_init();
    tft.begin();
    tft.setRotation(2);
    lv_disp_draw_buf_init(&draw_buf, buf, NULL, SCREEN_WIDTH * 10);
    static lv_disp_drv_t disp_drv;
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = SCREEN_WIDTH;
    disp_drv.ver_res = SCREEN_HEIGHT;
    disp_drv.flush_cb = my_disp_flush;
    disp_drv.draw_buf = &draw_buf;
    lv_disp_drv_register(&disp_drv);
    
    touchscreenSPI.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
    touchscreen.begin(touchscreenSPI);
    touchscreen.setRotation(2);
    static lv_indev_drv_t indev_drv;
    lv_indev_drv_init(&indev_drv);
    indev_drv.type = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = touchscreen_read;
    lv_indev_drv_register(&indev_drv);
    
    mySerial.begin(57600, SERIAL_8N1, FINGERPRINT_RX, FINGERPRINT_TX);
    finger.begin(57600);
    
    lv_create_main_gui();
}

void loop() {
    lv_timer_handler();
    delay(5);
    if (readingFingerprint) {
        readFingerprint();
    }
}

