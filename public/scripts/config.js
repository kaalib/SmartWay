// scripts/config.js
const CONFIG = {
    SERVER_URL: 'https://smartway.ddns.net',
    WEBSOCKET_URL: 'https://smartway.ddns.net',
    GOOGLE_MAPS_API_KEY: window.ENV && window.ENV.API_KEY1 ? window.ENV.API_KEY1 : null // Usa la clave local si está definida
};

export default CONFIG;