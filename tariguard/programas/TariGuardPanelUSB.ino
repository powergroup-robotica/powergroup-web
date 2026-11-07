// Arduino UNO R3, LCD1602 con adaptador PCF8574 habitual.
// SCL a D8; SDA a D9; VCC a 5V del UNO; GND a GND del UNO.
// micro:bit P0/TX -> D10/RX, GND comun. D11 queda SIN CONECTAR.
// Cada placa se alimenta por su propio USB. No unir 5V del UNO a micro:bit.
// Instalar SoftwareWire (Testato). No utiliza LiquidCrystal_I2C.
// DHT22 DATA=D4. OLED SSD1306: SDA=A4, SCL/SCK=A5, muestra ambiente.
// LCD1602: SDA=D9, SCL=D8, muestra angulo e indice de agua.
// Usar microbit/tariguard_emisora_radio.py para UART y radio integrada.
// pH mostrado: SIMULACION de demostracion, no lectura de un sensor.
// DS18B20: DATA=D2, VDD=5V, GND comun; resistencia 4.7k entre DATA y 5V.
#include <OneWire.h>
#include <EEPROM.h>
#include <SoftwareWire.h>
#include <SoftwareSerial.h>
#include <stdlib.h>
#include <math.h>
#include <DHT.h>
#include <Wire.h>
#include <U8x8lib.h>

SoftwareWire bus(9, 8); // Orden del constructor: SDA, SCL.
byte direccion = 0;
SoftwareSerial microbit(10, 11); // RX, TX (TX no se conecta).
char paquete[40];
byte usados = 0;
bool recibiendo = false, hayDatos = false;
float angulo = 0;
int humedadSustrato = -1;
struct CalibracionAgua {
  uint16_t marca;
  int seco;
  int mojado;
};
const uint16_t MARCA_AGUA = 0xA719;
CalibracionAgua calibracion;
int secoPendiente = -1;

bool aguaCalibrada() {
  return calibracion.marca == MARCA_AGUA &&
         calibracion.seco >= 0 && calibracion.seco <= 1023 &&
         calibracion.mojado >= 0 && calibracion.mojado <= 1023 &&
         abs(calibracion.mojado - calibracion.seco) >= 10;
}

unsigned long ultimaHumedadOLED = 0;
unsigned long eventos = 0, ultimoDato = 0, ultimaPantalla = 0;
DHT dht(4, DHT22);
U8X8_SSD1306_128X64_NONAME_HW_I2C oled(U8X8_PIN_NONE);
bool oledOK = false, actualizarOLED = true;
float temperatura = 0, humedad = 0;
bool dhtLeido = false, dhtOK = false;
unsigned long ultimaLecturaDht = 0, ultimoCaracter = 0;
OneWire sustrato(2);
bool convirtiendo = false, sustratoLeido = false, sustratoOK = false;
float temperaturaSustrato = 0;
unsigned long inicioConversion = 0, ultimoSustrato = 0;
int phDecimas = 70, pasoPH = 1;
unsigned long ultimoPH = 0;

void calibrarAguaPorSerie() {
  while (Serial.available()) {
    char orden = Serial.read();
    if (orden != 's' && orden != 'm') continue;
    if (humedadSustrato < 0 || millis() - ultimoDato > 2500) {
      Serial.println(F("Calibracion: sin lectura de micro:bit."));
      continue;
    }
    if (orden == 's') {
      secoPendiente = humedadSustrato;
      Serial.print(F("Seco registrado: "));
      Serial.println(secoPendiente);
      continue;
    }
    if (secoPendiente < 0) {
      Serial.println(F("Primero enviar s con la sonda seca."));
    } else if (abs(humedadSustrato - secoPendiente) < 10) {
      Serial.println(F("Lecturas casi iguales. Revisar sonda y repetir m."));
    } else {
      calibracion.marca = MARCA_AGUA;
      calibracion.seco = secoPendiente;
      calibracion.mojado = humedadSustrato;
      EEPROM.put(0, calibracion);
      secoPendiente = -1;
      Serial.print(F("Calibracion guardada. Mojado: "));
      Serial.println(calibracion.mojado);
    }
  }
}

unsigned long ultimaTelemetria = 0;

