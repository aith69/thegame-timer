#!/usr/bin/env python3
"""The Game timer: a tiny LAN web app. Python standard library only.

State is an append-only CSV of UTC timestamps. The timer is always
"now - last event", so it stays correct while the host is switched off.
"""
import calendar
import csv
import json
import os
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
HOST = os.environ.get("THEGAME_HOST", "0.0.0.0")
PORT = int(os.environ.get("THEGAME_PORT", "8080"))
DATA_FILE = Path(os.environ.get("THEGAME_DATA", BASE / "data" / "losses.csv"))

TS_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
EVENTS = ("start", "lost")
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
}

lock = threading.Lock()


def now_ms():
    return int(time.time() * 1000)


def append_event(kind):
    """Append one row to the CSV, creating the file (with header) if needed."""
    line = f"{datetime.now(timezone.utc).strftime(TS_FORMAT)},{kind}\n"
    with lock:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        new = not DATA_FILE.exists() or DATA_FILE.stat().st_size == 0
        prefix = "timestamp,event\n" if new else ""
        if not new:
            # Be tolerant of a hand-edited file that lacks a trailing newline.
            with DATA_FILE.open("rb") as f:
                f.seek(-1, os.SEEK_END)
                if f.read(1) != b"\n":
                    prefix = "\n"
        with DATA_FILE.open("a", newline="") as f:
            f.write(prefix + line)
            f.flush()
            os.fsync(f.fileno())


def parse_events():
    events = []
    with lock:
        if DATA_FILE.exists():
            with DATA_FILE.open(newline="") as f:
                for row in csv.reader(f):
                    if len(row) < 2:
                        continue
                    kind = row[1].strip().lower()
                    try:
                        t = calendar.timegm(time.strptime(row[0].strip(), TS_FORMAT)) * 1000
                    except ValueError:
                        continue  # header or junk line
                    if kind in EVENTS:
                        events.append({"t": t, "type": kind})
    events.sort(key=lambda e: e["t"])
    return events


def load_events():
    """All events; on the very first run this records the initial 'start'."""
    events = parse_events()
    if not events:
        append_event("start")
        events = parse_events()
    return events


def state():
    events = load_events()
    return {
        "now": now_ms(),
        "since": events[-1]["t"],
        "losses": sum(1 for e in events if e["type"] == "lost"),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "TheGame/1.0"

    def _send(self, code, body, ctype, headers=None):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj), "application/json", {"Cache-Control": "no-store"})

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/api/state":
            return self._json(state())
        if path == "/api/events":
            return self._json({"now": now_ms(), "events": load_events()})
        if path == "/api/export.csv":
            load_events()
            with lock:
                data = DATA_FILE.read_bytes()
            return self._send(
                200, data, "text/csv; charset=utf-8",
                {"Content-Disposition": 'attachment; filename="thegame.csv"', "Cache-Control": "no-store"},
            )
        name = {"/": "index.html", "/stats": "stats.html"}.get(path, path.lstrip("/"))
        file = (STATIC / name).resolve()
        if file.parent != STATIC or not file.is_file() or file.suffix not in CONTENT_TYPES:
            return self._send(404, "Not found", "text/plain")
        self._send(200, file.read_bytes(), CONTENT_TYPES[file.suffix], {"Cache-Control": "no-cache"})

    do_HEAD = do_GET

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/lost":
            return self._send(404, "Not found", "text/plain")
        # A custom header can't be set by a plain cross-site form post.
        if self.headers.get("X-Requested-With") != "thegame":
            return self._json({"error": "forbidden"}, 403)
        load_events()  # make sure the initial 'start' row exists
        append_event("lost")
        self._json(state())


def main():
    load_events()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"The Game timer on http://{HOST}:{PORT}  (data: {DATA_FILE})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
