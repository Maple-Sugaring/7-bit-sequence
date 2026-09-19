"""Waveshare SX1262 UART LoRa HAT driver (915 MHz).

Configuration protocol matches the vendor Raspberry Pi demo. M0=BCM22 and
M1=BCM27: M1 high enters register-write mode, both low is normal RX/TX.
"""

from __future__ import annotations

import time

import serial

try:
    import RPi.GPIO as GPIO
except ImportError:  # pragma: no cover - only present on the Pi
    GPIO = None


class Sx126x:
    M0 = 22
    M1 = 27

    UART_BAUD_9600 = 0x60
    AIR_SPEED = {
        1200: 0x01,
        2400: 0x02,
        4800: 0x03,
        9600: 0x04,
        19200: 0x05,
        38400: 0x06,
        62500: 0x07,
    }
    POWER = {22: 0x00, 17: 0x01, 13: 0x02, 10: 0x03}
    BUFFER = {240: 0x00, 128: 0x40, 64: 0x80, 32: 0xC0}

    def __init__(
        self,
        serial_num: str,
        freq: int = 915,
        addr: int = 0,
        power: int = 22,
        rssi: bool = True,
        air_speed: int = 9600,
        net_id: int = 0,
        buffer_size: int = 240,
        crypt: int = 0,
    ) -> None:
        if GPIO is None:
            raise RuntimeError(
                "RPi.GPIO is not available. Run this on the Raspberry Pi, "
                "or install python3-rpi.gpio."
            )

        self.rssi = rssi
        self.addr = addr
        self.freq = freq
        self.serial_n = serial_num
        self.power = power
        self.start_freq = 850 if freq > 850 else 410
        self.offset_freq = freq - self.start_freq

        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(self.M0, GPIO.OUT)
        GPIO.setup(self.M1, GPIO.OUT)
        GPIO.output(self.M0, GPIO.LOW)
        GPIO.output(self.M1, GPIO.HIGH)

        self.ser = serial.Serial(serial_num, 9600, timeout=0.2)
        self.ser.flushInput()
        self.set(freq, addr, power, rssi, air_speed, net_id, buffer_size, crypt)

    def set(
        self,
        freq: int,
        addr: int,
        power: int,
        rssi: bool,
        air_speed: int = 9600,
        net_id: int = 0,
        buffer_size: int = 240,
        crypt: int = 0,
    ) -> None:
        GPIO.output(self.M0, GPIO.LOW)
        GPIO.output(self.M1, GPIO.HIGH)
        time.sleep(0.1)

        if freq > 850:
            freq_temp = freq - 850
            self.start_freq = 850
        else:
            freq_temp = freq - 410
            self.start_freq = 410
        self.offset_freq = freq_temp
        self.addr = addr
        self.rssi = rssi

        rssi_temp = 0x80 if rssi else 0x00
        cfg = [0xC2, 0x00, 0x09, 0x00, 0x00, 0x00, 0x62, 0x00, 0x17, 0x43, 0x00, 0x00]
        cfg[3] = (addr >> 8) & 0xFF
        cfg[4] = addr & 0xFF
        cfg[5] = net_id & 0xFF
        cfg[6] = self.UART_BAUD_9600 + self.AIR_SPEED[air_speed]
        cfg[7] = self.BUFFER[buffer_size] + self.POWER[power] + 0x20
        cfg[8] = freq_temp
        cfg[9] = 0x43 + rssi_temp
        cfg[10] = (crypt >> 8) & 0xFF
        cfg[11] = crypt & 0xFF

        self.ser.flushInput()
        configured = False
        for _ in range(2):
            self.ser.write(bytes(cfg))
            time.sleep(0.2)
            if self.ser.inWaiting() > 0:
                time.sleep(0.1)
                reply = self.ser.read(self.ser.inWaiting())
                if reply and reply[0] == 0xC1:
                    configured = True
                    break
            self.ser.flushInput()
            time.sleep(0.2)

        GPIO.output(self.M0, GPIO.LOW)
        GPIO.output(self.M1, GPIO.LOW)
        time.sleep(0.1)

        if not configured:
            raise RuntimeError(
                "LoRa HAT did not accept configuration. Check jumpers on B, "
                f"M0/M1, and serial device {self.serial_n}."
            )

    def receive_bytes(self) -> bytes | None:
        if self.ser.inWaiting() <= 0:
            return None
        time.sleep(0.35)
        return self.ser.read(self.ser.inWaiting())

    def close(self) -> None:
        try:
            self.ser.close()
        except Exception:
            pass
        try:
            GPIO.cleanup()
        except Exception:
            pass