// USB a la computadora. ? indica lectura no disponible.
// TG1|A|aire C|aire HR|sustrato C|pH simulado|agua calibrada 0-100
void emitirTelemetriaUSB() {
  if (millis() - ultimaTelemetria < 2500) return;
  ultimaTelemetria = millis();
  Serial.print(F("TG1|A|"));
  if (dhtOK) Serial.print(temperatura, 1); else Serial.print('?');
  Serial.print('|');
  if (dhtOK) Serial.print(humedad, 1); else Serial.print('?');
  Serial.print('|');
  if (sustratoOK) Serial.print(temperaturaSustrato, 1); else Serial.print('?');
  Serial.print('|');
  Serial.print(phDecimas / 10.0f, 1);
  Serial.print('|');
  if (aguaCalibrada() && humedadSustrato >= 0 &&
      millis() - ultimoDato <= 2500) {
    long indice = map(humedadSustrato, calibracion.seco, calibracion.mojado, 0, 100);
    Serial.print(constrain(indice, 0L, 100L));
  } else Serial.print('?');
  Serial.println();
}

void simularPH() {
  if (millis() - ultimoPH < 6000) return;
  ultimoPH = millis();
  phDecimas += pasoPH;
  if (phDecimas >= 72) { phDecimas = 72; pasoPH = -1; }
  if (phDecimas <= 68) { phDecimas = 68; pasoPH = 1; }
  actualizarOLED = true;
  Serial.print(F("PH_SIMULADO (no medido): "));
  Serial.println(phDecimas / 10.0f, 1);
}

// Un DS18B20 con alimentacion externa. Conversion asincrona a 12 bits.
// Las transacciones se hacen en huecos del enlace de la micro:bit.
void leerSustrato() {
  unsigned long ahora = millis();
  unsigned long edad = ahora - ultimoDato;
  bool hueco = !recibiendo && ((!hayDatos || edad > 2500) ||
                               (edad >= 120 && edad < 250));
  if (!hueco) return;
  if (!convirtiendo) {
    if (sustratoLeido && ahora - ultimoSustrato < 2500) return;
    ultimoSustrato = ahora;
    if (!sustrato.reset()) {
      Serial.println(F("DS18B20: no responde en D2. Revisar DATA, GND, 5V y resistencia 4.7k."));
      sustratoLeido = true;
      sustratoOK = false;
      actualizarOLED = true;
      return;
    }
    sustrato.skip();
    sustrato.write(0x44, 0);
    inicioConversion = millis();
    convirtiendo = true;
    return;
  }
  if (ahora - inicioConversion < 800) return;
  convirtiendo = false;
  sustratoLeido = true;
  sustratoOK = false;
  actualizarOLED = true;
  if (!sustrato.reset()) {
    Serial.println(F("DS18B20: desconectado al leer."));
    return;
  }
  sustrato.skip();
  sustrato.write(0xBE);
  byte datos[9];
  for (byte i = 0; i < 9; ++i) datos[i] = sustrato.read();
  if (OneWire::crc8(datos, 8) != datos[8]) {
    Serial.println(F("DS18B20: error CRC. Revisar contactos, resistencia y cableado."));
    return;
  }
  int16_t bruto = (int16_t)((uint16_t)datos[1] << 8 | datos[0]);
  // Respetar resolucion configurada en el sensor.
  byte cfg = datos[4] & 0x60;
  if (cfg == 0x00) bruto &= ~7;
  else if (cfg == 0x20) bruto &= ~3;
  else if (cfg == 0x40) bruto &= ~1;
  temperaturaSustrato = bruto / 16.0f;
  sustratoOK = temperaturaSustrato >= -55 && temperaturaSustrato <= 125;
  if (sustratoOK) {
    Serial.print(F("Temp sustrato: "));
    Serial.print(temperaturaSustrato, 1);
    Serial.println(F(" C"));
  }
}

void mostrarAmbienteOLED() {
  if (!oledOK || !actualizarOLED) return;
  actualizarOLED = false;
  oled.clearDisplay();
  oled.drawString(0, 0, "TARIGUARD");
  char numero[9], linea[17];
  if (dhtOK) {
    dtostrf(humedad, 5, 1, numero);
    snprintf(linea, sizeof(linea), "Hum aire:%s%%", numero);
    oled.drawString(0, 1, linea);
    dtostrf(temperatura, 5, 1, numero);
    snprintf(linea, sizeof(linea), "T aire:%s C", numero);
    oled.drawString(0, 2, linea);
  } else {
    oled.drawString(0, 1, dhtLeido ? "DHT22 SIN DATOS" : "Iniciando DHT22");
  }
  recibirDatos();
  if (sustratoOK) {
    dtostrf(temperaturaSustrato, 5, 1, numero);
    snprintf(linea, sizeof(linea), "Sustr:%s C", numero);
    oled.drawString(0, 4, linea);
  } else {
    oled.drawString(0, 4, "Sustr: --.- C");
  }
  recibirDatos();
  snprintf(linea, sizeof(linea), "pH: %d.%d SIM", phDecimas / 10, phDecimas % 10);
  oled.drawString(0, 6, linea);
  if (humedadSustrato >= 0 && millis() - ultimoDato <= 2500) {
    snprintf(linea, sizeof(linea), "Hum sustr:%d", humedadSustrato);
    oled.drawString(0, 5, linea);
  } else {
    oled.drawString(0, 5, "Hum sustr: --");
  }

}

