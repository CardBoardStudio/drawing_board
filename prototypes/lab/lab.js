import {matchList,bindReplays} from "./replay.js";
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let session,
  profile,
  catalog,
  arena = { bots: [], series: [] },
  matches = {matches:[]},
  tables = [],
  invitations = [],
  overview,
  overviewError,
  // Members dashboard search, filter and sort, kept across refreshes.
  people = { q: "", filter: "all", sort: "newest" },
  links = { q: "", filter: "all", sort: "newest" },
  invitation,
  inviteError,
  lobby,
  lobbyError,
  lobbyTimer,
  busy = false,
  pendingSeries;
// Players see Galactic Reach only. Voidwright, the platform's example game, keeps its
// server routes and /voidwright/ page but is not offered here.
const arenaGame = "galactic-reach";
const returnPath = (() => {
  const path = new URLSearchParams(location.search).get("return_to") || "";
  return /^(?:\/galactic-reach\/\?(?:table|shared)=[a-f0-9]{32}|\/voidwright\/(?:#table\/[a-f0-9]{32})?|\/\?game=galactic-reach#lobby\/[a-f0-9]{32}(?:\/[a-f0-9]{64})?)$/.test(path) ? path : "";
})();
const arenaInfo = () => catalog?.games.find(g => g.id === arenaGame);
const arenaPolicies = () => catalog.policies.filter(p => p.game === arenaGame);
const page = () =>
  ["arena", "account", "tables", "admin", "members"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : location.hash.startsWith("#invite/") ? "invite" : location.hash.startsWith("#lobby/") ? "lobby" : "library";
const inviteToken = () => /^#invite\/([a-f0-9]{64})$/.exec(location.hash)?.[1];
// Galactic Reach waiting room: #lobby/<table>[/<invite>].
const lobbyRoute = () => { const m = /^#lobby\/([a-f0-9]{32})(?:\/([a-f0-9]{64}))?$/.exec(location.hash); return m ? {id:m[1], invite:m[2] || ""} : null; };
async function loadLobby() {
  const route = lobbyRoute();
  if (!route || !session?.user) { lobby = null; lobbyError = route ? null : "This waiting-room link is incomplete."; return; }
  try { lobby = await api(`/api/tables/${route.id}/lobby${route.invite ? `?invite=${route.invite}` : ""}`); lobbyError = null; }
  catch (e) { lobby = null; lobbyError = e.message; }
}
// Seats fill as friends join; refresh the room while it is open.
function pollLobby() {
  clearTimeout(lobbyTimer);
  if (page() !== "lobby" || !lobby || lobby.status !== "waiting") return;
  lobbyTimer = setTimeout(async () => {
    if (page() !== "lobby" || busy) return pollLobby();
    await loadLobby(); render();
  }, 4000);
}
// Preserve pre-platform Voidwright invitations.
if (/^#table\/[a-f0-9]{32}$/i.test(location.hash))
  location.replace("/voidwright/" + location.hash);
async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "x-drawing-board": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error || "The request could not be completed.");
  return value;
}
function notice(message, error = false) {
  const el = $("#notice");
  el.textContent = message;
  el.hidden = !message;
  el.classList.toggle("error", error);
}
// Invite-only host (docs/invite-only.md): until this browser holds a member
// session, only the sign-in and invitation claim are available.
const gated = () => session?.invite_only && !session.member;
const PENDING = "drawing-board-after-invite";
function remember(path) { try { localStorage.setItem(PENDING, path); } catch {} }
function resume() {
  let path = "";
  try { path = localStorage.getItem(PENDING) || ""; localStorage.removeItem(PENDING); } catch {}
  if (/^\/\?game=galactic-reach#lobby\/[a-f0-9]{32}(?:\/[a-f0-9]{64})?$/.test(path)) { location.assign(path); return true; }
  return false;
}
async function refresh() {
  session = await api("/api/session");
  if (session.user && !gated())
    [profile, arena, tables,matches] = await Promise.all([
      api("/api/account"),
      api(`/api/arena?game=${arenaGame}`),
      api("/api/tables"),
      api("/api/arena/matches"),
    ]);
  else {
    profile = null;
    arena = { bots: [], series: [] };
    tables = []; matches={matches:[]};
  }
  invitations = profile?.is_admin ? (await api("/api/admin/invites")).invitations : [];
  overview = null; overviewError = null;
  if (profile?.is_admin && page() === "members") {
    try { overview = await api("/api/admin/overview"); } catch (e) { overviewError = e.message; }
  }
  if (inviteToken()) {
    try { invitation = await api("/api/invites/inspect", {token:inviteToken()}); inviteError = null; }
    catch (e) { invitation = null; inviteError = e.message; }
  }
  if (gated()) { if (page() === "lobby") remember(location.pathname + location.search + location.hash); render(); return; }
  if (page() === "lobby") await loadLobby();
  catalog ??= await api("/api/catalog");
  render();
}
async function action(work) {
  if (busy) return;
  busy = true;
  notice("");
  const disabled = [...document.querySelectorAll("main button")];
  disabled.forEach((b) => (b.disabled = true));
  try {
    await work();
    await refresh();
  } catch (e) {
    notice(e.message, true);
  } finally {
    busy = false;
    disabled.forEach((b) => {
      if (b.isConnected) b.disabled = false;
    });
  }
}
const galaxy = `<svg viewBox="0 0 470 345" role="img" aria-label="Four factions exploring an orbital map"><defs><radialGradient id="planet"><stop stop-color="#79e3f2"/><stop offset=".42" stop-color="#327a99"/><stop offset="1" stop-color="#10273f"/></radialGradient><radialGradient id="halo"><stop stop-color="#4aacc7" stop-opacity=".2"/><stop offset="1" stop-color="#123044" stop-opacity="0"/></radialGradient></defs><circle cx="244" cy="174" r="170" fill="url(#halo)"/><g fill="none" stroke="#456077" stroke-width=".7"><ellipse cx="243" cy="175" rx="193" ry="90" transform="rotate(-30 243 175)"/><ellipse cx="243" cy="175" rx="151" ry="134" transform="rotate(-30 243 175)" stroke-dasharray="3 6"/><circle cx="243" cy="175" r="94"/><path d="M243 43v263M94 175h315" stroke-dasharray="2 7"/></g><g fill="#172e43" stroke="#59849c"><path d="m243 115 52 30v60l-52 30-52-30v-60z"/><path d="m151 70 27 16v32l-27 16-27-16V86z"/><path d="m349 151 27 16v32l-27 16-27-16v-32z"/><path d="m177 252 21 12v24l-21 12-21-12v-24z"/></g><circle cx="243" cy="175" r="42" fill="url(#planet)"/><path d="m215 153 13 9 8-15 17 4 7 17-5 14 15 11-23 16-12-9-10-2-6-21z" fill="#65bbc4" opacity=".55"/><g stroke="#55d9f4" fill="#102c3c"><path d="m151 89 10 20-10-5-10 5z"/><path d="m331 79 7 14-7-3-7 3z"/></g><g fill="#bc9cff"><circle cx="349" cy="183" r="7"/><circle cx="94" cy="200" r="3"/></g><g fill="#ffc95e"><circle cx="177" cy="276" r="6"/><circle cx="287" cy="57" r="3"/></g><g fill="#6ee7a8"><circle cx="321" cy="264" r="4"/></g><g fill="#d7edf8"><circle cx="87" cy="77" r="1.5"/><circle cx="383" cy="67" r="1.5"/><circle cx="404" cy="244" r="1.5"/><circle cx="267" cy="309" r="1"/><circle cx="113" cy="284" r="1"/></g><text x="289" y="128" fill="#9fbad0" font-family="monospace" font-size="9" letter-spacing="1">OUTER REACH</text></svg>`;
function head(kicker, title, description, badge = "") {
  return `<div class="page-head"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${badge ? `<span class="badge">${badge}</span>` : ""}</div>`;
}
function libraryView() {
  return (
    head(
      "GALACTIC REACH",
      "Your next expedition starts here.",
      "Explore a new world. Build a better rival. Make yourself at home.",
      '<span class="live-dot"></span> PLAYTEST',
    ) +
    `
  <section class="hero"><div class="hero-copy"><span class="badge cyan">NOW IN PLAYTEST</span><h2>Galactic Reach</h2><p>A galaxy of possibilities. Command your faction, build your fleet, and chart a path to the stars.</p><div class="meta"><span>1 player + 3 AI</span><span>4X strategy</span><span>Saved tables</span></div><div class="hero-actions"><a class="primary" href="/?game=galactic-reach#tables">Create a table <span>↗</span></a><a class="secondary learn-to-play" href="/galactic-reach/?tutorial=1">New here? Learn to play <span>→</span></a></div><p class="learn-note">A guided first game on the real table, one step at a time.</p><a class="text-link guest-link" href="/galactic-reach/">Play as a guest · saved in this browser →</a></div><div class="hero-art">${galaxy}<span class="art-label">EXPLORE / BUILD / OUTMANEUVER</span></div></section>
  <div class="cards"><section class="panel game-card"><div class="card-icon" aria-hidden="true">⟁</div><div><small style="color:var(--gold)">LEARN THE GAME</small><h3>Rules and cards</h3><p>Read the rulebook, then browse every market card before your first expedition.</p><a class="text-link" href="/galactic-reach/?tutorial=1">Learn to play →</a> <a class="text-link" href="/galactic-reach/rulebook.html">Read the rulebook →</a> <a class="text-link" href="/galactic-reach/cards.html">Card gallery →</a></div></section><section class="panel game-card"><span class="arena-icon" aria-hidden="true">◇</span><div><small style="color:var(--purple)">A DIFFERENT KIND OF PLAYTEST</small><h3>Meet your next challenger.</h3><p>Create AI players, run matches, and discover how their strategies compare.</p><a class="text-link" href="#arena">Explore the AI arena →</a></div></section></div>
  <div class="section-head"><h2>Your tables</h2><a class="text-link" href="#tables">View all / create new →</a></div><section class="panel">${tableList()}</section>`
  );
}
function tableList() {
  if (!profile) return `<div class="empty"><span aria-hidden="true">◎</span><h3>A seat with your name on it.</h3><p>Sign in to save named tables and return from another browser.</p><a class="secondary" href="#account">Sign in or create an account</a></div>`;
  const shown = tables.filter(g => g.game === arenaGame);
  if (!shown.length) return '<div class="empty"><h3>Your first table is waiting.</h3><p>Create a named game of Galactic Reach. It will be waiting here when you return.</p></div>';
  return shown.map(g => `<a class="table-link" href="${esc(g.url)}"><div><strong>${esc(g.name)}</strong><small>${g.guest ? `Galactic Reach · invited · ${g.players} at the table` : "Galactic Reach · Solo + 3 AI"} · Rules ${esc((g.rules_version || "unknown").split("/").pop())} · ${g.status === "waiting" ? "Waiting room" : `Round ${g.round} · ${esc(g.status)}`}</small></div><span>${g.status === "waiting" ? "Open waiting room" : g.status === "new" ? "Start table" : "Open table"} ↗</span></a>`).join("");
}
function tablesView() {
  return head("A PLACE TO PICK UP WHERE YOU LEFT OFF", "Your tables.", "Name a game and return whenever you’re ready. Each table keeps the rules version it started with.") +
    `<div class="split"><section class="panel"><h2>Saved games</h2>${tableList()}</section><section class="panel"><h2>Create a table</h2>${profile ? `<form id="table-form"><p class="hint">${rulesHint()}</p><label for="table-name">Table name</label><input id="table-name" name="name" required maxlength="60" placeholder="Friday expedition"><p class="form-note">Opens a waiting room first: share the invite link, watch seats fill, then Start. Standard AI rivals fill the remaining seats. Unrated and saved to your account. Your guest game stays separate.</p><button class="primary">Create and open table →</button></form>` : '<p>Sign in to create a table saved to your account.</p><a class="primary" href="#account">Sign in →</a><hr class="divider"><a class="text-link" href="/galactic-reach/">Play Galactic Reach as a guest →</a>'}</section></div>`;
}
// Read the current rules from the server's engine, never a hard-coded label.
function rulesHint() {
  const info = arenaInfo();
  if (!info) return "";
  const version = (info.rules_version || "").split("/").pop();
  return `New Galactic Reach tables use rules ${esc(version)} · ${esc(info.experiment || "")}. Start a new game.`;
}
const seatLabel = seat => seat.kind === "host" ? `${esc(seat.name)}${seat.you ? " (you)" : ""}<small>Host</small>`
  : seat.kind === "friend" ? `${esc(seat.name)}${seat.you ? " (you)" : ""}<small>Friend · signed in</small>`
  : seat.kind === "ai" ? `AI rival<small>${esc(lobby.difficulties.find(d => d.id === seat.difficulty)?.name || seat.difficulty)}</small>`
  : `Open seat<small>Waiting for a friend</small>`;
function lobbyView() {
  const route = lobbyRoute();
  if (!session?.user) return head("GALACTIC REACH · WAITING ROOM", "You’re invited to a table.", "Sign in to take a seat. Nido or your recovery key both work.") + `<section class="panel"><a class="primary" href="/?return_to=${encodeURIComponent("/?game=galactic-reach" + location.hash)}#account">Sign in to join →</a></section>`;
  if (!lobby) return head("GALACTIC REACH · WAITING ROOM", "This waiting room isn’t available.", esc(lobbyError || "Check the link with the host.")) + `<a class="text-link" href="#tables">← Your tables</a>`;
  const started = lobby.status !== "waiting";
  // Rivals are fixed for now (captain, 2026-11-14): Standard AI rivals fill every seat not taken by a player.
  const settings = `<p class="form-note">${lobby.ai_rivals} Standard AI rival${lobby.ai_rivals === 1 ? "" : "s"} (Vanguard, Architect, Pathfinder) fill the seat${lobby.ai_rivals === 1 ? "" : "s"} not taken by players. Friends who join take an AI seat.</p>`;
  // 31.36 #victory-target: the host chooses the Prestige target before Start.
  const target = lobby.victory_targets && lobby.host && !started
    ? `<form id="lobby-settings" class="lobby-settings"><label for="lobby-target">Prestige target</label><select id="lobby-target" name="victory_target">${lobby.victory_targets.map(n => `<option value="${n}" ${n === lobby.victory_target ? "selected" : ""}>${n} Prestige${n === 30 ? " (default)" : ""}</option>`).join("")}</select><p class="form-note">The first faction at or above the target when a round ends wins.</p></form>`
    : lobby.victory_target ? `<p class="form-note">Race to ${lobby.victory_target} Prestige.</p>` : "";
  const invite = lobby.host && !started ? `<div class="lobby-invite"><label for="lobby-invite-link">Invite link</label><div class="lobby-invite-row"><input id="lobby-invite-link" readonly value="${esc(lobby.invite_url)}"><button class="secondary" id="copy-lobby-invite" type="button">Copy link</button></div><p class="form-note">Anyone with this link can take a seat after signing in. Share it privately.</p></div>` : "";
  const phonePairing = lobby.host ? `<a class="secondary" href="/tabletop/host.html?table=${lobby.id}">Pair phones / public tablet</a>` : "";
  const start = started
    ? (lobby.table_url && (lobby.host || lobby.shared) ? `<a class="primary" href="${esc(lobby.table_url)}">Open the game →</a>` : `<p class="form-note">The host started this table solo before you joined.</p>`)
    : lobby.host ? `<button class="primary" id="lobby-start" ${lobby.blocked ? "disabled" : ""}>Start the game →</button>${lobby.blocked ? `<p class="form-note lobby-blocked" role="status">${esc(lobby.blocked)}</p>` : ""}`
    : lobby.member ? `<p class="form-note" role="status">You have a seat. Waiting for the host to start.${lobby.blocked ? ` ${esc(lobby.blocked)}` : ""}</p><button class="secondary" id="lobby-leave">Leave this table</button>`
    : `<button class="primary" id="lobby-join">Take a seat →</button>`;
  return head("GALACTIC REACH · WAITING ROOM", esc(lobby.name), started ? "This table has started." : "Seats fill as friends join. The host starts the game.", `Rules ${esc(lobby.rules_version.split("/").pop())}`) +
    `<div class="split"><section class="panel"><h2>Seats</h2><ol class="lobby-seats">${lobby.seats.map(seat => `<li class="lobby-seat ${seat.kind}">${seatLabel(seat)}</li>`).join("")}</ol></section><section class="panel"><h2>${lobby.host ? "Host controls" : "Table"}</h2>${invite}${settings}${target}${start}${phonePairing}</section></div><p><a class="text-link" href="#tables">← Your tables</a></p>`;
}
function roster() {
  if (!arena.bots.length)
    return `<div class="empty"><span aria-hidden="true">◇</span><h3>Give a strategy a seat.</h3><p>Start with ${arenaPolicies().map(p => esc(p.name)).join(", ")}: different approaches to the same game.</p><button class="primary" id="starter-roster">Create reference roster →</button></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>AI PLAYER</th><th>ELO</th><th>RECORD</th></tr></thead><tbody>${arena.bots.map((b) => `<tr><td><div class="bot-name"><span class="bot-glyph" aria-hidden="true">◇</span><div>${esc(b.name)}<small>${esc(b.policy)}</small></div></div></td><td><span class="rating">${Math.round(b.elo)}</span><div class="rating-bar" aria-hidden="true"><i style="width:${Math.max(5, Math.min(100, (b.elo - 800) / 8))}%"></i></div></td><td>${b.wins} first · ${b.draws} tied first<small>${b.games < 20 ? `${b.games}/20 · Provisional` : `${b.games} games`}</small></td></tr>`).join("")}</tbody></table></div>`;
}
const botName = (id) =>
  arena.bots.find((b) => b.id === id)?.name || "AI player";
function history() {
  if (!arena.series.length)
    return "<p>No matches yet. Choose two AI players to run your first series.</p>";
  return arena.series
    .map(
      (s) =>
        `<details class="series"><summary>${s.matches[0].seats.map(id => esc(botName(id))).join(" / ")}<br><span>${s.matches.length} games · ${new Date(s.created * 1000).toLocaleString()} · Complete</span></summary>${s.matches.map((m, i) => `<div class="result"><span>${i + 1}. ${m.seats.map(id => esc(botName(id))).join(" / ")}<br>${m.after.map((r, j) => `${esc(botName(m.seats[j]))}: ${Math.round(r)} (${r - m.before[j] >= 0 ? "+" : ""}${(r - m.before[j]).toFixed(1)})`).join(" · ")}</span><strong>${m.result.scores.join(" : ")}</strong></div>`).join("")}</details>`,
    )
    .join("");
}
function arenaView() {
  let intro = head(
    "STRATEGY, MEET EVIDENCE.",
    "The AI arena.",
    "Give your AI players an identity. Let them play. Find the challenge that fits.",
    `${arenaInfo().name.toUpperCase()} / ${arenaInfo().seats} PLAYERS`,
  );
  if (!profile)
    return (
      intro +
      `<section class="panel"><div class="empty"><span aria-hidden="true">◇</span><h3>Your own strategy lab.</h3><p>Sign in to create AI accounts, run paired matches, and keep a persistent Elo ladder.</p><a href="#account" class="primary">Open your account →</a></div></section><div class="cards">${arenaPolicies().map((p) => `<div class="panel"><div class="eyebrow">${esc(p.version)}</div><h2>${esc(p.name)}</h2><p>${esc(p.description)}</p></div>`).join("")}</div>`
    );
  const games = arena.bots.reduce((n, b) => n + b.games, 0) / arenaInfo().seats;
  const top = arena.bots.find((b) => b.games > 0);
  return (
    intro +
    `<p class="hint">Active rules: ${esc(arenaInfo().rules_version)} · Placement Elo · policies v3</p><div class="stat-grid"><div class="stat"><span>YOUR AI PLAYERS</span><strong>${arena.bots.length.toString().padStart(2, "0")}</strong><small>${12 - arena.bots.length} seats available</small></div><div class="stat"><span>COMPLETED MATCHES</span><strong>${games.toString().padStart(2, "0")}</strong><small>Rotated starting seats</small></div><div class="stat"><span>HIGHEST RATING</span><strong>${top ? Math.round(top.elo) : "—"}</strong><small>${top ? "In your lab" : "Awaiting matches"}</small></div></div>
  <div class="split"><div><section class="panel"><div class="panel-heading"><h2>Your AI ladder</h2><span class="badge cyan">Elo · K 32</span></div>${roster()}<p class="hint"><strong>Difficulty is measured, not assigned.</strong><br>Everyone starts at 1200. Ratings compare players in your lab using four-faction Galactic Reach matches to 10 Prestige. The first 20 games are provisional; a rating is not a universal difficulty level. Elo compares every pair by final placement: Prestige, then colonies, then resources. Exact ties split the result. Earlier win/loss pools stay separate. Browser tables are unrated.</p></section><section class="panel" style="margin-top:20px"><div class="panel-heading"><h2>Recent series</h2><small>LAST 10</small></div>${history()}</section></div><div><section class="panel"><div class="eyebrow">PUT THEM TO THE TEST</div><h2>Run a series</h2><p>Each group of ${arenaInfo().seats} matches uses the same game seed and rotates every AI through every starting seat.</p>${arena.bots.length >= arenaInfo().seats ? `<form id="series-form">${Array.from({length: arenaInfo().seats}, (_, i) => `<label for="bot-${i}">Challenger ${i + 1}</label><select id="bot-${i}" name="seat${i}">${arena.bots.map((b, j) => `<option value="${esc(b.id)}" ${j === i ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>`).join("")}<label for="series-games">Games in series</label><select id="series-games" name="games">${(arenaInfo().seats === 2 ? [2,10,20] : [4,8,12,20]).map(n => `<option value="${n}">${n} games · ${n / arenaInfo().seats} full seat rotation${n > arenaInfo().seats ? "s" : ""}</option>`).join("")}</select><button class="primary">Run matches →</button><p class="form-note">Ratings update only after the whole series completes. Long Reach series may take several minutes.</p></form>` : `<p class="hint">Create at least ${arenaInfo().seats} AI accounts to start a series.</p>`}</section><section class="panel" style="margin-top:20px"><h2>Create an AI player</h2><form id="bot-form"><label for="bot-name">Player name</label><input id="bot-name" name="name" required maxlength="32" placeholder="Name your new challenger"><label for="bot-strategy">Strategy</label><select id="bot-strategy" name="strategy">${arenaPolicies().map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(p.version)}</option>`).join("")}</select><p id="policy-description" class="form-note">${esc(arenaPolicies()[0].description)}</p><button class="primary" ${arena.bots.length >= 12 ? "disabled" : ""}>Create AI account +</button></form></section></div></div>` + matchList(matches)
  );
}
function accountView() {
  if (profile)
    return (
      head(
        "A PLACE TO RETURN TO.",
        `Welcome, ${esc(profile.name)}.`,
        "Your tables, your AI players, and your account settings.",
        "SIGNED IN",
      ) +
      `<div class="split"><section class="panel"><div class="eyebrow">PLAYER PROFILE</div><h2>Your identity</h2><form id="profile-form"><label for="profile-name">Display name</label><input name="name" id="profile-name" value="${esc(profile.name)}" required maxlength="32"><button class="primary">Save display name</button></form><hr class="divider"><div class="detail-list"><div><span>Sign-in method</span><b>${profile.has_recovery_key ? "Private recovery key" : profile.development ? "Temporary playtest identity" : "Nido wallet"}</b></div><div><span>Active browser sessions</span><b>${profile.sessions}</b></div><div><span>AI players in your lab</span><b>${arena.bots.length} (${esc(arenaInfo().name)})</b></div></div><small class="mono">${esc(profile.id)}</small>${profile.development ? '<p class="hint">This is a temporary identity. To keep a recoverable account, sign out and create an account with a recovery key.</p>' : ""}</section><section class="panel"><div class="eyebrow">ACCOUNT ACCESS</div><h2>Keep your seat secure.</h2><p>Sessions expire after 60 days. ${profile.has_recovery_key ? "Use your saved recovery key to return to this same account." : profile.id.startsWith("nido:") ? "Sign in with this Nido wallet to return. Wallet recovery and passkeys are managed in Nido." : "Return with your usual sign-in method."}</p>${profile.id.startsWith("nido:") ? `<p><a class="text-link" href="${esc((session.nido_wallet?.account_url ?? "https://{account}.test.nido.fyi").replace("{account}", encodeURIComponent(profile.id.slice(5).toLowerCase())))}/" target="_blank" rel="noopener noreferrer">Manage your Nido wallet ↗</a></p>` : ""}<button class="secondary" id="revoke">Sign out other sessions</button>${profile.has_recovery_key ? `<hr class="divider"><h3>Replace your recovery key</h3><p>Your old key will stop working and all other sessions will be signed out. Save the new key before leaving this page.</p><button class="secondary" id="rotate">Replace recovery key</button>` : ""}<hr class="divider"><button class="secondary" id="logout">Sign out of this browser</button></section></div>`
    );
  return (
    head(
      "YOUR NEXT CHAPTER.",
      "Your seat in Galactic Reach.",
      "Create an account once. Return to your tables and AI players from any browser.",
    ) +
    (session.nido_available ? `<section class="panel nido-signin"><div><div class="eyebrow">SIGN IN WITH A PASSKEY</div><h2>Your Nido. Your seat.</h2><p>Use your Nido wallet to create an account or return to it. No enrollment code or recovery key needed.</p><p class="form-note">Current Nido testnet wallets with a single admin passkey. You’ll approve a sign-in message in Nido.</p></div><a class="primary" href="/api/auth/nido?return_to=${encodeURIComponent(returnPath || '/?game=galactic-reach#account')}">Continue with Nido ↗</a></section>` : "") +
    `<div class="cards"><section class="panel"><div class="eyebrow">NEW HERE</div><h2>Create with a recovery key</h2><p>You’ll receive a private recovery key. Save it to sign in again.</p>${session.registration_available ? `<form id="register-form"><label for="register-name">Display name</label><input id="register-name" name="name" required maxlength="32" autocomplete="nickname" placeholder="What should we call you?">${!session.dev_auth ? '<label for="enrollment-code">Playtest enrollment code</label><input id="enrollment-code" name="code" type="password" required autocomplete="off"><p class="form-note">Use an invitation link from the host, or enter the enrollment code.</p>' : ""}<button class="primary">Create account →</button></form>` : '<p class="hint">Recovery-key enrollment is closed. Use Nido above when available, or ask the host for an invitation link.</p>'}</section><section class="panel"><div class="eyebrow">WELCOME BACK</div><h2>Recover your seat</h2><p>Use your saved recovery key to sign in to your existing account.</p><form id="login-form"><label for="recovery-key">Private recovery key</label><input id="recovery-key" name="recovery_key" type="password" required autocomplete="current-password" placeholder="dbk_…"><button class="primary">Sign in →</button></form></section></div><p class="hint">Your recovery key is your credential. Store it privately. Display names are not unique and cannot be used to sign in. Guest games stay on this device. Account tables are saved on the server.</p>`
  );
}
function adminView() {
  if (!profile?.is_admin) return head("HOST TOOLS", "Administrator access", "Sign in with the administrator account to manage invitations.");
  const status = i => i.revoked ? "Revoked" : i.expires * 1000 <= Date.now() ? "Expired" : i.uses >= i.max_uses ? "Used" : "Active";
  return head("BRING PEOPLE TO THE TABLE", "Invite your next player.", "Create a link, share it privately, and keep track of the seats you’ve offered.") +
    `<div class="split"><section class="panel"><h2>Create an invitation</h2><form id="invite-form"><label for="invite-label">Who is it for?</label><input id="invite-label" name="label" maxlength="80" required placeholder="Friday game night"><label for="invite-days">Expires in</label><select id="invite-days" name="days"><option value="1">24 hours</option><option value="7" selected>7 days</option><option value="30">30 days</option></select><label for="invite-uses">Number of people</label><input id="invite-uses" name="max_uses" type="number" min="1" max="20" value="1" required><button class="primary">Create invite link →</button><p class="form-note">Invites create player accounts. They never grant administrator access. Copy the link when it appears; it is shown once.</p></form></section><section class="panel"><h2>Your invitations</h2>${invitations.length ? invitations.map(i => `<article class="invitation-row"><strong>${esc(i.label)}</strong><p>${i.uses}/${i.max_uses} people · ${status(i)}<br>Expires ${new Date(i.expires*1000).toLocaleDateString()} · Created by ${esc(i.created_by)}</p>${status(i)==="Active" ? `<button class="secondary" data-revoke-invite="${esc(i.id)}">Revoke link</button>` : ""}</article>`).join("") : '<p>No invitations yet. Create your first link.</p>'}</section></div>`;
}
// Members dashboard (docs/invite-only.md#admin-dashboard): read-only; invitations
// are still created and revoked on the Invitations page.
const day = (t) => t ? new Date(t * 1000).toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"}) : "—";
const stamp = (t) => t ? new Date(t * 1000).toLocaleString(undefined, {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : "—";
function ago(t) {
  if (!t) return "—";
  const s = Math.max(0, Date.now() / 1000 - t);
  return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
}
const shortId = (id) => { const [kind, rest = ""] = id.split(/:(.*)/s); return rest.length > 14 ? `${kind}:${rest.slice(0, 6)}…${rest.slice(-4)}` : id; };
const JOINED = {invitation:"Invitation link", "admin-grant":"Admin grant (host CLI)", bootstrap:"Setup link", direct:"Direct sign-in", temporary:"Temporary identity"};
const SIGN_IN = {nido:"Nido wallet", "recovery-key":"Recovery key", preview:"Preview", development:"Development"};
const LINK_STATUS = {active:"Active", "used-up":"Used up", expired:"Expired", revoked:"Revoked"};
const PEOPLE_FILTERS = {all:"All accounts", admin:"Administrators", invitation:"Joined by invitation", "admin-grant":"Admin grant", "no-access":"No access", "signed-in":"Signed in now"};
const PEOPLE_SORTS = {newest:"Newest first", oldest:"Oldest first", name:"Name", seen:"Last seen", tables:"Most tables"};
const LINK_FILTERS = {all:"All links", active:"Active", "used-up":"Used up", expired:"Expired", revoked:"Revoked"};
const LINK_SORTS = {newest:"Newest first", oldest:"Oldest first", accepted:"Most accepted", expires:"Expires soonest"};
const options = (all, chosen) => Object.entries(all).map(([v, t]) => `<option value="${v}"${v === chosen ? " selected" : ""}>${t}</option>`).join("");
const has = (q, ...fields) => !q || fields.some(f => String(f ?? "").toLowerCase().includes(q));
function peopleRows() {
  const q = people.q.trim().toLowerCase();
  const rows = overview.accounts.filter(a =>
    has(q, a.name, a.id, ...a.invitations.map(i => i.label)) &&
    ({all:true, admin:a.admin, invitation:a.joined === "invitation", "admin-grant":a.joined === "admin-grant", "no-access":!a.has_access, "signed-in":a.active_sessions > 0})[people.filter]);
  const by = {newest:(x, y) => y.created - x.created, oldest:(x, y) => x.created - y.created, name:(x, y) => x.name.localeCompare(y.name), seen:(x, y) => (y.last_seen ?? 0) - (x.last_seen ?? 0) || y.active_sessions - x.active_sessions, tables:(x, y) => (y.solo_tables + y.shared_tables) - (x.solo_tables + x.shared_tables)}[people.sort];
  rows.sort(by);
  if (!rows.length) return `<tr><td colspan="6" class="dash-empty">No accounts match.</td></tr>`;
  return rows.map(a => {
    const via = a.invitations[0];
    return `<tr><td><div class="dash-who"><strong>${esc(a.name)}</strong><span class="dash-id"><code title="${esc(a.id)}">${esc(shortId(a.id))}</code><button class="dash-copy" type="button" data-copy="${esc(a.id)}" aria-label="Copy account id for ${esc(a.name)}">Copy</button></span></div></td>` +
      `<td>${esc(JOINED[a.joined] ?? a.joined)}<small>${via ? `${esc(via.label)} · ${stamp(via.claimed)}` : esc(SIGN_IN[a.sign_in] ?? a.sign_in)}</small></td>` +
      `<td>${day(a.created)}<small>${esc(SIGN_IN[a.sign_in] ?? a.sign_in)}</small></td>` +
      `<td>${a.last_seen ? ago(a.last_seen) : a.active_sessions ? "Signed in" : "—"}<small>${a.active_sessions} active session${a.active_sessions === 1 ? "" : "s"}</small></td>` +
      `<td>${a.solo_tables} own<small>${a.shared_tables} shared</small></td>` +
      `<td>${a.admin ? '<span class="dash-pill admin">Admin</span>' : '<span class="dash-pill">Player</span>'}${a.has_access ? "" : '<small class="dash-warn">No access</small>'}</td></tr>`;
  }).join("");
}
function linkRows() {
  const q = links.q.trim().toLowerCase();
  const rows = overview.invitations.filter(i =>
    has(q, i.label, i.created_by?.name, ...i.claims.map(c => c.name)) && (links.filter === "all" || i.status === links.filter));
  const by = {newest:(x, y) => y.created - x.created, oldest:(x, y) => x.created - y.created, accepted:(x, y) => y.uses - x.uses, expires:(x, y) => x.expires - y.expires}[links.sort];
  rows.sort(by);
  if (!rows.length) return `<tr><td colspan="5" class="dash-empty">No invitation links match.</td></tr>`;
  return rows.map(i => `<tr><td><strong>${esc(i.label)}</strong><small>${i.role === "admin" ? "Administrator setup link · host" : `By ${esc(i.created_by?.name ?? "Host")}`}</small></td>` +
    `<td>${day(i.created)}<small>${i.expires * 1000 <= Date.now() ? "Expired" : "Expires"} ${day(i.expires)}</small></td>` +
    `<td><span class="dash-uses">${i.uses}/${i.max_uses}</span><span class="dash-meter" aria-hidden="true"><i style="width:${Math.round(100 * i.uses / Math.max(1, i.max_uses))}%"></i></span></td>` +
    `<td><span class="dash-pill ${i.status}">${LINK_STATUS[i.status] ?? esc(i.status)}</span></td>` +
    `<td>${i.claims.length ? `<ul class="dash-claims">${i.claims.map(c => `<li>${esc(c.name ?? shortId(c.account_id))} <small>${stamp(c.claimed)}</small></li>`).join("")}</ul>` : '<span class="muted">Not claimed yet</span>'}</td></tr>`).join("");
}
function membersView() {
  if (!profile?.is_admin) return head("HOST TOOLS", "Administrator access", "Sign in with the administrator account to see members and invitation links.");
  const intro = head("HOST TOOLS", "Members and invitation links.", "Who has joined, how they got in, and how your links are being used.", overview?.invite_only ? "INVITE-ONLY HOST" : "");
  if (!overview) return intro + `<section class="panel"><p class="hint">${esc(overviewError || "Loading…")}</p></section>`;
  const t = overview.totals;
  const stat = (label, value, note) => `<div class="stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
  const tools = (key, state, filters, sorts, label) => `<div class="dash-tools"><div><label for="${key}-q">Search ${label}</label><input id="${key}-q" type="search" data-dash="${key}" data-field="q" value="${esc(state.q)}" placeholder="Name, id or link"></div><div><label for="${key}-filter">Show</label><select id="${key}-filter" data-dash="${key}" data-field="filter">${options(filters, state.filter)}</select></div><div><label for="${key}-sort">Sort</label><select id="${key}-sort" data-dash="${key}" data-field="sort">${options(sorts, state.sort)}</select></div></div>`;
  return intro +
    `<div class="stat-grid dash-stats">${stat("LINKS CREATED", t.links_created, `${t.links_active} active now`)}${stat("ACCEPTED", t.links_accepted, `of ${t.seats_offered} seats offered`)}${stat("ACCOUNTS", t.accounts, `${t.admins} administrator${t.admins === 1 ? "" : "s"} · ${t.signed_in} signed in`)}</div>` +
    `<section class="panel dash-panel"><div class="panel-heading"><h2>Accounts</h2><small class="muted">Updated ${stamp(overview.generated)}</small></div>${tools("people", people, PEOPLE_FILTERS, PEOPLE_SORTS, "accounts")}<div class="table-wrap"><table class="dash-table"><thead><tr><th scope="col">PLAYER</th><th scope="col">JOINED VIA</th><th scope="col">CREATED</th><th scope="col">LAST SEEN</th><th scope="col">TABLES</th><th scope="col">ROLE</th></tr></thead><tbody id="people-rows">${peopleRows()}</tbody></table></div>${overview.accounts_truncated ? '<p class="form-note">Showing the newest 1,000 accounts.</p>' : ""}<p class="form-note">Last seen comes from Nido sessions, which the server rechecks at most once a minute. Other sign-ins show only their active session count.</p></section>` +
    `<section class="panel dash-panel"><div class="panel-heading"><h2>Invitation links</h2><a class="text-link" href="#admin">Create or revoke links →</a></div>${tools("links", links, LINK_FILTERS, LINK_SORTS, "links")}<div class="table-wrap"><table class="dash-table"><thead><tr><th scope="col">LINK</th><th scope="col">CREATED</th><th scope="col">ACCEPTED</th><th scope="col">STATUS</th><th scope="col">CLAIMED BY</th></tr></thead><tbody id="links-rows">${linkRows()}</tbody></table></div>${overview.invitations_truncated ? '<p class="form-note">Showing the newest 1,000 links.</p>' : ""}</section>`;
}
function bindCopies(root) {
  root.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; }
    catch { b.textContent = "Copy failed"; }
    setTimeout(() => { if (b.isConnected) b.textContent = "Copy"; }, 1500);
  }));
}
function bindMembers() {
  if (!overview) return;
  bindCopies($("#main"));
  document.querySelectorAll("[data-dash]").forEach(el => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
    const [state, body, rows] = el.dataset.dash === "people" ? [people, "#people-rows", peopleRows] : [links, "#links-rows", linkRows];
    state[el.dataset.field] = el.value;
    $(body).innerHTML = rows();
    bindCopies($(body));
  }));
}
function gateView() {
  const here = location.pathname + location.search + location.hash;
  const signIn = `<a class="primary" href="/api/auth/nido?return_to=${encodeURIComponent(here)}">Continue with Nido ↗</a>`;
  const signOut = '<button class="secondary" id="logout">Sign out</button>';
  const offered = invitation ? `<p>Invitation: <strong>${esc(invitation.label)}</strong></p>` : inviteToken() ? `<p class="hint">${esc(inviteError || "This invitation link is unavailable.")}</p>` : "";
  const intro = head("INVITE ONLY", "This playtest server is invite-only.", "Members sign in with a Nido wallet. An administrator’s invitation link admits a new member.");
  if (!session.user) return intro + `<section class="panel">${offered}<p>Sign in with Nido${invitation ? " to accept this invitation" : ""}. You’ll approve a sign-in message in Nido.</p>${signIn}</section>`;
  if (!session.user.nido) return intro + `<section class="panel"><p>You’re signed in as ${esc(session.user.name)}, which isn’t a Nido account. This server admits Nido accounts only.</p>${signOut}</section>`;
  if (invitation) return intro + `<section class="panel">${offered}<p>Accept as ${esc(session.user.name)}${invitation.role === "admin" ? " to become the host administrator" : ""}.</p><button class="primary" id="accept-invite">${invitation.role === "admin" ? "Set up administrator" : "Accept invitation"} →</button></section>`;
  return intro + `<section class="panel">${offered}<p>You’re signed in with Nido as ${esc(session.user.name)}, but this account has no invitation. Ask an administrator for an invitation link and open it in this browser.${page() === "lobby" ? " You’ll come back to this table after you accept it." : ""}</p>${signOut}</section>`;
}
function inviteView() {
  if (!invitation) return head("YOUR INVITATION", "This link is unavailable.", esc(inviteError || "Ask the host for a new invitation.")) + '<a class="secondary" href="#account">Go to your account</a>';
  const admin = invitation.role === "admin";
  return head(admin ? "HOST SETUP" : "A SEAT IS WAITING", esc(invitation.label), admin ? "Accept this one-time link to become the host administrator." : "Create a player account or sign in to accept your invitation.") +
    (profile ? `<section class="panel"><h2>Continue as ${esc(profile.name)}</h2><p>${admin ? "This account will be able to create and revoke invitations." : "Your existing account will stay with you."}</p><button class="primary" id="accept-invite" ${profile.development ? "disabled" : ""}>${admin ? "Set up administrator" : "Accept invitation"} →</button>${profile.development ? '<p class="hint">Sign out and use a persistent account first.</p>' : ""}</section>` :
    `<div class="cards"><section class="panel"><h2>Create an account</h2><form id="invite-register-form"><label for="invite-name">Display name</label><input id="invite-name" name="name" maxlength="32" autocomplete="nickname" required><button class="primary">Accept and create account →</button><p class="form-note">You’ll receive a private recovery key. Save it to return to your tables.</p></form>${session.nido_available ? `<hr class="divider"><a class="secondary" href="/api/auth/nido?return_to=${encodeURIComponent('/#invite/'+inviteToken())}">Continue with Nido ↗</a>` : ""}</section><section class="panel"><h2>Already have an account?</h2><form id="login-form"><label for="recovery-key">Private recovery key</label><input id="recovery-key" name="recovery_key" type="password" autocomplete="current-password" required><button class="primary">Sign in →</button></form></section></div>`);
}
function showKey(key) {
  $("#copy-key").textContent = "Copy key";
  $("#new-key").value = key;
  $("#saved-key").checked = false;
  $("#close-key").disabled = true;
  $("#key-dialog").showModal();
}
function render() {
  const current = page();
  for (const el of document.querySelectorAll("[data-page]")) {
    if (el.dataset.page === current) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  }
  $("#page-name").textContent = {
    library: "Home",
    arena: "AI arena",
    account: "Your account",
    admin: "Invitations",
    members: "Members",
    tables: "Your tables",
    invite: "Your invitation",
    lobby: "Waiting room",
  }[current];
  $("#admin-nav").hidden = !profile?.is_admin;
  $("#members-nav").hidden = !profile?.is_admin;
  // A gated visitor has no profile yet, but may already be signed in.
  const who = profile ?? (gated() ? session.user : null);
  $("#account-link").innerHTML = who
    ? `<span class="avatar">${esc(who.name.slice(0, 1).toUpperCase())}</span>${esc(who.name)}`
    : "Sign in <span>↗</span>";
  if (gated()) {
    $("#page-name").textContent = "Invitation required";
    $("#main").innerHTML = gateView();
    bind();
    return;
  }
  $("#main").innerHTML = ({arena:arenaView,account:accountView,library:libraryView,admin:adminView,members:membersView,invite:inviteView,tables:tablesView,lobby:lobbyView}[current])();
  bind();
  pollLobby();
}
function onForm(id, work) {
  $(id)?.addEventListener("submit", (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    action(() => work(body));
  });
}
function onClick(id, work) {
  $(id)?.addEventListener("click", () => action(work));
}
function bind() {
  bindMembers();
  bindReplays(api,async()=>{matches=await api("/api/arena/matches");});
  onForm("#table-form", async body => {
    const table = await api("/api/tables", {game:arenaGame,name:body.name,practice:false,round_limit:20,lobby:true});
    location.assign(table.url);
  });
  const room = route => `/api/tables/${lobbyRoute()?.id}/lobby${route}`;
  onClick("#lobby-join", async () => { lobby = await api(room("/join"), {invite:lobbyRoute().invite}); location.hash = `#lobby/${lobbyRoute().id}`; });
  onClick("#lobby-leave", async () => { await api(room("/leave"), {}); location.hash = "#tables"; });
  // The Prestige target saves on its own and redraws only the room (rules #victory-target).
  $("#lobby-target")?.addEventListener("change", async () => {
    const body = {ai_rivals:lobby.ai_rivals, difficulty:lobby.difficulty, victory_target:Number($("#lobby-target").value)};
    try { lobby = await api(room("/settings"), body); notice(""); }
    catch (e) { notice(e.message, true); await loadLobby(); }
    finally { render(); }
  });
  onClick("#lobby-start", async () => { lobby = await api(room("/start"), {}); if (lobby.table_url) location.assign(lobby.table_url); });
  $("#copy-lobby-invite")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#lobby-invite-link").value); $("#copy-lobby-invite").textContent = "Copied"; }
    catch { $("#lobby-invite-link").select(); }
  });
  onForm("#invite-form", async body => {
    const result = await api("/api/admin/invites", {...body, days:Number(body.days),max_uses:Number(body.max_uses)});
    $("#new-invite").value = result.url;
    $("#copy-invite").textContent = "Copy link";
    $("#invite-dialog").showModal();
  });
  onForm("#invite-register-form", async body => {
    const result = await api("/api/accounts/register", {...body,invite_token:inviteToken()});
    showKey(result.recovery_key);
    location.hash = invitation.role === "admin" ? "admin" : "tables";
  });
  onClick("#accept-invite", async () => {
    await api("/api/invites/accept",{token:inviteToken()});
    if (resume()) return;
    location.hash = invitation.role === "admin" ? "admin" : "tables";
    notice("Invitation accepted. Welcome to Galactic Reach.");
  });
  document.querySelectorAll("[data-revoke-invite]").forEach(b => b.addEventListener("click",()=>action(async()=>{
    await api(`/api/admin/invites/${encodeURIComponent(b.dataset.revokeInvite)}/revoke`,{});
    notice("Invitation revoked. Existing player accounts stay active.");
  })));

  onForm("#register-form", async (body) => {
    const r = await api("/api/accounts/register", body);
    showKey(r.recovery_key);
  });
  onForm("#login-form", async (body) => {
    await api("/api/accounts/login", body);
    $("#recovery-key").value = "";
    notice("Welcome back. Your account is restored.");
    if (returnPath && page() !== "invite") location.assign(returnPath);
  });
  onForm("#profile-form", async (body) => {
    await api("/api/account", body);
    notice(
      "Display name saved. Existing tables keep the name used when joining.",
    );
  });
  onForm("#bot-form", async (body) => {
    await api("/api/arena/bots", { ...body, game: arenaGame });
    notice("AI account created. Run matches to calibrate its rating.");
  });
  $("#bot-strategy")?.addEventListener("change", (e) => {
    $("#policy-description").textContent = arenaPolicies().find(
      (p) => p.id === e.target.value,
    ).description;
  });
  onForm("#series-form", async (body) => {
    const bots = Array.from({length: arenaInfo().seats}, (_, i) => body[`seat${i}`]);
    if (new Set(bots).size !== bots.length) throw new Error("Choose a different AI player for each seat.");
    const signature = JSON.stringify([arenaGame, bots, Number(body.games)]);
    if (pendingSeries?.signature !== signature)
      pendingSeries = { signature, request_id: crypto.randomUUID() };
    notice(
      "Matches are running. The server will save the complete series and ratings together.",
    );
    await api("/api/arena/series", {
      request_id: pendingSeries.request_id,
      bots,
      game: arenaGame,
      games: Number(body.games),
    });
    pendingSeries = undefined;
    notice(`${body.games} matches complete. Your ladder is up to date.`);
  });
  onClick("#starter-roster", async () => {
    for (const p of arenaPolicies())
      await api("/api/arena/bots", { name: p.name, strategy: p.id, game: arenaGame });
    notice("Your reference players are ready.");
  });
  onClick("#logout", async () => {
    await api("/api/auth/logout", {});
    pendingSeries = undefined;
    notice("Signed out of this browser.");
  });
  onClick("#revoke", async () => {
    await api("/api/account/revoke-sessions", {});
    notice("Other browser sessions have been signed out.");
  });
  onClick("#rotate", async () => {
    const r = await api("/api/account/rotate-key", {});
    showKey(r.recovery_key);
  });
}
$("#saved-key").addEventListener(
  "change",
  (e) => ($("#close-key").disabled = !e.target.checked),
);
$("#key-dialog").addEventListener("cancel", (e) => e.preventDefault());
$("#close-key").addEventListener("click", () => {
  $("#key-dialog").close();
  $("#new-key").value = "";
  if (returnPath) location.assign(returnPath);
});
$("#copy-key").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#new-key").value);
    $("#copy-key").textContent = "Copied";
  } catch {
    $("#new-key").select();
    $("#copy-key").textContent = "Select and copy above";
  }
});
$("#download-key").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob(
      [
        "Galactic Reach recovery key\nKeep private. Anyone with this key can sign in.\n\n" +
          $("#new-key").value +
          "\n",
      ],
      { type: "text/plain" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "galactic-reach-recovery-key.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  $("#main").focus();
  $("#main").scrollIntoView();
});
window.addEventListener("hashchange", () => {
  if (gated() || page() === "invite" || page() === "lobby" || page() === "members") { refresh().catch(e => notice(e.message, true)); return; }
  if (catalog) {
    render();
    $("#main").focus();
  }
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted) refresh().catch((e) => notice(e.message, true));
});
const nidoError = new URLSearchParams(location.search).get("nido_error");
if (nidoError) {
  const cleaned = new URL(location.href);
  cleaned.searchParams.delete("nido_error");
  window.history.replaceState(null, "", cleaned);
}
refresh().then(() => {
  if (nidoError) notice(nidoError.slice(0, 400), true);
}).catch((e) => {
  $("#main").innerHTML =
    "<h1>Galactic Reach is unavailable.</h1><p>Check your connection and reload to try again.</p>";
  notice(e.message, true);
});

$("#close-invite").addEventListener("click",()=> { $("#invite-dialog").close(); $("#new-invite").value=""; });
$("#copy-invite").addEventListener("click",async()=> {
  try { await navigator.clipboard.writeText($("#new-invite").value); $("#copy-invite").textContent="Copied"; }
  catch { $("#new-invite").select(); $("#copy-invite").textContent="Select and copy above"; }
});
