import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from listener.storage import forward_to_website
from listener.teltonika import PacketError, parse_avl_packet, read_avl_packet


CODEC_8_SAMPLE = bytes.fromhex(
    "000000000000003608010000016B40D8EA300100000000000000000000000000000001"
    "05021503010101425E0F01F10000601A014E0000000000000000010000C7CF"
)
CODEC_8E_SAMPLE = bytes.fromhex(
    "000000000000004A8E010000016B412CEE000100000000000000000000000000000000"
    "010005000100010100010011001D00010010015E2C880002000B000000003544C87A"
    "000E000000001DD7E06A00000100002994"
)


class ParseAvlPacketTests(unittest.TestCase):
    def test_decodes_teltonika_codec_8_sample(self) -> None:
        record_count, records = parse_avl_packet(CODEC_8_SAMPLE, "356307042441013")

        self.assertEqual(record_count, 1)
        self.assertEqual(records[0]["imei"], "356307042441013")
        self.assertEqual(records[0]["latitude"], 0)
        self.assertEqual(records[0]["longitude"], 0)
        self.assertEqual(records[0]["speed_kmh"], 0)

    def test_rejects_bad_crc(self) -> None:
        corrupted_packet = CODEC_8_SAMPLE[:-1] + bytes([CODEC_8_SAMPLE[-1] ^ 1])

        with self.assertRaisesRegex(PacketError, "CRC"):
            parse_avl_packet(corrupted_packet, "356307042441013")

    def test_decodes_teltonika_codec_8_extended_sample(self) -> None:
        record_count, records = parse_avl_packet(CODEC_8E_SAMPLE, "352093086403655")

        self.assertEqual(record_count, 1)
        self.assertEqual(records[0]["imei"], "352093086403655")
        self.assertEqual(records[0]["latitude"], 0)
        self.assertEqual(records[0]["longitude"], 0)


class ReadAvlPacketTests(unittest.IsolatedAsyncioTestCase):
    async def test_reads_split_and_consecutive_tcp_frames(self) -> None:
        reader = asyncio.StreamReader()
        reader.feed_data(CODEC_8_SAMPLE[:5])
        reader.feed_data(CODEC_8_SAMPLE[5:] + CODEC_8_SAMPLE)

        first_packet = await read_avl_packet(reader)
        second_packet = await read_avl_packet(reader)

        self.assertEqual(first_packet, CODEC_8_SAMPLE)
        self.assertEqual(second_packet, CODEC_8_SAMPLE)


class WebhookLoggingTests(unittest.TestCase):
    def test_logs_post_payload_when_destination_is_unreachable(self) -> None:
        payload = {"imei": "356307042441013", "latitude": 52.1}
        offline_settings = SimpleNamespace(webhook_url="http://gps.example.test/api/gps")

        with (
            self.assertLogs("listener.storage", level="INFO") as captured,
            patch("listener.storage.settings", offline_settings),
            patch("listener.storage.urllib.request.urlopen", side_effect=OSError("offline")),
        ):
            forward_to_website(payload)

        output = "\n".join(captured.output)
        self.assertIn("POST http://gps.example.test/api/gps", output)
        self.assertIn('"imei": "356307042441013"', output)
        self.assertIn("failed: offline", output)

    def test_logs_when_webhook_is_disabled(self) -> None:
        disabled_settings = SimpleNamespace(webhook_url="")

        with (
            self.assertLogs("listener.storage", level="WARNING") as captured,
            patch("listener.storage.settings", disabled_settings),
        ):
            forward_to_website({"imei": "356307042441013"})

        self.assertIn("Webhook is disabled", captured.output[0])


if __name__ == "__main__":
    unittest.main()