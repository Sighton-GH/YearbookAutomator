from __future__ import annotations

import socket
import threading
import time
from typing import Any

import httpx
import uvicorn


class LiveTestClient:
    """Synchronous route-test client backed by a real loopback Uvicorn server."""

    def __init__(self, app: Any):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.bind(("127.0.0.1", 0))
            port = int(probe.getsockname()[1])

        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_level="critical",
            access_log=False,
        )
        self._server = uvicorn.Server(config)
        self._thread = threading.Thread(target=self._server.run, daemon=True)
        self._thread.start()
        deadline = time.monotonic() + 10
        while not self._server.started and self._thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        if not self._server.started:
            raise RuntimeError("Test Uvicorn server did not start")
        self._client = httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=20)

    @property
    def headers(self) -> httpx.Headers:
        return self._client.headers

    @property
    def cookies(self) -> httpx.Cookies:
        return self._client.cookies

    def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        return self._client.request(method, url, **kwargs)

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("POST", url, **kwargs)

    def delete(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("DELETE", url, **kwargs)

    def close(self) -> None:
        client = getattr(self, "_client", None)
        if client is not None:
            client.close()
            self._client = None
        server = getattr(self, "_server", None)
        if server is not None:
            server.should_exit = True
        thread = getattr(self, "_thread", None)
        if thread is not None and thread.is_alive():
            thread.join(timeout=5)

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass
