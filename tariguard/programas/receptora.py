# Cargar en la SEGUNDA micro:bit, conectada por USB a la computadora.
# MicroPython para micro:bit V1 y V2. Radio integrada, sin modulos externos.
# Salida USB a 115200 baudios. Grupo 42, canal 7, 1 Mbit/s.
from microbit import display, Image, button_a, running_time, sleep, uart
import radio

uart.init(baudrate=115200)
radio.config(group=42, channel=7, length=128, queue=3,
             data_rate=radio.RATE_1MBIT, power=6)
radio.on()

ultimo = -1
recibidos = 0
ultimo_estado = -2000
display.show('R')
print('TARIGUARD_RECEPTORA_LISTA')

while True:
    if running_time() - ultimo_estado >= 2000:
        print('TGSTATUS|RECEPTORA|%d' % recibidos)
        ultimo_estado = running_time()
    try:
        mensaje = radio.receive()
    except ValueError:
        mensaje = None
    if mensaje and mensaje.startswith('TG1|'):
        # Una linea por paquete. El panel valida campos antes de mostrarlos.
        if len(mensaje) <= 120 and all(32 <= ord(c) <= 126 for c in mensaje):
            print(mensaje)
            recibidos += 1
            ultimo = running_time()
            display.show(Image.YES)
    if ultimo >= 0 and running_time() - ultimo > 5000:
        display.show(Image.NO)
    if button_a.was_pressed():
        print('TARIGUARD_PAQUETES', recibidos)
        display.show('R' if ultimo < 0 else
                     (Image.YES if running_time() - ultimo <= 5000 else Image.NO))
    sleep(10)
