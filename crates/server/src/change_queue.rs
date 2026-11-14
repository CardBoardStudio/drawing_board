//! Administrator repository tooling, isolated from game state and guest saves.
use crate::*;
use axum::extract::{Extension, Query};
use reqwest::Method;
use serde_json::Value;
use std::collections::BTreeMap;

const REPOSITORY: &str = "CardBoardStudio/drawing_board";
const LABEL: &str = "drawing-board-change";
const MARKER: &str = "<!-- drawing-board-change-queue:v1 ";
const API_VERSION: &str = "2022-11-28";
const REQUIRED_CHECKS: [&str; 4] = [
    "Galactic Reach JavaScript checks",
    "Rust checks and Wasm",
    "Preview container smoke",
    "Rules contract",
];

pub struct Config {
    connections: tokio::sync::RwLock<BTreeMap<String, Connection>>,
    base: String,
    preview: bool,
    writes: tokio::sync::Mutex<()>,
}
struct Connection {
    github: GitHub,
    expires: std::time::Instant,
}
#[derive(Clone)]
struct GitHub {
    client: reqwest::Client,
    token: String,
    base: String,
}
impl Config {
    pub fn from_env() -> Self {
        Self::new(std::env::var("IS_PULL_REQUEST").as_deref() == Ok("true"))
    }
    fn new(preview: bool) -> Self {
        Self {
            connections: tokio::sync::RwLock::new(BTreeMap::new()),
            base: "https://api.github.com".into(),
            preview,
            writes: tokio::sync::Mutex::new(()),
        }
    }
    async fn github(&self, owner: &str) -> ApiResult<GitHub> {
        let mut connections = self.connections.write().await;
        connections.retain(|_, connection| connection.expires > std::time::Instant::now());
        connections
            .get(owner)
            .map(|c| c.github.clone())
            .ok_or(ApiError(
                StatusCode::SERVICE_UNAVAILABLE,
                "Connect GitHub to manage the repository queue. Connections expire after one hour."
                    .into(),
            ))
    }
}
impl GitHub {
    fn new(token: String, base: String) -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(20))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("GitHub HTTP client"),
            token,
            base,
        }
    }
    async fn request(&self, method: Method, path: &str, body: Option<Value>) -> ApiResult<Value> {
        let mut request = self
            .client
            .request(
                method,
                format!(
                    "{}/repos/{REPOSITORY}{}",
                    self.base,
                    if path.is_empty() {
                        String::new()
                    } else {
                        format!("/{path}")
                    }
                ),
            )
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", API_VERSION)
            .header("User-Agent", "DrawingBoard-ChangeQueue");
        if let Some(body) = body {
            request = request.json(&body);
        }
        let mut response = request.send().await.map_err(|_| github_unavailable())?;
        let status = response.status();
        if !status.is_success() {
            let (code, message) = match status.as_u16() {
                401 | 403 => (
                    StatusCode::BAD_GATEWAY,
                    "The GitHub connection is unavailable or lacks the required repository permissions. Check the connection or rate limit.",
                ),
                404 => (
                    StatusCode::NOT_FOUND,
                    "This repository item is unavailable to the GitHub connection.",
                ),
                409 | 405 => (
                    StatusCode::CONFLICT,
                    "GitHub could not merge this revision. Refresh the PR and review its current state.",
                ),
                422 => (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "GitHub rejected the request. Refresh and check the title, labels or merge policy.",
                ),
                _ => (
                    StatusCode::BAD_GATEWAY,
                    "GitHub is temporarily unavailable. Refresh before retrying a write.",
                ),
            };
            return Err(ApiError(code, message.into()));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| github_unavailable())? {
            if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
                return Err(github_unavailable());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| github_unavailable())
    }
    async fn get(&self, path: &str) -> ApiResult<Value> {
        self.request(Method::GET, path, None).await
    }
}
fn github_unavailable() -> ApiError {
    ApiError(
        StatusCode::BAD_GATEWAY,
        "GitHub did not return a usable response. Refresh before retrying a write.".into(),
    )
}
fn administrator(app: &App, headers: &HeaderMap) -> ApiResult<String> {
    let owner = user(app, headers)?;
    if owner.development || !invites::is_admin(&*app.store.0.lock().map_err(internal)?, &owner.id)?
    {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Administrator access is required for the change queue.".into(),
        ));
    }
    Ok(owner.id)
}
pub fn routes(config: Arc<Config>) -> Router<App> {
    Router::new()
        .route("/api/admin/change-queue", get(list).post(create))
        .route("/api/admin/change-queue/connect", post(connect))
        .route("/api/admin/change-queue/disconnect", post(disconnect))
        .route("/api/admin/change-queue/issues/{number}", post(update))
        .route("/api/admin/change-queue/pulls/{number}", get(pull))
        .route("/api/admin/change-queue/pulls/{number}/merge", post(merge))
        .layer(Extension(config))
}
#[derive(Deserialize)]
pub struct ConnectInput {
    token: String,
}
pub async fn connect(
    State(app): State<App>,
    headers: HeaderMap,
    Extension(config): Extension<Arc<Config>>,
    Json(input): Json<ConnectInput>,
) -> ApiResult<Json<Value>> {
    let owner = administrator(&app, &headers)?;
    if config.preview {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Repository connections are disabled on PR previews. Test with the local mock fixture."
                .into(),
        ));
    }
    let url = url::Url::parse(&app.origin).map_err(|_| bad("Invalid host origin."))?;
    let loopback = url.scheme() == "http"
        && url.host_str().is_some_and(|h| {
            h == "localhost"
                || h.trim_matches(['[', ']'])
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        });
    if url.scheme() != "https" && !loopback {
        return Err(bad("GitHub connections require HTTPS or local loopback."));
    }
    let token = input.token.trim().to_string();
    if !token.starts_with("github_pat_")
        || token.len() < 25
        || token.len() > 255
        || !token.bytes().all(|c| c.is_ascii_graphic())
    {
        return Err(bad(
            "Use a fine-grained GitHub token restricted to this repository.",
        ));
    }
    let github = GitHub::new(token, config.base.clone());
    let repository = github.get("").await?;
    if repository["full_name"] != REPOSITORY || repository["permissions"]["push"] != true {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "The connection must have write access to CardBoardStudio/drawing_board.".into(),
        ));
    }
    let _guard = config.writes.lock().await;
    config.connections.write().await.insert(
        owner,
        Connection {
            github,
            expires: std::time::Instant::now() + std::time::Duration::from_secs(3600),
        },
    );
    Ok(Json(
        json!({"connected":true,"repository":REPOSITORY,"expires_in":3600}),
    ))
}
pub async fn disconnect(
    State(app): State<App>,
    headers: HeaderMap,
    Extension(config): Extension<Arc<Config>>,
) -> ApiResult<Json<Value>> {
    let owner = administrator(&app, &headers)?;
    let _guard = config.writes.lock().await;
    config.connections.write().await.remove(&owner);
    Ok(Json(json!({"connected":false})))
}
#[derive(Deserialize)]
pub struct Page {
    #[serde(default = "first_page")]
    page: u32,
}
fn first_page() -> u32 {
    1
}
fn items(value: &Value) -> ApiResult<&Vec<Value>> {
    value.as_array().ok_or_else(github_unavailable)
}
fn pr_summary(pr: &Value) -> Value {
    let number = pr["number"].as_u64().unwrap_or(0);
    json!({"number":number,"title":pr["title"],"state":pr["state"],"draft":pr["draft"],"merged":pr["merged"],"url":format!("https://github.com/{REPOSITORY}/pull/{number}"),"head":pr["head"]["sha"],"base":pr["base"]["ref"],"labels":pr["labels"].as_array().map(|a|a.iter().filter_map(|l|l["name"].as_str()).collect::<Vec<_>>()).unwrap_or_default()})
}
fn metadata(body: &str) -> Option<(usize, Vec<u64>)> {
    let start = body.rfind(MARKER)?;
    let tail = body[start + MARKER.len()..].trim_end();
    let json = tail.strip_suffix(" -->")?;
    let data: Value = serde_json::from_str(json).ok()?;
    let prs: Vec<u64> = data["pull_requests"]
        .as_array()?
        .iter()
        .map(Value::as_u64)
        .collect::<Option<_>>()?;
    if prs.len() > 10 || prs.contains(&0) {
        return None;
    }
    Some((start, prs))
}
fn issue_summary(issue: &Value) -> Value {
    let body = issue["body"].as_str().unwrap_or("");
    let (start, prs) = metadata(body).unwrap_or((body.len(), vec![]));
    let number = issue["number"].as_u64().unwrap_or(0);
    json!({"number":number,"title":issue["title"],"description":body[..start].trim(),"state":issue["state"],"pull_requests":issue.get("queue_pull_requests").cloned().unwrap_or(json!(prs)),"revision":issue.get("queue_revision").cloned().unwrap_or(json!(digest(body))),"url":format!("https://github.com/{REPOSITORY}/issues/{number}"),"updated_at":issue["updated_at"]})
}
async fn hydrate_issue(github: &GitHub, mut issue: Value) -> ApiResult<Value> {
    let count = issue["comments"].as_u64().unwrap_or(0);
    if count > 1000 {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This request has too much comment history to load safely. Review it on GitHub.".into(),
        ));
    }
    let number = issue["number"].as_u64().ok_or_else(github_unavailable)?;
    for page in (1..=count.div_ceil(100)).rev() {
        let comments = github
            .get(&format!(
                "issues/{number}/comments?per_page=100&page={page}"
            ))
            .await?;
        for comment in items(&comments)?.iter().rev() {
            if let Some((_, prs)) = metadata(comment["body"].as_str().unwrap_or("")) {
                let id = comment["id"].as_u64().ok_or_else(github_unavailable)?;
                issue["queue_revision"] = json!(digest(&format!(
                    "{}:{id}",
                    issue["body"].as_str().unwrap_or("")
                )));
                issue["queue_pull_requests"] = json!(prs);
                return Ok(issue);
            }
        }
    }
    Ok(issue)
}
fn tracked(issue: &Value) -> bool {
    issue.get("pull_request").is_none()
        && issue["labels"]
            .as_array()
            .is_some_and(|a| a.iter().any(|l| l["name"] == LABEL))
}
pub async fn list(
    State(app): State<App>,
    headers: HeaderMap,
    Extension(config): Extension<Arc<Config>>,
    Query(page): Query<Page>,
) -> ApiResult<Json<Value>> {
    let owner = administrator(&app, &headers)?;
    if !(1..=100).contains(&page.page) {
        return Err(bad("Invalid queue page."));
    }
    let Ok(github) = config.github(&owner).await else {
        return Ok(Json(
            json!({"connected":false,"preview":config.preview,"repository":REPOSITORY,"requests":[],"pull_requests":[]}),
        ));
    };
    let issue_path = format!(
        "issues?state=open&labels={LABEL}&sort=updated&direction=desc&per_page=30&page={}",
        page.page
    );
    let pull_path = format!(
        "pulls?state=open&sort=updated&direction=desc&per_page=30&page={}",
        page.page
    );
    let (issues, pulls) = tokio::try_join!(github.get(&issue_path), github.get(&pull_path))?;
    let issues = items(&issues)?;
    let pulls = items(&pulls)?;
    let filtered = issues
        .iter()
        .filter(|i| tracked(i))
        .cloned()
        .collect::<Vec<_>>();
    let mut requests = vec![];
    for chunk in filtered.chunks(5) {
        let mut tasks = tokio::task::JoinSet::new();
        for (index, issue) in chunk.iter().enumerate() {
            let github = github.clone();
            let issue = issue.clone();
            tasks.spawn(async move {
                Ok::<_, ApiError>((index, issue_summary(&hydrate_issue(&github, issue).await?)))
            });
        }
        let mut results = vec![];
        while let Some(result) = tasks.join_next().await {
            results.push(result.map_err(internal)??);
        }
        results.sort_by_key(|(index, _)| *index);
        requests.extend(results.into_iter().map(|(_, issue)| issue));
    }
    Ok(Json(
        json!({"connected":true,"repository":REPOSITORY,"page":page.page,"more":issues.len()==30||pulls.len()==30,"requests":requests,"pull_requests":pulls.iter().map(pr_summary).collect::<Vec<_>>() }),
    ))
}
#[derive(Deserialize)]
pub struct RequestInput {
    title: String,
    description: String,
}
fn description(value: &str) -> ApiResult<String> {
    let text = value.trim();
    if text.is_empty()
        || text.len() > 10000
        || text.contains(MARKER)
        || text
            .chars()
            .any(|c| c.is_control() && !['\n', '\r', '\t'].contains(&c))
    {
        return Err(bad(
            "Use a description of 1–10,000 bytes without queue metadata.",
        ));
    }
    Ok(text.into())
}
pub async fn create(
    State(app): State<App>,
    headers: HeaderMap,
    Extension(config): Extension<Arc<Config>>,
    Json(input): Json<RequestInput>,
) -> ApiResult<Json<Value>> {
    let owner = administrator(&app, &headers)?;
    let github = config.github(&owner).await?;
    let title = clean(&input.title, 160)?;
    let body = description(&input.description)?;
    let _guard = config.writes.lock().await;
    match github.get(&format!("labels/{LABEL}")).await {
        Ok(_) => {}
        Err(e) if e.0 == StatusCode::NOT_FOUND => {
            github.request(Method::POST,"labels",Some(json!({"name":LABEL,"color":"315955","description":"Requested game repository changes and their implementation PRs"}))).await?;
        }
        Err(e) => return Err(e),
    }
    let issue = github.request(Method::POST,"issues",Some(json!({"title":title,"body":format!("{body}\n\n{MARKER}{{\"pull_requests\":[]}} -->"),"labels":[LABEL]}))).await?;
    Ok(Json(issue_summary(&issue)))
}
#[derive(Deserialize)]
pub struct LinkInput {
    revision: String,
    pull_requests: Vec<u64>,
}
pub async fn update(
    State(app): State<App>,
    headers: HeaderMap,
    Extension(config): Extension<Arc<Config>>,
    Path(number): Path<u64>,
    Json(input): Json<LinkInput>,
) -> ApiResult<Json<Value>> {
    let owner = administrator(&app, &headers)?;
    let github = config.github(&owner).await?;
    if number == 0 || input.pull_requests.len() > 10 || input.pull_requests.contains(&0) {
        return Err(bad("Link up to ten PR numbers from this repository."));
    }
    let _guard = config.writes.lock().await;
    let issue = hydrate_issue(&github, github.get(&format!("issues/{number}")).await?).await?;
    if !tracked(&issue) {
        return Err(bad("This is not a queued change request."));
    }
    if json!(input.revision) != issue_summary(&issue)["revision"] {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "The request changed on GitHub. Refresh before linking PRs.".into(),
        ));
    }
    let mut prs = input.pull_requests;
    prs.sort_unstable();
    prs.dedup();
    for pr in &prs {
        github.get(&format!("pulls/{pr}")).await?;
    }
    let names = prs
        .iter()
        .map(|n| format!("#{n}"))
        .collect::<Vec<_>>()
        .join(", ");
    let comment = format!(
        "Implementation PRs: {}\n\n{MARKER}{} -->",
        if names.is_empty() { "none" } else { &names },
        json!({"pull_requests":prs})
    );
    // Appending a comment preserves concurrent edits to the request's title/body.
    let posted = github
        .request(
            Method::POST,
            &format!("issues/{number}/comments"),
            Some(json!({"body":comment})),
        )
        .await?;
    let id = posted["id"].as_u64().ok_or_else(github_unavailable)?;
    let mut result = issue_summary(&issue);
    result["pull_requests"] = json!(prs);
    result["revision"] = json!(digest(&format!(
        "{}:{id}",
        issue["body"].as_str().unwrap_or("")
    )));
    Ok(Json(result))
}
fn valid_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|c| c.is_ascii_hexdigit())
}
fn blockers(
    pr: &Value,
    checks: &Value,
    statuses: &Value,
    reviews: &Value,
    preview: &Value,
) -> Vec<String> {
    let mut reasons = vec![];
    if pr["state"] != "open" || pr["merged"] == true {
        reasons.push("This PR is no longer open.".into());
    }
    if pr["draft"] != false {
        reasons.push("Mark this PR ready for review first.".into());
    }
    if pr["base"]["ref"] != "main"
        || pr["base"]["repo"]["full_name"] != REPOSITORY
        || pr["head"]["repo"]["full_name"] != REPOSITORY
    {
        reasons.push("Only this repository’s PRs into main can be merged here.".into());
    }
    if pr["mergeable"] != true || pr["mergeable_state"] != "clean" {
        reasons.push("GitHub has not marked this PR clean and mergeable. Resolve conflicts or required reviews, then refresh.".into());
    }
    let labels = pr_summary(pr)["labels"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if labels
        .iter()
        .filter(|l| **l == "playtest-safe" || **l == "playtest-breaking")
        .count()
        != 1
    {
        reasons.push("Apply exactly one playtest compatibility label.".into());
    }
    let runs = checks["check_runs"].as_array();
    let total = checks["total_count"].as_u64();
    if REQUIRED_CHECKS.iter().any(|name| {
        !runs.is_some_and(|runs| {
            runs.iter().any(|run| {
                run["name"] == *name
                    && run["status"] == "completed"
                    && run["conclusion"] == "success"
                    && run["head_sha"] == pr["head"]["sha"]
                    && run["app"]["slug"] == "github-actions"
            })
        })
    }) {
        reasons.push("All four repository CI checks must succeed for this exact head.".into());
    }
    if runs.is_none()
        || total.is_none()
        || total.unwrap_or(101) > 100
        || total.unwrap_or(101) as usize != runs.map_or(0, Vec::len)
    {
        reasons.push("Complete current-head check evidence is unavailable.".into());
    }
    if runs.is_some_and(|runs| {
        runs.iter().any(|c| {
            c["status"] != "completed"
                || !matches!(
                    c["conclusion"].as_str(),
                    Some("success" | "neutral" | "skipped")
                )
        })
    }) {
        reasons.push("Wait for every current-head check to pass.".into());
    }
    let status_count = statuses["total_count"].as_u64();
    if status_count.is_none() || (status_count.unwrap_or(0) > 0 && statuses["state"] != "success") {
        reasons.push("Commit status checks are incomplete or have failed.".into());
    }
    if total == Some(0) && status_count == Some(0) {
        reasons.push("No checks have run for this head commit.".into());
    }
    let mut decisions = BTreeMap::new();
    if let Some(reviews) = reviews.as_array() {
        if reviews.len() >= 100 {
            reasons.push("Review history is truncated. Review this PR on GitHub.".into());
        }
        for review in reviews {
            if matches!(
                review["state"].as_str(),
                Some("APPROVED" | "CHANGES_REQUESTED" | "DISMISSED")
            ) {
                decisions.insert(
                    review["user"]["login"].as_str().unwrap_or(""),
                    review["state"].as_str().unwrap_or(""),
                );
            }
        }
        if decisions.values().any(|s| *s == "CHANGES_REQUESTED") {
            reasons.push("A reviewer is requesting changes.".into());
        }
    } else {
        reasons.push("Review evidence is unavailable.".into());
    }
    if preview["state"] != "success" {
        reasons.push("A successful Render preview for this exact head is required.".into());
    }
    reasons
}
fn render_origin(value: &str) -> Option<String> {
    let url = url::Url::parse(value).ok()?;
    (url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str()?.ends_with(".onrender.com")
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path() == "/")
        .then(|| url.origin().ascii_serialization())
}
async fn deployment(config: &GitHub, sha: &str, number: Option<u64>) -> ApiResult<Value> {
    let values = config
        .get(&format!("deployments?sha={sha}&per_page=100"))
        .await?;
    for d in items(&values)? {
        let environment = d["environment"].as_str().unwrap_or("");
        let matches = number.map_or(!environment.contains("PR #"), |n| {
            environment.ends_with(&format!("PR #{n}"))
        });
        if !matches || d["sha"] != sha {
            continue;
        }
        let id = d["id"].as_u64().ok_or_else(github_unavailable)?;
        let statuses = config
            .get(&format!("deployments/{id}/statuses?per_page=1"))
            .await?;
        let Some(latest) = items(&statuses)?.first() else {
            return Ok(json!({"state":"pending"}));
        };
        let origin = latest["environment_url"]
            .as_str()
            .and_then(render_origin)
            .filter(|origin| {
                number.is_some() || origin == "https://drawing-board-p0g3.onrender.com"
            });
        return Ok(
            json!({"state":if origin.is_some(){latest["state"].as_str().unwrap_or("pending")}else{"pending"},"origin":origin,"id":id}),
        );
    }
    Ok(json!({"state":"pending"}))
}
async fn snapshot(config: &GitHub, number: u64) -> ApiResult<Value> {
    if number == 0 {
        return Err(bad("Invalid PR number."));
    }
    let pr = config.get(&format!("pulls/{number}")).await?;
    let sha = pr["head"]["sha"]
        .as_str()
        .filter(|s| valid_sha(s))
        .ok_or_else(github_unavailable)?;
    let check_path = format!("commits/{sha}/check-runs?filter=latest&per_page=100");
    let status_path = format!("commits/{sha}/status?per_page=100");
    let review_path = format!("pulls/{number}/reviews?per_page=100");
    let (checks, statuses, reviews, preview) = tokio::try_join!(
        config.get(&check_path),
        config.get(&status_path),
        config.get(&review_path),
        deployment(config, sha, Some(number))
    )?;
    let reasons = blockers(&pr, &checks, &statuses, &reviews, &preview);
    let mut result = pr_summary(&pr);
    result["body"] = pr["body"].clone();
    result["changed_files"] = pr["changed_files"].clone();
    result["additions"] = pr["additions"].clone();
    result["deletions"] = pr["deletions"].clone();
    result["checks"] = json!(
        checks["check_runs"]
            .as_array()
            .map(|a| a
                .iter()
                .map(
                    |c| json!({"name":c["name"],"status":c["status"],"conclusion":c["conclusion"]})
                )
                .collect::<Vec<_>>())
            .unwrap_or_default()
    );
    result["blockers"] = json!(reasons);
    result["preview"] = preview;
    result["merge_ready"] = json!(reasons.is_empty());
    if pr["merged"] == true
        && let Some(sha) = pr["merge_commit_sha"].as_str().filter(|s| valid_sha(s))
    {
        result["live"] = deployment(config, sha, None).await?;
    }
    Ok(result)
}
pub async fn pull(
    State(app): State<App>,
    headers: HeaderMap,
    Extension(config): Extension<Arc<Config>>,
    Path(number): Path<u64>,
) -> ApiResult<Json<Value>> {
    let owner = administrator(&app, &headers)?;
    let github = config.github(&owner).await?;
    Ok(Json(snapshot(&github, number).await?))
}
#[derive(Deserialize)]
pub struct MergeInput {
    expected_head: String,
    #[serde(default)]
    confirm: bool,
    #[serde(default)]
    acknowledge_reset: bool,
}
pub async fn merge(
    State(app): State<App>,
    headers: HeaderMap,
    Extension(config): Extension<Arc<Config>>,
    Path(number): Path<u64>,
    Json(input): Json<MergeInput>,
) -> ApiResult<Json<Value>> {
    let owner = administrator(&app, &headers)?;
    let github = config.github(&owner).await?;
    if !input.confirm || !valid_sha(&input.expected_head) {
        return Err(bad("Confirm the reviewed PR and its exact head commit."));
    }
    let _guard = config.writes.lock().await;
    let pr = snapshot(&github, number).await?;
    if pr["head"] != input.expected_head {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "The PR head changed. Refresh and review the new commit before merging.".into(),
        ));
    }
    if pr["merge_ready"] != true {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This PR is not ready. Refresh to read its merge blockers.".into(),
        ));
    }
    if pr["labels"]
        .as_array()
        .is_some_and(|a| a.iter().any(|l| l == "playtest-breaking"))
        && !input.acknowledge_reset
    {
        return Err(bad(
            "Acknowledge the new-game reset before merging a breaking playtest.",
        ));
    }
    let result=github.request(Method::PUT,&format!("pulls/{number}/merge"),Some(json!({"sha":input.expected_head,"merge_method":"merge","commit_message":"Approved in the Drawing Board developer change queue."}))).await?;
    if result["merged"] != true {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "GitHub has not merged this PR. Refresh before trying again.".into(),
        ));
    }
    Ok(Json(
        json!({"merged":true,"sha":result["sha"],"message":"Merged into main. The live game updates after checks and Render deployment succeed."}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
        routing::any,
    };
    use tower::ServiceExt;
    const TOKEN: &str = "github_pat_local_test_connection_only";
    fn ready_pr() -> Value {
        json!({"number":42,"title":"Improve the interface","state":"open","draft":false,"merged":false,"mergeable":true,"mergeable_state":"clean","head":{"sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","repo":{"full_name":REPOSITORY}},"base":{"ref":"main","repo":{"full_name":REPOSITORY}},"labels":[{"name":"playtest-safe"}],"body":"A reviewed change","changed_files":2,"additions":10,"deletions":3})
    }
    fn ready_checks() -> Value {
        json!({"total_count":4,"check_runs":REQUIRED_CHECKS.iter().map(|name|json!({"name":name,"status":"completed","conclusion":"success","head_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","app":{"slug":"github-actions"}})).collect::<Vec<_>>()})
    }
    #[test]
    fn only_complete_current_head_evidence_allows_merge() {
        let pr = ready_pr();
        let checks = ready_checks();
        let statuses = json!({"total_count":0,"state":"pending"});
        let reviews = json!([]);
        let preview = json!({"state":"success"});
        assert!(blockers(&pr, &checks, &statuses, &reviews, &preview).is_empty());
        for conclusion in ["failure", "cancelled", "timed_out", "neutral", "skipped"] {
            let mut changed = checks.clone();
            changed["check_runs"][0]["conclusion"] = json!(conclusion);
            assert!(
                !blockers(&pr, &changed, &statuses, &reviews, &preview).is_empty(),
                "{conclusion}"
            );
        }
        for (field, value) in [("total_count", json!(101)), ("check_runs", json!([]))] {
            let mut changed = checks.clone();
            changed[field] = value;
            assert!(!blockers(&pr, &changed, &statuses, &reviews, &preview).is_empty());
        }
        let mut wrong_head = checks.clone();
        wrong_head["check_runs"][0]["head_sha"] = json!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
        assert!(!blockers(&pr, &wrong_head, &statuses, &reviews, &preview).is_empty());
        let mut wrong_app = checks.clone();
        wrong_app["check_runs"][0]["app"]["slug"] = json!("another-app");
        assert!(!blockers(&pr, &wrong_app, &statuses, &reviews, &preview).is_empty());
        for state in ["pending", "failure", "error"] {
            assert!(
                !blockers(
                    &pr,
                    &checks,
                    &json!({"total_count":1,"state":state}),
                    &reviews,
                    &preview
                )
                .is_empty()
            );
        }
        assert!(
            !blockers(
                &pr,
                &checks,
                &statuses,
                &reviews,
                &json!({"state":"pending"})
            )
            .is_empty()
        );
        for (field, value) in [
            ("draft", json!(true)),
            ("state", json!("closed")),
            ("mergeable", Value::Null),
            ("mergeable_state", json!("blocked")),
            ("labels", json!([])),
            (
                "labels",
                json!([{"name":"playtest-safe"},{"name":"playtest-breaking"}]),
            ),
        ] {
            let mut changed = pr.clone();
            changed[field] = value;
            assert!(!blockers(&changed, &checks, &statuses, &reviews, &preview).is_empty());
        }
        let mut fork = pr.clone();
        fork["head"]["repo"]["full_name"] = json!("someone/another-repo");
        assert!(!blockers(&fork, &checks, &statuses, &reviews, &preview).is_empty());
        let changes = json!([{"user":{"login":"reviewer"},"state":"CHANGES_REQUESTED"},{"user":{"login":"reviewer"},"state":"COMMENTED"}]);
        assert!(!blockers(&pr, &checks, &statuses, &changes, &preview).is_empty());
        let approved = json!([{"user":{"login":"reviewer"},"state":"CHANGES_REQUESTED"},{"user":{"login":"reviewer"},"state":"APPROVED"}]);
        assert!(blockers(&pr, &checks, &statuses, &approved, &preview).is_empty());
    }
    #[test]
    fn issue_metadata_preserves_requested_prose_and_rejects_invalid_links() {
        let body = format!("Make the game clearer.\n\n{MARKER}{{\"pull_requests\":[42,43]}} -->\n");
        let issue = json!({"number":12,"body":body,"labels":[{"name":LABEL}],"state":"open"});
        assert!(tracked(&issue));
        let summary = issue_summary(&issue);
        assert_eq!(summary["description"], "Make the game clearer.");
        assert_eq!(summary["pull_requests"], json!([42, 43]));
        assert!(description(&format!("spoof {MARKER}{{}} -->")).is_err());
        assert!(metadata(&format!("{MARKER}{{\"pull_requests\":[0]}} -->")).is_none());
        assert_eq!(
            render_origin("https://drawing-board-pr-42.onrender.com/"),
            Some("https://drawing-board-pr-42.onrender.com".into())
        );
        for url in [
            "javascript:alert(1)",
            "https://evil.example/",
            "https://user:secret@x.onrender.com/",
            "https://x.onrender.com/path",
            "https://x.onrender.com/?secret=value",
        ] {
            assert!(render_origin(url).is_none());
        }
    }
    struct Mock {
        pr: std::sync::Mutex<Value>,
        checks: std::sync::Mutex<Value>,
        issue: std::sync::Mutex<Value>,
        comments: std::sync::Mutex<Vec<Value>>,
        writes: std::sync::Mutex<Vec<(String, Value)>>,
    }
    async fn github_mock(
        State(mock): State<Arc<Mock>>,
        request: axum::extract::Request,
    ) -> Json<Value> {
        assert_eq!(
            request.headers()[header::AUTHORIZATION],
            format!("Bearer {TOKEN}")
        );
        let method = request.method().clone();
        let path = request.uri().path().to_string();
        let bytes = to_bytes(request.into_body(), 16384).await.unwrap();
        let input: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        let prefix = format!("/repos/{REPOSITORY}");
        let route = path.strip_prefix(&prefix).unwrap();
        let result = match (method.as_str(), route) {
            ("GET", "") => json!({"full_name":REPOSITORY,"permissions":{"push":true}}),
            ("GET", "/issues") => json!([mock.issue.lock().unwrap().clone()]),
            ("GET", "/pulls") => json!([mock.pr.lock().unwrap().clone()]),
            ("GET", "/pulls/42") => mock.pr.lock().unwrap().clone(),
            ("GET", "/pulls/42/reviews") => json!([]),
            ("GET", "/issues/12") => mock.issue.lock().unwrap().clone(),
            ("GET", "/labels/drawing-board-change") => json!({"name":LABEL}),
            ("GET", "/deployments") => {
                json!([{"id":7,"sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"feature - drawing-board PR #42"}])
            }
            ("GET", "/deployments/7/statuses") => {
                json!([{"state":"success","environment_url":"https://drawing-board-pr-42.onrender.com"}])
            }
            ("POST", "/issues") => {
                mock.writes
                    .lock()
                    .unwrap()
                    .push((route.into(), input.clone()));
                let issue = json!({"number":13,"title":input["title"],"body":input["body"],"labels":[{"name":LABEL}],"state":"open"});
                *mock.issue.lock().unwrap() = issue.clone();
                issue
            }
            ("GET", "/issues/12/comments") => json!(mock.comments.lock().unwrap().clone()),
            ("POST", "/issues/12/comments") => {
                mock.writes
                    .lock()
                    .unwrap()
                    .push((route.into(), input.clone()));
                let mut comments = mock.comments.lock().unwrap();
                let comment = json!({"id":comments.len()+1,"body":input["body"]});
                comments.push(comment.clone());
                mock.issue.lock().unwrap()["comments"] = json!(comments.len());
                comment
            }
            ("PUT", "/pulls/42/merge") => {
                mock.writes.lock().unwrap().push((route.into(), input));
                let mut pr = mock.pr.lock().unwrap();
                pr["state"] = json!("closed");
                pr["merged"] = json!(true);
                pr["merge_commit_sha"] = json!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
                json!({"merged":true,"sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"})
            }
            ("GET", route) if route.ends_with("/check-runs") => mock.checks.lock().unwrap().clone(),
            ("GET", route) if route.ends_with("/status") => {
                json!({"total_count":0,"state":"pending"})
            }
            _ => panic!("Unexpected GitHub fixture request: {method} {route}"),
        };
        Json(result)
    }
    async fn fixture() -> (
        App,
        String,
        Arc<Config>,
        Arc<Mock>,
        tokio::task::JoinHandle<()>,
    ) {
        let app = crate::tests::app(false);
        let invite = invites::bootstrap(&app).unwrap();
        let token = invite["url"].as_str().unwrap().rsplit('/').next().unwrap();
        let (status, headers, _) = crate::tests::call(
            &app,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":"Queue owner","invite_token":token}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let cookie = headers[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();
        let mock = Arc::new(Mock {
            pr: std::sync::Mutex::new(ready_pr()),
            checks: std::sync::Mutex::new(ready_checks()),
            issue: std::sync::Mutex::new(
                json!({"number":12,"title":"Improve cards","body":"Keep effects readable.","labels":[{"name":LABEL}],"state":"open"}),
            ),
            comments: std::sync::Mutex::new(vec![]),
            writes: std::sync::Mutex::new(vec![]),
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let router = Router::new()
            .fallback(any(github_mock))
            .with_state(mock.clone());
        let task = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let mut config = Config::new(false);
        config.base = format!("http://{address}");
        (app, cookie, Arc::new(config), mock, task)
    }
    async fn call_queue(
        app: &App,
        config: Arc<Config>,
        method: &str,
        path: &str,
        cookie: &str,
        body: Value,
    ) -> (StatusCode, Value) {
        let router = routes(config)
            .layer(middleware::from_fn_with_state(app.clone(), protect))
            .with_state(app.clone());
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header("content-type", "application/json")
            .header("x-drawing-board", "1")
            .header(header::COOKIE, cookie)
            .body(Body::from(body.to_string()))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let body = serde_json::from_slice(
            &to_bytes(response.into_body(), 2 * 1024 * 1024)
                .await
                .unwrap(),
        )
        .unwrap();
        (status, body)
    }
    async fn connect_fixture(app: &App, config: Arc<Config>, cookie: &str) {
        let (status, body) = call_queue(
            app,
            config,
            "POST",
            "/api/admin/change-queue/connect",
            cookie,
            json!({"token":TOKEN}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(!body.to_string().contains(TOKEN));
    }
    #[tokio::test]
    async fn access_connections_and_queue_writes_are_administrator_scoped() {
        let (app, cookie, config, mock, task) = fixture().await;
        assert_eq!(
            call_queue(
                &app,
                config.clone(),
                "GET",
                "/api/admin/change-queue",
                "",
                json!({})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        let (_, _, invite) = crate::tests::call(
            &app,
            "POST",
            "/api/admin/invites",
            &cookie,
            json!({"label":"Member","days":1,"max_uses":1}),
        )
        .await;
        let invite_token = invite["url"].as_str().unwrap().rsplit('/').next().unwrap();
        let (s, h, _) = crate::tests::call(
            &app,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":"Member","invite_token":invite_token}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        let member = h[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap();
        assert_eq!(
            call_queue(
                &app,
                config.clone(),
                "POST",
                "/api/admin/change-queue/connect",
                member,
                json!({"token":TOKEN})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        connect_fixture(&app, config.clone(), &cookie).await;
        let (_, queue) = call_queue(
            &app,
            config.clone(),
            "GET",
            "/api/admin/change-queue",
            &cookie,
            json!({}),
        )
        .await;
        assert_eq!(queue["connected"], true);
        assert_eq!(queue["requests"][0]["number"], 12);
        assert!(!queue.to_string().contains(TOKEN));
        let (s, _) = call_queue(
            &app,
            config.clone(),
            "POST",
            "/api/admin/change-queue/issues/12",
            &cookie,
            json!({"revision":"stale","pull_requests":[42]}),
        )
        .await;
        assert_eq!(s, StatusCode::CONFLICT);
        assert!(mock.writes.lock().unwrap().is_empty());
        let revision = queue["requests"][0]["revision"].clone();
        let (s, linked) = call_queue(
            &app,
            config.clone(),
            "POST",
            "/api/admin/change-queue/issues/12",
            &cookie,
            json!({"revision":revision,"pull_requests":[42,42]}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(linked["description"], "Keep effects readable.");
        assert_eq!(linked["pull_requests"], json!([42]));
        assert_eq!(mock.issue.lock().unwrap()["body"], "Keep effects readable.");
        let refreshed = call_queue(
            &app,
            config.clone(),
            "GET",
            "/api/admin/change-queue",
            &cookie,
            json!({}),
        )
        .await
        .1;
        assert_eq!(refreshed["requests"][0]["pull_requests"], json!([42]));
        let (s, created) = call_queue(
            &app,
            config.clone(),
            "POST",
            "/api/admin/change-queue",
            &cookie,
            json!({"title":"New request","description":"Add a clearer map key."}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(created["description"], "Add a clearer map key.");
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, cookie.parse().unwrap());
        let owner = user(&app, &headers).unwrap().id;
        assert!(config.github("another-admin").await.is_err());
        config
            .connections
            .write()
            .await
            .get_mut(&owner)
            .unwrap()
            .expires = std::time::Instant::now() - std::time::Duration::from_secs(1);
        assert_eq!(
            call_queue(
                &app,
                config.clone(),
                "GET",
                "/api/admin/change-queue",
                &cookie,
                json!({})
            )
            .await
            .1["connected"],
            false
        );
        assert!(config.connections.read().await.is_empty());
        connect_fixture(&app, config.clone(), &cookie).await;
        assert_eq!(
            call_queue(
                &app,
                config.clone(),
                "POST",
                "/api/admin/change-queue/disconnect",
                &cookie,
                json!({})
            )
            .await
            .0,
            StatusCode::OK
        );
        assert!(config.connections.read().await.is_empty());
        let mut preview = Config::new(true);
        preview.base = config.base.clone();
        assert_eq!(
            call_queue(
                &app,
                Arc::new(preview),
                "POST",
                "/api/admin/change-queue/connect",
                &cookie,
                json!({"token":TOKEN})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        task.abort();
    }
    #[tokio::test]
    async fn merge_rechecks_head_checks_and_reset_before_the_only_repository_write() {
        let (app, cookie, config, mock, task) = fixture().await;
        connect_fixture(&app, config.clone(), &cookie).await;
        let endpoint = "/api/admin/change-queue/pulls/42/merge";
        let approval =
            json!({"expected_head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","confirm":true});
        let mut moved = approval.clone();
        moved["expected_head"] = json!("cccccccccccccccccccccccccccccccccccccccc");
        assert_eq!(
            call_queue(&app, config.clone(), "POST", endpoint, &cookie, moved)
                .await
                .0,
            StatusCode::CONFLICT
        );
        let mut unconfirmed = approval.clone();
        unconfirmed["confirm"] = json!(false);
        assert_eq!(
            call_queue(&app, config.clone(), "POST", endpoint, &cookie, unconfirmed)
                .await
                .0,
            StatusCode::BAD_REQUEST
        );
        mock.checks.lock().unwrap()["check_runs"][0]["conclusion"] = json!("failure");
        assert_eq!(
            call_queue(
                &app,
                config.clone(),
                "POST",
                endpoint,
                &cookie,
                approval.clone()
            )
            .await
            .0,
            StatusCode::CONFLICT
        );
        *mock.checks.lock().unwrap() = ready_checks();
        mock.pr.lock().unwrap()["labels"] = json!([{"name":"playtest-breaking"}]);
        assert_eq!(
            call_queue(
                &app,
                config.clone(),
                "POST",
                endpoint,
                &cookie,
                approval.clone()
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        assert!(mock.writes.lock().unwrap().is_empty());
        let mut confirmed = approval;
        confirmed["acknowledge_reset"] = json!(true);
        let (status, result) =
            call_queue(&app, config.clone(), "POST", endpoint, &cookie, confirmed).await;
        assert_eq!(status, StatusCode::OK, "{result}");
        assert_eq!(result["merged"], true);
        let writes = mock.writes.lock().unwrap().clone();
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].0, "/pulls/42/merge");
        assert_eq!(
            writes[0].1["sha"],
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );
        assert_eq!(writes[0].1["merge_method"], "merge");
        assert!(writes[0].1.get("bypass_rules").is_none());
        let (status, pr) = call_queue(
            &app,
            config,
            "GET",
            "/api/admin/change-queue/pulls/42",
            &cookie,
            json!({}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(pr["merged"], true);
        assert_eq!(pr["live"]["state"], "pending");
        assert!(pr["live"].get("origin").is_none());
        task.abort();
    }
}
