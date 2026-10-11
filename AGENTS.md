# Project instructions

## Canonical live site

- Drawing Board deployments on Render are the canonical live playtest sites for this repository.
- Never present a `chatgpt.site` deployment as the project's live game site.
- The stable Drawing Board deployment is <https://drawing-board-p0g3.onrender.com/>.
- When work is on an unmerged branch, use that branch's successful Render preview URL so the link contains the latest changes. For the current Galactic Reach branch (`codex/add-galactic-reach-prototype`, PR #3), that URL is <https://drawing-board-pr-3.onrender.com/>.
- Before giving the user a live link, verify the latest successful GitHub deployment status and use its `environment_url`; Render preview URLs can change when the PR or service changes.
- Publishing changes means pushing them to GitHub and confirming the corresponding Render deployment. Do not publish or redirect users to a ChatGPT-hosted Sites copy unless the user explicitly requests it.