void leerAmbiente() {
  // Esperar a un hueco entre mensajes: la lectura DHT desactiva interrupciones
  // brevemente y podria perder datos de SoftwareSerial si llegan a la vez.
  unsigned long ahora = millis();
  if (ahora - ultimaLecturaDht < 2500) return;
  if (recibiendo) return;
  unsigned long edad = ahora - ultimoDato;
  bool hueco = hayDatos && edad >= 30 && edad < 100;
  bool sinEnlace = !hayDatos || edad > 2500;
  if (!hueco && !sinEnlace) return;
  ultimaLecturaDht = ahora;
  humedad = dht.readHumidity();
  temperatura = dht.readTemperature();
  dhtLeido = true;
  actualizarOLED = true;
  dhtOK = isfinite(humedad) && isfinite(temperatura) && humedad >= 0 && humedad <= 100;
  if (dhtOK) {
    Serial.print(F("Temp aire: ")); Serial.print(temperatura, 1);
    Serial.print(F(" C | Humedad aire: ")); Serial.print(humedad, 1);
    Serial.println(F(" % HR"));
  } else Serial.println(F("DHT22: lectura fallida. Revisar conexion DATA D4."));
}

void procesarPaquete() {
  char *fin;
  double valor = strtod(paquete, &fin);
  if (fin == paquete || *fin != ',' || !isfinite(valor) || valor < 0 || valor > 180) return;
  char *inicioNumero = fin + 1;
  if (*inicioNumero < '0' || *inicioNumero > '9') return;
  unsigned long cantidad = strtoul(inicioNumero, &fin, 10);
  int lectura = -1;
  if (*fin == ',') {
    const char *inicioHumedad = fin + 1;
    if (*inicioHumedad < '0' || *inicioHumedad > '9') return;
    unsigned long bruto = strtoul(inicioHumedad, &fin, 10);
    if (bruto > 1023) return;
    lectura = (int)bruto;
  }
  if (*fin != '\0') return;
  if ((lectura >= 0) != (humedadSustrato >= 0) ||
      millis() - ultimaHumedadOLED >= 1500) {
    actualizarOLED = true;
    ultimaHumedadOLED = millis();
  }
  humedadSustrato = lectura;
  angulo = valor;
  eventos = cantidad;
  ultimoDato = millis();
  hayDatos = true;
  Serial.print(F("Angulo: ")); Serial.print(angulo, 1);
  Serial.print(F(" grados | Eventos: ")); Serial.print(eventos);
  if (lectura >= 0) {
    Serial.print(F(" | Hum sustrato (0-1023): ")); Serial.print(lectura);
  }
  Serial.println();
}

void recibirDatos() {
  if (recibiendo && millis() - ultimoCaracter > 100) recibiendo = false;
  while (microbit.available()) {
    char c = microbit.read();
    ultimoCaracter = millis();
    if (c == '@') { recibiendo = true; usados = 0; }
    else if (recibiendo && c == '\n') {
      paquete[usados] = '\0';
      procesarPaquete();
      recibiendo = false;
    } else if (recibiendo && c != '\r') {
      if (usados < sizeof(paquete) - 1) paquete[usados++] = c;
      else recibiendo = false;
    }
  }
}

bool responde(byte addr) {
  bus.beginTransmission(addr);
  return bus.endTransmission() == 0;
}

void escribirPuerto(byte valor) {
  bus.beginTransmission(direccion);
  bus.write(valor);
  bus.endTransmission();
}

void nibble(byte valor) {
  valor |= 0x08; // Luz de fondo. Mapeo PCF habitual.
  escribirPuerto(valor);
  escribirPuerto(valor | 0x04); // EN=1
  delayMicroseconds(2);
  escribirPuerto(valor & ~0x04); // EN=0
  delayMicroseconds(60);
}

