import asyncio
import logging
import struct
from datetime import datetime, timezone
from typing import Any

from listener.storage import forward_to_website, save_records_to_csv


logger = logging.getLogger(__name__)
SUPPORTED_CODECS = {0x08, 0x8E}
MAX_DATA_LENGTH = 4096


class PacketError(ValueError):
    """Raised when an AVL packet is malformed or unsupported."""


def _read_uint(data: bytes, offset: int, width: int) -> tuple[int, int]:
    end = offset + width
    if end > len(data):
        raise PacketError("AVL packet ended inside an IO element")
    return int.from_bytes(data[offset:end], "big"), end


def _crc16_ibm(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def _skip_io_elements(data: bytes, offset: int, codec_id: int) -> int:
    count_width = 1 if codec_id == 0x08 else 2
    id_width = count_width
    _, offset = _read_uint(data, offset, count_width)
    total_count, offset = _read_uint(data, offset, count_width)
    parsed_count = 0

    for value_width in (1, 2, 4, 8):
        count, offset = _read_uint(data, offset, count_width)
        parsed_count += count
        block_size = count * (id_width + value_width)
        if offset + block_size > len(data):
            raise PacketError("AVL packet ended inside a fixed-size IO block")
        offset += block_size

    if codec_id == 0x8E:
        variable_count, offset = _read_uint(data, offset, 2)
        parsed_count += variable_count
        for _ in range(variable_count):
            _, offset = _read_uint(data, offset, 2)
            value_length, offset = _read_uint(data, offset, 2)
            if offset + value_length > len(data):
                raise PacketError("AVL packet ended inside a variable-size IO value")
            offset += value_length

    if parsed_count != total_count:
        raise PacketError("IO element counts do not match the declared total")
    return offset


def parse_avl_packet(data: bytes, imei: str) -> tuple[int, list[dict[str, Any]]]:
    """Validate and decode a Teltonika TCP Codec 8 or Codec 8E packet."""
    if len(data) < 15:
        raise PacketError("AVL packet is shorter than its minimum size")

    preamble, data_length = struct.unpack_from(">II", data)
    if preamble != 0:
        raise PacketError("Invalid AVL packet preamble")
    if data_length < 3 or data_length > MAX_DATA_LENGTH:
        raise PacketError("Invalid AVL data-field length")
    if len(data) != 8 + data_length + 4:
        raise PacketError("AVL packet length does not match its header")

    data_end = 8 + data_length
    crc_value = struct.unpack_from(">I", data, data_end)[0] & 0xFFFF
    if _crc16_ibm(data[8:data_end]) != crc_value:
        raise PacketError("AVL packet CRC check failed")

    codec_id = data[8]
    if codec_id not in SUPPORTED_CODECS:
        raise PacketError(f"Unsupported Codec ID: 0x{codec_id:02X}")

    record_count = data[9]
    records: list[dict[str, Any]] = []
    offset = 10
    record_end = data_end - 1

    for _ in range(record_count):
        if offset + 24 > record_end:
            raise PacketError("AVL packet ended inside a GPS element")
        timestamp_ms, _, raw_lon, raw_lat, altitude, angle, satellites, speed = (
            struct.unpack_from(">QBiiHHBH", data, offset)
        )
        offset += 24
        offset = _skip_io_elements(data, offset, codec_id)
        if offset > record_end:
            raise PacketError("AVL IO elements overlap the packet record count")

        timestamp = datetime.fromtimestamp(
            timestamp_ms / 1000, tz=timezone.utc
        ).isoformat()
        records.append(
            {
                "imei": imei,
                "timestamp": timestamp,
                "latitude": raw_lat / 10_000_000,
                "longitude": raw_lon / 10_000_000,
                "altitude": altitude,
                "angle": angle,
                "satellites": satellites,
                "speed_kmh": speed,
            }
        )

    received_count = data[record_end]
    if received_count != record_count:
        raise PacketError("AVL record counts at the start and end do not match")
    if offset != record_end:
        raise PacketError("Unexpected bytes between AVL records and record count")

    return record_count, records


async def read_avl_packet(reader: asyncio.StreamReader) -> bytes:
    """Read exactly one framed AVL packet from a TCP stream."""
    header = await reader.readexactly(8)
    preamble, data_length = struct.unpack(">II", header)
    if preamble != 0:
        raise PacketError("Invalid AVL packet preamble")
    if data_length < 3 or data_length > MAX_DATA_LENGTH:
        raise PacketError("Invalid AVL data-field length")
    return header + await reader.readexactly(data_length + 4)


async def handle_client(
    reader: asyncio.StreamReader, writer: asyncio.StreamWriter
) -> None:
    peer = writer.get_extra_info("peername")
    imei = "unknown"
    logger.info("Incoming Teltonika connection from %s", peer)

    try:
        imei_length = int.from_bytes(await reader.readexactly(2), "big")
        if not 1 <= imei_length <= 32:
            writer.write(b"\x00")
            await writer.drain()
            return

        imei = (await reader.readexactly(imei_length)).decode("ascii")
        if not imei.isdigit():
            writer.write(b"\x00")
            await writer.drain()
            return

        writer.write(b"\x01")
        await writer.drain()
        logger.info("Accepted FMC920 IMEI %s", imei)

        while True:
            try:
                packet = await read_avl_packet(reader)
            except asyncio.IncompleteReadError as error:
                if error.partial:
                    logger.warning("Incomplete AVL packet from %s", imei)
                break

            record_count, records = parse_avl_packet(packet, imei)
            await asyncio.to_thread(save_records_to_csv, records)
            writer.write(struct.pack(">I", record_count))
            await writer.drain()

            if records:
                await asyncio.gather(
                    *(asyncio.to_thread(forward_to_website, record) for record in records)
                )
            logger.info("Received %s AVL record(s) from %s", record_count, imei)
    except (asyncio.IncompleteReadError, UnicodeDecodeError, PacketError) as error:
        logger.warning("Rejected connection from %s (%s): %s", peer, imei, error)
    except Exception:
        logger.exception("Error handling Teltonika connection from %s", peer)
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except ConnectionError:
            pass
        logger.info("Closed Teltonika connection for %s", imei)