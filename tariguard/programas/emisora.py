# LM393 a 3V: AO a P2 y GND comun.
# MicroPython para micro:bit V1/V2. Transmision unidireccional:
# P0 (TX) -> D10 (RX) del Arduino UNO R3; GND -> GND.
# NO conectar D11/TX ni 5V del Arduino a la micro:bit.
from microbit import accelerometer, button_a, button_b, uart, pin0, pin1, pin2, display, sleep
from math import sqrt, acos, pi
import radio

radio.config(group=42, channel=7, length=128, queue=3,
             data_rate=radio.RATE_1MBIT, power=6)
radio.on()

# Pin1 queda sin conectar. UART deja de estar disponible por USB.
uart.init(baudrate=9600, bits=8, parity=None, stop=1, tx=pin0, rx=pin1)

def reference():
    display.show('C')
    sleep(500)
    x = y = z = 0
    for _ in range(20):
        a, b, c = accelerometer.get_values()
        x += a
        y += b
        z += c
        sleep(25)
    length = sqrt(x*x + y*y + z*z)
    if length < 1:
        raise RuntimeError('Mantener quieto para calibrar')
    display.clear()
    return x/length, y/length, z/length

base = reference()
filtered = accelerometer.get_values()
events = 0
tilted = False
last_angle = 0.0
tick = 0
while True:
    if button_a.was_pressed():
        base = reference()
        filtered = accelerometer.get_values()
        tilted = False
    if button_b.was_pressed():
        events = 0
    sample = accelerometer.get_values()
    filtered = tuple(0.7*old + 0.3*new for old, new in zip(filtered, sample))
    x, y, z = filtered
    length = sqrt(x*x + y*y + z*z)
    if length > 1:
        dot = (x*base[0] + y*base[1] + z*base[2]) / length
        last_angle = acos(max(-1.0, min(1.0, dot))) * 180 / pi
        if last_angle >= 5 and not tilted:
            events += 1
            tilted = True
        elif last_angle <= 3:
            tilted = False
        # Un paquete cada ~500 ms. @ permite resincronizar el receptor.
        if tick % 5 == 0:
            humedad = sum(pin2.read_analog() for _ in range(8)) // 8
            uart.write('@%.1f,%d,%d\n' % (last_angle, events, humedad))
            radio.send('TG1|M|%.1f|%d|%d' % (last_angle, events, humedad))
            display.set_pixel(2, 2, 9 if tilted else 2)
    tick = (tick + 1) % 5
    sleep(100)
