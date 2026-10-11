use sha2::{Digest, Sha256};
use std::net::SocketAddr;

pub struct Config {
    pub bind: SocketAddr,
    pub origin: String,
    pub dev_auth: bool,
    pub preview_code_hash: Option<[u8; 32]>,
}
impl Config {
    pub fn from_env(get: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let bind = get("BIND_ADDR")
            .unwrap_or_else(|| match get("PORT") {
                Some(port) => format!("0.0.0.0:{port}"),
                None => "127.0.0.1:3000".into(),
            })
            .parse::<SocketAddr>()
            .map_err(|_| "BIND_ADDR/PORT must specify a valid listen address.".to_string())?;
        let on_render = get("RENDER").as_deref() == Some("true");
        let preview = on_render && get("IS_PULL_REQUEST").as_deref() == Some("true");
        // PRs must use their own URL, even if production has a custom APP_ORIGIN.
        let origin = if preview {
            get("RENDER_EXTERNAL_URL")
        } else {
            get("APP_ORIGIN").or_else(|| {
                if on_render {
                    get("RENDER_EXTERNAL_URL")
                } else {
                    None
                }
            })
        }
        .unwrap_or_else(|| format!("http://{bind}"));
        let parsed = url::Url::parse(&origin)
            .map_err(|_| "APP_ORIGIN must be an absolute HTTP(S) origin.".to_string())?;
        if !["http", "https"].contains(&parsed.scheme())
            || parsed.origin().ascii_serialization() != origin
            || parsed.host_str().is_none()
        {
            return Err("APP_ORIGIN must be an exact HTTP(S) origin without a path, credentials, query, or trailing slash.".into());
        }
        let dev_auth = get("DEV_AUTH").as_deref() == Some("1");
        if dev_auth && (!bind.ip().is_loopback() || on_render) {
            return Err(
                "DEV_AUTH is restricted to local loopback development, never Render.".into(),
            );
        }
        let preview_code_hash = if preview && get("PREVIEW_AUTH").as_deref() == Some("1") {
            if parsed.scheme() != "https" {
                return Err("PR preview authentication requires HTTPS.".into());
            }
            let code = get("PREVIEW_ACCESS_CODE")
                .ok_or("PREVIEW_ACCESS_CODE is required for PR previews.")?;
            if code.len() < 24 {
                return Err("PREVIEW_ACCESS_CODE must have at least 24 characters.".into());
            }
            Some(Sha256::digest(code.as_bytes()).into())
        } else {
            None
        };
        Ok(Self {
            bind,
            origin,
            dev_auth,
            preview_code_hash,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config(env: &[(&str, &str)]) -> Result<Config, String> {
        Config::from_env(|key| {
            env.iter()
                .find(|(k, _)| *k == key)
                .map(|(_, v)| v.to_string())
        })
    }
    #[test]
    fn local_auth_stays_local() {
        assert!(config(&[("DEV_AUTH", "1")]).unwrap().dev_auth);
        assert!(config(&[("DEV_AUTH", "1"), ("PORT", "3000")]).is_err());
        assert!(config(&[("DEV_AUTH", "1"), ("RENDER", "true")]).is_err());
    }
    #[test]
    fn production_never_enables_preview_login() {
        let c = config(&[
            ("RENDER", "true"),
            ("PREVIEW_AUTH", "1"),
            ("PREVIEW_ACCESS_CODE", "long-enough-test-code-only"),
            ("APP_ORIGIN", "https://games.example"),
        ])
        .unwrap();
        assert!(c.preview_code_hash.is_none());
        assert_eq!(c.origin, "https://games.example");
    }
    #[test]
    fn preview_binds_its_own_origin_and_requires_code() {
        let mut vars = vec![
            ("RENDER", "true"),
            ("IS_PULL_REQUEST", "true"),
            ("PREVIEW_AUTH", "1"),
            ("PORT", "10000"),
            ("APP_ORIGIN", "https://production.example"),
            ("RENDER_EXTERNAL_URL", "https://pr-7.onrender.com"),
        ];
        assert!(config(&vars).is_err());
        vars.push(("PREVIEW_ACCESS_CODE", "long-enough-test-code-only"));
        let c = config(&vars).unwrap();
        assert!(c.preview_code_hash.is_some());
        assert_eq!(c.origin, "https://pr-7.onrender.com");
        assert_eq!(c.bind.to_string(), "0.0.0.0:10000");
    }
    #[test]
    fn rejects_insecure_preview_and_invalid_origin() {
        assert!(config(&[("APP_ORIGIN", "https://games.example/path")]).is_err());
        assert!(config(&[("APP_ORIGIN", "https://games.example/")]).is_err());
        assert!(
            config(&[
                ("RENDER", "true"),
                ("IS_PULL_REQUEST", "true"),
                ("PREVIEW_AUTH", "1"),
                ("RENDER_EXTERNAL_URL", "http://pr.onrender.com"),
                ("PREVIEW_ACCESS_CODE", "long-enough-test-code-only")
            ])
            .is_err()
        );
    }
}