void enviar(byte valor, bool dato = false) {
  byte rs = dato ? 1 : 0;
  nibble((valor & 0xF0) | rs);
  nibble(((valor << 4) & 0xF0) | rs);
}

void fila(byte numero, const char *texto) {
  enviar(numero == 0 ? 0x80 : 0xC0);
  byte i = 0;
  while (*texto && i < 16) { enviar(*texto++, true); ++i; }
  while (i++ < 16) enviar(' ', true);
}

void setup() {
  Serial.begin(9600);
  EEPROM.get(0, calibracion);
  pinMode(LED_BUILTIN, OUTPUT);
  Wire.begin();
  byte direccionOLED = 0;
  for (byte a = 0x3C; a <= 0x3D; ++a) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { direccionOLED = a; break; }
  }
  oledOK = direccionOLED != 0;
  if (oledOK) {
    oled.setI2CAddress(direccionOLED << 1);
    oled.begin();
    oled.setPowerSave(0);
    oled.setFont(u8x8_font_chroma48medium8_r);
    Serial.println(F("OLED detectada en SDA=A4, SCL=A5."));
  } else Serial.println(F("OLED no detectada en A4/A5. LCD sigue funcionando."));
  dht.begin();
  ultimaLecturaDht = millis();
  bus.begin();
  bus.setClock(100000);
  delay(100);
  Serial.println(F("Bus LCD: SCL=D8, SDA=D9"));
  for (byte a = 1; a < 127; ++a) {
    if (responde(a)) {
      Serial.print(F("Encontrado: 0x")); Serial.println(a, HEX);
      if (!direccion && ((a >= 0x20 && a <= 0x27) ||
                         (a >= 0x38 && a <= 0x3F))) direccion = a;
    }
  }
  if (!direccion) {
    Serial.println(F("LCD no encontrado. Revisar VCC, GND, SDA y SCL."));
  }
  if (direccion) {
  Serial.print(F("Probando LCD en 0x")); Serial.println(direccion, HEX);
  // HD44780: inicializar a 4 bits.
  nibble(0x30); delay(5);
  nibble(0x30); delay(5);
  nibble(0x30); delay(1);
  nibble(0x20); delay(1);
  enviar(0x28); // 2 filas, 4 bits.
  enviar(0x08); // Apagar texto durante inicializacion.
  enviar(0x01); delay(3); // Limpiar.
  enviar(0x06); // Avance del cursor.
  enviar(0x0C); // Texto encendido, cursor oculto.
  fila(0, "TARIGUARD");
  fila(1, "Esperando datos");
  }
  microbit.begin(9600);
  // SoftwareSerial activa un pull-up de 5 V en RX: quitarlo para no
  // llevar esa tension a la salida de la micro:bit.
  digitalWrite(10, LOW);
  Serial.println(F("Esperando micro:bit en D10 a 9600 baudios."));
  mostrarAmbienteOLED();
}

void loop() {
  recibirDatos();
  calibrarAguaPorSerie();
  emitirTelemetriaUSB();
  simularPH();
  leerSustrato();
  recibirDatos();
  leerAmbiente();
  recibirDatos();
  if (humedadSustrato >= 0 && millis() - ultimoDato > 2500) {
    humedadSustrato = -1;
    actualizarOLED = true;
  }
  mostrarAmbienteOLED();
  recibirDatos();
  bool enlaceOK = hayDatos && millis() - ultimoDato <= 2500;
  digitalWrite(LED_BUILTIN, enlaceOK && angulo >= 5);
  if (!direccion) return;
  if (millis() - ultimaPantalla < 250) return;
  ultimaPantalla = millis();
  if (!enlaceOK) {
    fila(0, "SIN DATOS");
    fila(1, "Revisar microbit");
  } else {
    char numero[9], texto[17];
    dtostrf(angulo, 5, 1, numero);
    snprintf(texto, sizeof(texto), "Angulo:%s deg", numero);
    fila(0, texto);
    recibirDatos();
    if (humedadSustrato >= 0) {
      if (aguaCalibrada()) {
        long indice = map(humedadSustrato, calibracion.seco, calibracion.mojado, 0, 100);
        snprintf(texto, sizeof(texto), "Agua: %d/100", (int)constrain(indice, 0L, 100L));
      } else {
        snprintf(texto, sizeof(texto), "Agua: calibrar");
      }
    } else {
      snprintf(texto, sizeof(texto), "Agua: --");
    }
    fila(1, texto);
  }
}
