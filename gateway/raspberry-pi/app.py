"""Local page for Heltec gateway USB lines, plus optional /ingest POST."""

from __future__ import annotations

import logging
import os
import threading

from flask import Flask, jsonify, render_template, request

from receiver import PacketStore, load_env, run_receiver

load_env()

store = PacketStore()
app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/packets")
def packets():
    # The page polls with ?since=<last seq> so each poll only carries new packets.
    since = request.args.get("since", default=0, type=int)
    return jsonify(store.snapshot(since=since))


def main() -> None:
    worker = threading.Thread(target=run_receiver, args=(store,), daemon=True)
    worker.start()
    # The page polls every 2 s; per-request access lines would bury the RX log.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    host = os.getenv("DASHBOARD_HOST", "0.0.0.0")
    port = int(os.getenv("DASHBOARD_PORT", "8080"))
    print(f"Gateway USB ingest  http://{host}:{port}", flush=True)
    app.run(host=host, port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
