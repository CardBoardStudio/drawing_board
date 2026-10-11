#!/usr/bin/env python3
"""Exercise the packaged HTTP app. Uses only Python's standard library."""
import http.cookies
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3100"
ORIGIN = os.environ.get("SMOKE_ORIGIN", "https://preview.example")
CODE = os.environ["SMOKE_PREVIEW_CODE"]


def request(path, body=None, cookie="", origin=ORIGIN):
    headers = {"Origin": origin, "x-drawing-board": "1"}
    if cookie:
        headers["Cookie"] = cookie
    data = None if body is None else json.dumps(body).encode()
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        payload = json.loads(raw) if "application/json" in response.headers.get("Content-Type", "") else raw
        return response.status, response.headers, payload


def login(name):
    status, headers, _ = request("/api/auth/preview", {"name": name, "code": CODE})
    assert status == 200, status
    cookie = http.cookies.SimpleCookie(headers["Set-Cookie"])
    session = cookie["drawing_board_session"]
    assert session["httponly"] and session["secure"] and session["samesite"] == "Lax"
    # The runner connects to loopback HTTP; Render terminates HTTPS in deployment.
    return f"drawing_board_session={session.value}"


for attempt in range(60):
    try:
        if request("/api/health")[0] == 200:
            break
    except (urllib.error.URLError, TimeoutError):
        pass
    time.sleep(1)
else:
    raise RuntimeError("The container never became healthy")

for path, content_type in [("/", "text/html"), ("/styles.css", "text/css"), ("/app.js", "javascript"), ("/pkg/web.js", "javascript"), ("/pkg/web_bg.wasm", "application/wasm")]:
    status, headers, body = request(path)
    assert status == 200 and content_type in headers["Content-Type"] and len(body) > 100, path

assert b"Galactic Reach" in request("/")[2]

session = request("/api/session")[2]
assert session["preview_auth"] and not session["dev_auth"]
assert request("/api/auth/dev", {"name": "Nobody"})[0] == 404
assert request("/api/auth/preview", {"name": "Nobody", "code": "wrong"})[0] == 401
assert request("/api/auth/preview", {"name": "Nobody", "code": CODE}, origin="https://attacker.example")[0] == 403
alice, bob = login("Alice"), login("Bob")
status, _, game = request("/api/games", {"name": "Container smoke test", "practice": False, "round_limit": 10}, alice)
assert status == 200
path = f"/api/games/{game['id']}"
assert request(path)[0] == 401
assert request(path, cookie=bob)[0] == 403
assert request(path + "/join", {}, bob)[0] == 200
current = request(path, cookie=alice)[2]


def command(cookie, action, expected=200):
    global current
    revision = request(path, cookie=cookie)[2]["revision"]
    status, _, updated = request(path + "/commands", {"revision": revision, "command": action}, cookie)
    assert status == expected, (status, updated)
    if status == 200:
        current = updated
    return updated


command(alice, {"type": "start"})
assert len(current["hand"]) == 5 and isinstance(current["players"][1]["hand"], int)
assert "seed" not in current and "shuffles" not in current
command(bob, {"type": "end_turn"}, 400)
command(alice, {"type": "play_resources"})
card = "reactor" if current["credits"] >= 3 else "scout"
command(alice, {"type": "buy", "card": card})
assert current["players"][0]["discard"] == 1
command(alice, {"type": "end_turn"})
assert request(path, cookie=bob)[2]["your_turn"]
assert request("/api/auth/logout", {}, alice)[0] == 200
assert request(path, cookie=alice)[0] == 401
print("Container smoke passed: assets, preview access, two-player game, private views, purchase, turn handoff, logout.")
