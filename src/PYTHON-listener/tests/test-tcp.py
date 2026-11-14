import socket
import struct
from tests.test_teltonika import CODEC_8_SAMPLE

host = "alzxy-145-116-248-140.run.pinggy-free.link"
port = 43627
imei = b"356307042441013"
with socket.create_connection((host, port), timeout=20) as tracker:
    tracker.settimeout(20)
    tracker.sendall(struct.pack(">H", len(imei)) + imei)
    handshake_ack = tracker.recv(1)
    print("IMEI handshake ACK:", handshake_ack.hex())
    assert handshake_ack == b"\x01", "FMC920 handshake was rejected"
    tracker.sendall(CODEC_8_SAMPLE)
    avl_ack = bytearray()
    while len(avl_ack) < 4:
        part = tracker.recv(4 - len(avl_ack))
        if not part:
            raise ConnectionError("Tunnel closed before AVL acknowledgement")
        avl_ack.extend(part)
    record_count = struct.unpack(">I", avl_ack)[0]
    print("AVL acknowledgement:", bytes(avl_ack).hex(), "accepted records:", record_count)
    assert record_count == 1, "Expected one acknowledged AVL record"
print("PASS: simulated FMC920 reached the app through Pinggy TCP")