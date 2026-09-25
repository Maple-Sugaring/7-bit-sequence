"""Local page for Heltec gateway USB lines, plus optional /ingest POST."""

from __future__ import annotations

import os
import threading

from flask import Flask, jsonify, render_template

from receiver import PacketStore, load_env, run_receiver

load_env()

store = PacketStore()
app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/packets")
def packets():
    return jsonify(store.snapshot())


def main() -> None:
    worker = threading.Thread(target=run_receiver, args=(store,), daemon=True)
    worker.start()
    host = os.getenv("DASHBOARD_HOST", "0.0.0.0")
    port = int(os.getenv("DASHBOARD_PORT", "8080"))
    print(f"Gateway USB ingest  http://{host}:{port}", flush=True)
    app.run(host=host, port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
