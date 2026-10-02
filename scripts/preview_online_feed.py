#!/usr/bin/env python3
"""Preview-only read-only WireGuard status feed; never touches wg configuration.

Run on the Docker host under a private directory. The new UI consumes the output
through a read-only mount; stale files are rejected by its authenticated API.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

COMMAND = ["docker", "exec", "wireguard", "wg", "show", "wg0", "latest-handshakes"]


def collect(run=subprocess.run, now=None):
    now = int(time.time() if now is None else now)
    result = run(COMMAND, capture_output=True, text=True, timeout=12)
    if result.returncode != 0:
        raise RuntimeError("Unable to read wg0; previous snapshot left in place")
    peers = {}
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) != 2 or not fields[0] or not fields[1].isdigit():
            raise ValueError("Invalid wg status; previous snapshot left in place")
        timestamp = int(fields[1])
        if timestamp < 0 or timestamp > now + 60:
            raise ValueError("Invalid handshake time; previous snapshot left in place")
        peers[fields[0]] = timestamp
    if not peers:
        raise RuntimeError("No WireGuard peers; previous snapshot left in place")
    return {"generated_at_unix": now, "peers": peers}


def update(output, run=subprocess.run, now=None):
    dest = Path(output)
    if not dest.is_absolute() or not dest.parent.is_dir() or dest.is_symlink():
        raise ValueError("Output must be a non-symlink file in an existing private directory")
    status = collect(run, now)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix=".online-", suffix=".tmp", dir=dest.parent, delete=False) as tmp:
            tmp_path = Path(tmp.name)
            os.chmod(tmp_path, 0o600)
            json.dump(status, tmp, separators=(",", ":"))
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp_path, dest)
        tmp_path = None
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
    return len(status["peers"])


def main():
    parser = argparse.ArgumentParser(description="Read-only wg0 status for isolated WireGuard UI preview")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    count = update(args.output)
    print("Preview status refreshed for %d peers" % count)


if __name__ == "__main__":
    main()
