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
  invitation,
  inviteError,
  busy = false,
  pendingSeries;
let arenaGame = new URLSearchParams(location.search).get("game") === "galactic-reach" ? "galactic-reach" : "voidwright";
const returnPath = (() => {
  const path = new URLSearchParams(location.search).get("return_to") || "";
  return /^(?:\/galactic-reach\/\?table=[a-f0-9]{32}|\/voidwright\/(?:#table\/[a-f0-9]{32})?)$/.test(path) ? path : "";
})();
const arenaInfo = () => catalog.games.find(g => g.id === arenaGame);
const arenaPolicies = () => catalog.policies.filter(p => p.game === arenaGame);
const page = () =>
  ["arena", "account", "tables", "admin"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : location.hash.startsWith("#invite/") ? "invite" : "library";
const inviteToken = () => /^#invite\/([a-f0-9]{64})$/.exec(location.hash)?.[1];
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
async function refresh() {
  session = await api("/api/session");
  if (session.user)
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
  if (inviteToken()) {
    try { invitation = await api("/api/invites/inspect", {token:inviteToken()}); inviteError = null; }
    catch (e) { invitation = null; inviteError = e.message; }
  }
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
      "YOUR NEXT EXPEDITION",
      "Good games start here.",
      "Explore a new world. Build a better rival. Make yourself at home.",
      '<span class="live-dot"></span> PLAYTEST LAB',
    ) +
    `
  <div class="section-head"><h2>The game shelf</h2><small>02 EXPERIMENTS / ALWAYS EVOLVING</small></div>
  <section class="hero"><div class="hero-copy"><span class="badge cyan">FEATURED PLAYTEST</span><h2>Galactic Reach</h2><p>A galaxy of possibilities. Command your faction, build your fleet, and chart a path to the stars.</p><div class="meta"><span>1 player + 3 AI</span><span>4X strategy</span><span>Saved tables</span></div><a class="primary" href="/?game=galactic-reach#tables">Create a table <span>↗</span></a><a class="text-link guest-link" href="/galactic-reach/">Play as a guest · saved in this browser →</a></div><div class="hero-art">${galaxy}<span class="art-label">EXPLORE / BUILD / OUTMANEUVER</span></div></section>
  <div class="cards"><section class="panel game-card"><div class="card-icon" aria-hidden="true">⟁</div><div><small style="color:var(--gold)">DECK-BUILDING STRATEGY</small><h3>Voidwright</h3><p>Build an engine. Claim the frontier. A shared table for you and your next rival.</p><a class="text-link" href="/?game=voidwright#tables">Create a table →</a></div></section><section class="panel game-card"><span class="arena-icon" aria-hidden="true">◇</span><div><small style="color:var(--purple)">A DIFFERENT KIND OF PLAYTEST</small><h3>Meet your next challenger.</h3><p>Create AI players, run matches, and discover how their strategies compare.</p><a class="text-link" href="#arena">Explore the AI arena →</a></div></section></div>
  <div class="section-head"><h2>Your tables</h2><a class="text-link" href="#tables">View all / create new →</a></div><section class="panel">${tableList()}</section>`
  );
}
function tableList() {
  if (!profile) return `<div class="empty"><span aria-hidden="true">◎</span><h3>A seat with your name on it.</h3><p>Sign in to save named tables and return from another browser.</p><a class="secondary" href="#account">Sign in or create an account</a></div>`;
  if (!tables.length) return '<div class="empty"><h3>Your first table is waiting.</h3><p>Create a named game of Galactic Reach or Voidwright. It will be waiting here when you return.</p></div>';
  return tables.map(g => `<a class="table-link" href="${esc(g.url)}"><div><strong>${esc(g.name)}</strong><small>${g.game === "galactic-reach" ? "Galactic Reach · Solo + 3 AI" : `Voidwright · ${g.players} players`} · Rules ${esc((g.rules_version || "unknown").split("/").pop())} · Round ${g.round} · ${esc(g.status)}</small></div><span>${g.status === "new" ? "Start" : "Open"} table ↗</span></a>`).join("");
}
function tablesView() {
  return head("A PLACE TO PICK UP WHERE YOU LEFT OFF", "Your tables.", "Name a game and return whenever you’re ready. Each table keeps the rules version it started with.") +
    `<div class="split"><section class="panel"><h2>Saved games</h2>${tableList()}</section><section class="panel"><h2>Create a table</h2>${profile ? `<form id="table-form"><label for="table-game">Game</label><select id="table-game" name="game"><option value="galactic-reach" ${arenaGame === "galactic-reach" ? "selected" : ""}>Galactic Reach</option><option value="voidwright" ${arenaGame === "voidwright" ? "selected" : ""}>Voidwright</option></select><p class="hint">New Galactic Reach tables use rules 6.11 · card upgrades and placement Elo.</p><label for="table-name">Table name</label><input id="table-name" name="name" required maxlength="60" placeholder="Friday expedition"><div id="voidwright-options" ${arenaGame !== "voidwright" ? "hidden" : ""}><label for="table-mode">Play with</label><select id="table-mode" name="mode"><option value="practice">Kepler AI</option><option value="friends">Friends · share the table link</option></select></div><p class="form-note" id="table-description">${tableDescription(arenaGame)}</p><button class="primary">Create and open table →</button></form>` : '<p>Sign in to create a table saved to your account.</p><a class="primary" href="#account">Sign in →</a><hr class="divider"><a class="text-link" href="/galactic-reach/">Play Galactic Reach as a guest →</a>'}</section></div>`;
}
function tableDescription(game) {
  return game === "galactic-reach" ? "Your faction against three AIs. Private, unrated, and saved to your account. Your guest game stays separate." : "Play a 20-round practice game or open a table for friends. Each player needs an account. Tables are unrated.";
}
function roster() {
  if (!arena.bots.length)
    return `<div class="empty"><span aria-hidden="true">◇</span><h3>Give a strategy a seat.</h3><p>Start with ${arenaPolicies().map(p => esc(p.name)).join(", ")}: different approaches to the same game.</p><button class="primary" id="starter-roster">Create reference roster →</button></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>AI PLAYER</th><th>ELO</th><th>RECORD</th></tr></thead><tbody>${arena.bots.map((b) => `<tr><td><div class="bot-name"><span class="bot-glyph" aria-hidden="true">◇</span><div>${esc(b.name)}<small>${esc(b.policy)}</small>${arenaGame === "voidwright" ? `<button class="practice-link" data-practice="${esc(b.id)}">Practice ↗</button>` : ""}</div></div></td><td><span class="rating">${Math.round(b.elo)}</span><div class="rating-bar" aria-hidden="true"><i style="width:${Math.max(5, Math.min(100, (b.elo - 800) / 8))}%"></i></div></td><td>${arenaGame === "galactic-reach" ? `${b.wins} first · ${b.draws} tied first` : `${b.wins}W · ${b.draws}D · ${b.games-b.wins-b.draws}L`}<small>${b.games < 20 ? `${b.games}/20 · Provisional` : `${b.games} games`}</small></td></tr>`).join("")}</tbody></table></div>`;
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
  intro += `<div class="panel arena-picker"><label for="arena-game">Arena game</label><select id="arena-game">${catalog.games.filter(g => g.rated).map(g => `<option value="${esc(g.id)}" ${g.id === arenaGame ? "selected" : ""}>${esc(g.name)} · ${g.seats} players</option>`).join("")}</select><p class="form-note">Each game has its own AI players, match history, and Elo ladder.</p></div>`;
  if (!profile)
    return (
      intro +
      `<section class="panel"><div class="empty"><span aria-hidden="true">◇</span><h3>Your own strategy lab.</h3><p>Sign in to create AI accounts, run paired matches, and keep a persistent Elo ladder.</p><a href="#account" class="primary">Open your account →</a></div></section><div class="cards">${arenaPolicies().map((p) => `<div class="panel"><div class="eyebrow">${esc(p.version)}</div><h2>${esc(p.name)}</h2><p>${esc(p.description)}</p></div>`).join("")}</div>`
    );
  const games = arena.bots.reduce((n, b) => n + b.games, 0) / arenaInfo().seats;
  const top = arena.bots.find((b) => b.games > 0);
  return (
    intro +
    `<p class="hint">Active rules: ${esc(arenaInfo().rules_version)} · ${arenaGame === "galactic-reach" ? "Placement Elo · policies v3" : "Duel Elo"}</p><div class="stat-grid"><div class="stat"><span>YOUR AI PLAYERS</span><strong>${arena.bots.length.toString().padStart(2, "0")}</strong><small>${12 - arena.bots.length} seats available</small></div><div class="stat"><span>COMPLETED MATCHES</span><strong>${games.toString().padStart(2, "0")}</strong><small>Rotated starting seats</small></div><div class="stat"><span>HIGHEST RATING</span><strong>${top ? Math.round(top.elo) : "—"}</strong><small>${top ? "In your lab" : "Awaiting matches"}</small></div></div>
  <div class="split"><div><section class="panel"><div class="panel-heading"><h2>Your AI ladder</h2><span class="badge cyan">Elo · K 32</span></div>${roster()}<p class="hint"><strong>Difficulty is measured, not assigned.</strong><br>Everyone starts at 1200. Ratings compare players in your lab ${arenaGame === "voidwright" ? "using 20-round Voidwright duels" : "using four-faction Long Reach matches to 20 Prestige"}. The first 20 games are provisional; a rating is not a universal difficulty level. ${arenaGame === "voidwright" ? "Practice games against you are unrated." : "Elo compares every pair by final placement: Prestige, then colonies, then resources. Exact ties split the result. Earlier win/loss pools stay separate. Browser tables are unrated."}</p></section><section class="panel" style="margin-top:20px"><div class="panel-heading"><h2>Recent series</h2><small>LAST 10</small></div>${history()}</section></div><div><section class="panel"><div class="eyebrow">PUT THEM TO THE TEST</div><h2>Run a series</h2><p>Each group of ${arenaInfo().seats} matches uses the same game seed and rotates every AI through every starting seat.</p>${arena.bots.length >= arenaInfo().seats ? `<form id="series-form">${Array.from({length: arenaInfo().seats}, (_, i) => `<label for="bot-${i}">Challenger ${i + 1}</label><select id="bot-${i}" name="seat${i}">${arena.bots.map((b, j) => `<option value="${esc(b.id)}" ${j === i ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>`).join("")}<label for="series-games">Games in series</label><select id="series-games" name="games">${(arenaInfo().seats === 2 ? [2,10,20] : [4,8,12,20]).map(n => `<option value="${n}">${n} games · ${n / arenaInfo().seats} full seat rotation${n > arenaInfo().seats ? "s" : ""}</option>`).join("")}</select><button class="primary">Run matches →</button><p class="form-note">Ratings update only after the whole series completes. ${arenaGame === "voidwright" ? "Usually a few seconds." : "Long Reach series may take several minutes."}</p></form>` : `<p class="hint">Create at least ${arenaInfo().seats} AI accounts to start a series.</p>`}</section><section class="panel" style="margin-top:20px"><h2>Create an AI player</h2><form id="bot-form"><label for="bot-name">Player name</label><input id="bot-name" name="name" required maxlength="32" placeholder="Name your new challenger"><label for="bot-strategy">Strategy</label><select id="bot-strategy" name="strategy">${arenaPolicies().map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(p.version)}</option>`).join("")}</select><p id="policy-description" class="form-note">${esc(arenaPolicies()[0].description)}</p><button class="primary" ${arena.bots.length >= 12 ? "disabled" : ""}>Create AI account +</button></form></section></div></div>` + (arenaGame === "galactic-reach" ? matchList(matches) : "")
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
      `<div class="split"><section class="panel"><div class="eyebrow">PLAYER PROFILE</div><h2>Your identity</h2><form id="profile-form"><label for="profile-name">Display name</label><input name="name" id="profile-name" value="${esc(profile.name)}" required maxlength="32"><button class="primary">Save display name</button></form><hr class="divider"><div class="detail-list"><div><span>Sign-in method</span><b>${profile.has_recovery_key ? "Private recovery key" : profile.development ? "Temporary playtest identity" : "Nido wallet"}</b></div><div><span>Active browser sessions</span><b>${profile.sessions}</b></div><div><span>AI players in your lab</span><b>${arena.bots.length} (${esc(arenaInfo().name)})</b></div></div><small class="mono">${esc(profile.id)}</small>${profile.development ? '<p class="hint">This is a temporary identity. To keep a recoverable account, sign out and create an account with a recovery key.</p>' : ""}</section><section class="panel"><div class="eyebrow">ACCOUNT ACCESS</div><h2>Keep your seat secure.</h2><p>Sessions expire after 24 hours. ${profile.has_recovery_key ? "Use your saved recovery key to return to this same account." : profile.id.startsWith("nido:") ? "Sign in with this Nido wallet to return. Wallet recovery and passkeys are managed in Nido." : "Return with your usual sign-in method."}</p>${profile.id.startsWith("nido:") ? `<p><a class="text-link" href="https://${encodeURIComponent(profile.id.slice(5).toLowerCase())}.nido.fyi/" target="_blank" rel="noopener noreferrer">Manage your Nido wallet ↗</a></p>` : ""}<button class="secondary" id="revoke">Sign out other sessions</button>${profile.has_recovery_key ? `<hr class="divider"><h3>Replace your recovery key</h3><p>Your old key will stop working and all other sessions will be signed out. Save the new key before leaving this page.</p><button class="secondary" id="rotate">Replace recovery key</button>` : ""}<hr class="divider"><button class="secondary" id="logout">Sign out of this browser</button></section></div>`
    );
  return (
    head(
      "YOUR NEXT CHAPTER.",
      "Your place in the lab.",
      "Create an account once. Return to your tables and AI players from any browser.",
    ) +
    (session.nido_available ? `<section class="panel nido-signin"><div><div class="eyebrow">SIGN IN WITH A PASSKEY</div><h2>Your Nido. Your seat.</h2><p>Use your Nido wallet to create an account or return to it. No enrollment code or recovery key needed.</p><p class="form-note">Current Nido testnet wallets with a single admin passkey. You’ll approve a sign-in message in Nido.</p></div><a class="primary" href="/api/auth/nido?return_to=${encodeURIComponent(returnPath || '/?game=' + arenaGame + '#account')}">Continue with Nido ↗</a></section>` : "") +
    `<div class="cards"><section class="panel"><div class="eyebrow">NEW TO THE LAB</div><h2>Create with a recovery key</h2><p>You’ll receive a private recovery key. Save it to sign in again.</p>${session.registration_available ? `<form id="register-form"><label for="register-name">Display name</label><input id="register-name" name="name" required maxlength="32" autocomplete="nickname" placeholder="What should we call you?">${!session.dev_auth ? '<label for="enrollment-code">Playtest enrollment code</label><input id="enrollment-code" name="code" type="password" required autocomplete="off"><p class="form-note">Use an invitation link from the host, or enter the enrollment code.</p>' : ""}<button class="primary">Create account →</button></form>` : '<p class="hint">Recovery-key enrollment is closed. Use Nido above when available, or ask the host for an invitation link.</p>'}</section><section class="panel"><div class="eyebrow">WELCOME BACK</div><h2>Recover your seat</h2><p>Use your saved recovery key to sign in to your existing account.</p><form id="login-form"><label for="recovery-key">Private recovery key</label><input id="recovery-key" name="recovery_key" type="password" required autocomplete="current-password" placeholder="dbk_…"><button class="primary">Sign in →</button></form></section></div><p class="hint">Your recovery key is your credential. Store it privately. Display names are not unique and cannot be used to sign in. Guest games stay on this device. Account tables are saved on the server.</p>`
  );
}
function adminView() {
  if (!profile?.is_admin) return head("HOST TOOLS", "Administrator access", "Sign in with the administrator account to manage invitations.");
  const status = i => i.revoked ? "Revoked" : i.expires * 1000 <= Date.now() ? "Expired" : i.uses >= i.max_uses ? "Used" : "Active";
  return head("BRING PEOPLE TO THE TABLE", "Invite your next player.", "Create a link, share it privately, and keep track of the seats you’ve offered.") +
    `<div class="split"><section class="panel"><h2>Create an invitation</h2><form id="invite-form"><label for="invite-label">Who is it for?</label><input id="invite-label" name="label" maxlength="80" required placeholder="Friday game night"><label for="invite-days">Expires in</label><select id="invite-days" name="days"><option value="1">24 hours</option><option value="7" selected>7 days</option><option value="30">30 days</option></select><label for="invite-uses">Number of people</label><input id="invite-uses" name="max_uses" type="number" min="1" max="20" value="1" required><button class="primary">Create invite link →</button><p class="form-note">Invites create player accounts. They never grant administrator access. Copy the link when it appears; it is shown once.</p></form></section><section class="panel"><h2>Your invitations</h2>${invitations.length ? invitations.map(i => `<article class="invitation-row"><strong>${esc(i.label)}</strong><p>${i.uses}/${i.max_uses} people · ${status(i)}<br>Expires ${new Date(i.expires*1000).toLocaleDateString()} · Created by ${esc(i.created_by)}</p>${status(i)==="Active" ? `<button class="secondary" data-revoke-invite="${esc(i.id)}">Revoke link</button>` : ""}</article>`).join("") : '<p>No invitations yet. Create your first link.</p>'}</section></div>`;
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
    library: "Game library",
    arena: "AI arena",
    account: "Your account",
    admin: "Invitations",
    tables: "Your tables",
    invite: "Your invitation",
  }[current];
  $("#admin-nav").hidden = !profile?.is_admin;
  $("#account-link").innerHTML = profile
    ? `<span class="avatar">${esc(profile.name.slice(0, 1).toUpperCase())}</span>${esc(profile.name)}`
    : "Sign in <span>↗</span>";
  $("#main").innerHTML = ({arena:arenaView,account:accountView,library:libraryView,admin:adminView,invite:inviteView,tables:tablesView}[current])();
  bind();
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
  bindReplays(api,async()=>{matches=await api("/api/arena/matches");});
  onForm("#table-form", async body => {
    const table = await api("/api/tables", {game:body.game,name:body.name,practice:body.mode === "practice",round_limit:20});
    location.assign(table.url);
  });
  $("#table-game")?.addEventListener("change", e => {
    $("#voidwright-options").hidden = e.target.value !== "voidwright";
    $("#table-description").textContent = tableDescription(e.target.value);
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
    location.hash = invitation.role === "admin" ? "admin" : "tables";
    notice("Invitation accepted. Welcome to the lab.");
  });
  document.querySelectorAll("[data-revoke-invite]").forEach(b => b.addEventListener("click",()=>action(async()=>{
    await api(`/api/admin/invites/${encodeURIComponent(b.dataset.revokeInvite)}/revoke`,{});
    notice("Invitation revoked. Existing player accounts stay active.");
  })));

  $("#arena-game")?.addEventListener("change", e => {
    if (busy) { e.target.value = arenaGame; return; }
    arenaGame = e.target.value;
    const url = new URL(location.href);
    url.searchParams.set("game", arenaGame);
    window.history.replaceState(null, "", url);
    pendingSeries = undefined;
    action(async () => {});
  });
  for (const button of document.querySelectorAll("[data-practice]"))
    button.addEventListener("click", () =>
      action(async () => {
        const game = await api("/api/games", {
          name: `Practice with ${botName(button.dataset.practice)}`,
          practice: true,
          round_limit: 20,
          opponent_id: button.dataset.practice,
        });
        location.assign(`/voidwright/#table/${encodeURIComponent(game.id)}`);
      }),
    );
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
        "Drawing Board recovery key\nKeep private. Anyone with this key can sign in.\n\n" +
          $("#new-key").value +
          "\n",
      ],
      { type: "text/plain" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "drawing-board-recovery-key.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  $("#main").focus();
  $("#main").scrollIntoView();
});
window.addEventListener("hashchange", () => {
  if (page() === "invite") { refresh().catch(e => notice(e.message, true)); return; }
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
    "<h1>The lab is unavailable.</h1><p>Check your connection and reload to try again.</p>";
  notice(e.message, true);
});

$("#close-invite").addEventListener("click",()=> { $("#invite-dialog").close(); $("#new-invite").value=""; });
$("#copy-invite").addEventListener("click",async()=> {
  try { await navigator.clipboard.writeText($("#new-invite").value); $("#copy-invite").textContent="Copied"; }
  catch { $("#new-invite").select(); $("#copy-invite").textContent="Select and copy above"; }
});
