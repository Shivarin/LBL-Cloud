#!/usr/bin/env python3
"""Локальный просмотр cloud.lbl3d.info/app (маршруты как в nginx-lbl3d-cloud.conf)."""
from __future__ import annotations

import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
PORT = int(os.environ.get("CLOUD_DEV_PORT", "8766"))


class CloudHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        path = path.split("?", 1)[0].split("#", 1)[0]
        rel = path.lstrip("/")

        if rel == "app" or rel.startswith("app/"):
            sub = rel[4:].lstrip("/") if rel != "app" else ""
            if not sub or sub.endswith("/"):
                sub = (sub.rstrip("/") + "/index.html") if sub else "index.html"
            if sub.startswith("css/"):
                return os.path.join(ROOT, "pages", "file", "css", sub[4:])
            if sub.startswith("js/"):
                return os.path.join(ROOT, "pages", "file", "js", sub[3:])
            return os.path.join(ROOT, "pages", "file", "app", sub)

        if rel.startswith("vendor/"):
            return os.path.join(ROOT, rel)
        if rel.startswith("assets/"):
            return os.path.join(ROOT, rel)
        if rel.startswith("js/core/"):
            return os.path.join(ROOT, rel)

        return os.path.join(ROOT, rel or "index.html")

    def log_message(self, fmt: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def main() -> None:
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), CloudHandler)
    print("LBL Cloud dev server")
    print("  root: %s" % ROOT)
    print("  open: http://127.0.0.1:%s/app/?demo=1" % PORT)
    print("  Ctrl+C to stop")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
