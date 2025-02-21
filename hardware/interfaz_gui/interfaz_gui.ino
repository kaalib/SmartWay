#include <lvgl.h>
#include <TFT_eSPI.h>

// Definir tamaño de la pantalla
#define SCREEN_WIDTH  240
#define SCREEN_HEIGHT 320

TFT_eSPI tft = TFT_eSPI();

// Buffer para el display
static lv_color_t buf[SCREEN_WIDTH * 10];
static lv_disp_draw_buf_t draw_buf;

// Función de actualización de pantalla para LVGL 8
void tft_flush(lv_disp_drv_t *disp_drv, const lv_area_t *area, lv_color_t *color_p) {
    uint16_t w = area->x2 - area->x1 + 1;
    uint16_t h = area->y2 - area->y1 + 1;

    tft.startWrite();
    tft.setAddrWindow(area->x1, area->y1, w, h);
    tft.pushColors((uint16_t *)color_p, w * h, true);
    tft.endWrite();

    lv_disp_flush_ready(disp_drv); // Indicar que se terminó el renderizado
}

void setup() {
    Serial.begin(115200);
    tft.begin();
    tft.setRotation(0);  // Orientación vertical

    lv_init(); // Inicializar LVGL

    // Inicializar buffer de dibujo
    lv_disp_draw_buf_init(&draw_buf, buf, NULL, SCREEN_WIDTH * 10);

    // Configurar el driver de pantalla en LVGL 8
    static lv_disp_drv_t disp_drv;
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = SCREEN_WIDTH;
    disp_drv.ver_res = SCREEN_HEIGHT;
    disp_drv.flush_cb = tft_flush;
    disp_drv.draw_buf = &draw_buf;
    lv_disp_drv_register(&disp_drv);

    // Establecer el fondo blanco
    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN); // Opaque para que no se vea el fondo negro

    // Crear una etiqueta con "Hola Mundo"
    lv_obj_t *label = lv_label_create(lv_scr_act());
    lv_label_set_text(label, "Por favor seleccione un modo");

    // Cambiar el color del texto a negro
    lv_obj_set_style_text_color(label, lv_color_black(), LV_PART_MAIN);

    // Posicionar la etiqueta arriba en el centro
    lv_obj_align(label, LV_ALIGN_TOP_MID, 0, 10);
}

void loop() {
    lv_timer_handler(); // Mantener LVGL funcionando
    delay(5);
}
