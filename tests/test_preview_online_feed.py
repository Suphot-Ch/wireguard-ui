"""Synthetic tests for the preview-only WireGuard online feed."""
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from types import SimpleNamespace

MODULE = pathlib.Path(__file__).parents[1] / "scripts" / "preview_online_feed.py"
spec = importlib.util.spec_from_file_location("preview_online_feed", MODULE)
feed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feed)


class PreviewOnlineFeedTests(unittest.TestCase):
    def test_collect_reads_public_keys_and_handshakes_only(self):
        def fake_run(*args, **kwargs):
            self.assertEqual(args[0], ["docker", "exec", "wireguard", "wg", "show", "wg0", "latest-handshakes"])
            return SimpleNamespace(stdout="pub-A\t1700000000\npub-B\t0\n", returncode=0)
        result = feed.collect(fake_run, now=1700000010)
        self.assertEqual(result, {"generated_at_unix": 1700000010, "peers": {"pub-A": 1700000000, "pub-B": 0}})

    def test_failed_or_empty_read_never_overwrites_a_good_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            dest = pathlib.Path(directory) / "current.json"
            dest.write_text('{"existing":true}', encoding="utf-8")
            def failing(*args, **kwargs):
                return SimpleNamespace(stdout="", returncode=1, stderr="wg0 missing")
            with self.assertRaises(Exception):
                feed.update(dest, failing, now=1700000010)
            self.assertEqual(dest.read_text(encoding="utf-8"), '{"existing":true}')

    def test_successful_write_is_private_and_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            dest = pathlib.Path(directory) / "current.json"
            def fake_run(*args, **kwargs):
                return SimpleNamespace(stdout="pub-A\t1700000000\n", returncode=0)
            feed.update(dest, fake_run, now=1700000010)
            self.assertEqual(json.loads(dest.read_text(encoding="utf-8"))["peers"], {"pub-A": 1700000000})
            if os.name != "nt":
                self.assertEqual(dest.stat().st_mode & 0o077, 0)
            self.assertEqual([p.name for p in pathlib.Path(directory).iterdir()], ["current.json"])


if __name__ == "__main__":
    unittest.main()
