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
        response = urllib.request.urlopen(req, timeout=120)
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
    session = cookie["drawing_board_long_reach_session"]
    assert session["httponly"] and session["secure"] and session["samesite"] == "Lax"
    # The runner connects to loopback HTTP; Render terminates HTTPS in deployment.
    return f"drawing_board_long_reach_session={session.value}"


for attempt in range(60):
    try:
        if request("/api/health")[0] == 200:
            break
    except (urllib.error.URLError, TimeoutError):
        pass
    time.sleep(1)
else:
    raise RuntimeError("The container never became healthy")

for path, content_type in [("/", "text/html"), ("/galactic-reach/styles.css", "text/css"), ("/galactic-reach/app.js", "javascript"), ("/lab/lab.js", "javascript"), ("/voidwright/", "text/html"), ("/pkg/web.js", "javascript"), ("/pkg/web_bg.wasm", "application/wasm")]:
    status, headers, body = request(path)
    assert status == 200 and content_type in headers["Content-Type"] and len(body) > 100, path

assert b"Drawing Board" in request("/")[2]
assert b"Galactic Reach" in request("/galactic-reach/")[2]

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

# Persistent identity and authoritative arena through the packaged HTTP surface.
status, headers, created = request('/api/accounts/register', {'name': 'Arena pilot', 'code': CODE})
assert status == 200
account_cookie = http.cookies.SimpleCookie(headers['Set-Cookie'])['drawing_board_long_reach_session'].value
account_cookie = f'drawing_board_long_reach_session={account_cookie}'
account_id = request('/api/account', cookie=account_cookie)[2]['id']
key = created['recovery_key']
assert request('/api/auth/logout', {}, account_cookie)[0] == 200
status, headers, _ = request('/api/accounts/login', {'recovery_key': key})
assert status == 200
account_cookie = 'drawing_board_long_reach_session=' + http.cookies.SimpleCookie(headers['Set-Cookie'])['drawing_board_long_reach_session'].value
assert request('/api/account', cookie=account_cookie)[2]['id'] == account_id
bots = []
for strategy in ['explorer', 'kepler']:
    status, _, bot = request('/api/arena/bots', {'name': strategy, 'strategy': strategy}, account_cookie)
    assert status == 200
    bots.append(bot['id'])
import uuid
series = {'request_id': str(uuid.uuid4()), 'bots': bots, 'games': 2}
status, _, result = request('/api/arena/series', series, account_cookie)
assert status == 200 and len(result['matches']) == 2
assert request('/api/arena/series', series, account_cookie)[2] == result
ladder = request('/api/arena', cookie=account_cookie)[2]
assert all(bot['games'] == 2 for bot in ladder['bots'])
assert len(ladder['series']) == 1
print('Platform smoke passed: account recovery, AI accounts, paired matches, persisted Elo, duplicate-safe retry.')

# The packaged binary embeds the exact browser rules; no Node runtime is needed.
gr_bots = []
for policy in ['gr-military', 'gr-economy', 'gr-expansion', 'gr-wanderer']:
    status, _, bot = request('/api/arena/bots', {'name': policy, 'strategy': policy, 'game': 'galactic-reach'}, account_cookie)
    assert status == 200, bot
    gr_bots.append(bot['id'])
gr_series = {'request_id': str(uuid.uuid4()), 'game': 'galactic-reach', 'bots': gr_bots, 'games': 4}
status, _, gr_result = request('/api/arena/series', gr_series, account_cookie)
assert status == 200, gr_result
assert len(gr_result['matches']) == 4
assert all(m['result']['rules_version'] == 'galactic-reach/5.10' for m in gr_result['matches'])
assert request('/api/arena/series', gr_series, account_cookie)[2] == gr_result
gr_ladder = request('/api/arena?game=galactic-reach', cookie=account_cookie)[2]
assert len(gr_ladder['bots']) == 4 and all(b['games'] == 4 for b in gr_ladder['bots'])
assert abs(sum(b['elo'] for b in gr_ladder['bots']) - 4800) < 1e-8
assert request('/api/arena', cookie=account_cookie)[2] == ladder
print('Second adapter smoke passed: four-player Galactic Reach, seat rotation, separate Elo, exact-once retry.')
