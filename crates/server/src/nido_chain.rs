//! Read-only Stellar RPC authentication. Pins match Nido's 2026-10-09 Perch
//! deployment; an unknown account implementation fails closed. No transaction
//! is signed or submitted. Only a policy-free, single-passkey self-admin rule
//! can authenticate with Nido's single-assertion message protocol.
use crate::*;
use stellar_xdr::*;

pub const NETWORK: &str = "Test SDF Network ; September 2015";
const ACCOUNT_WASM: &str = "bbb30174bbd85a2956a2f6146a156769621254011a6bdcac707cf787ce7bcd52";
const VERIFIER: &str = "CBCCINHRMS3COAV5RHTCUASZLOEC52FCOBR3HMU4FKWJTAHWZTVFTHHY";
const MAX_RESPONSE: usize = 512 * 1024;

pub struct Config {
    pub enabled: bool,
    rpc: String,
    client: reqwest::Client,
    slots: tokio::sync::Semaphore,
}
impl Config {
    pub fn new(enabled: bool, rpc: String) -> Result<Self, Box<dyn std::error::Error>> {
        let url = url::Url::parse(&rpc)?;
        if url.scheme() != "https" && !(cfg!(test) && url.host_str() == Some("127.0.0.1")) {
            return Err("NIDO_RPC_URL must use HTTPS".into());
        }
        Ok(Self {
            enabled,
            rpc,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(8))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            slots: tokio::sync::Semaphore::new(8),
        })
    }
    pub async fn keys(&self, account: &str) -> ApiResult<Vec<String>> {
        if !self.enabled {
            return Err(unsupported());
        }
        let _slot = self.slots.try_acquire().map_err(|_| unavailable())?;
        tokio::time::timeout(std::time::Duration::from_secs(15), self.read_keys(account))
            .await
            .map_err(|_| unavailable())?
    }
    async fn rpc(&self, method: &str, params: serde_json::Value) -> ApiResult<serde_json::Value> {
        let mut response = self
            .client
            .post(&self.rpc)
            .json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))
            .send()
            .await
            .map_err(|_| unavailable())?
            .error_for_status()
            .map_err(|_| unavailable())?;
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| unavailable())? {
            if body.len() + chunk.len() > MAX_RESPONSE {
                return Err(unavailable());
            }
            body.extend_from_slice(&chunk);
        }
        let response: serde_json::Value =
            serde_json::from_slice(&body).map_err(|_| unavailable())?;
        response
            .get("result")
            .filter(|_| response.get("error").is_none())
            .cloned()
            .ok_or_else(unavailable)
    }
    async fn instance(&self, account: &str) -> ApiResult<u64> {
        let address = address(account)?;
        let key = LedgerKey::ContractData(LedgerKeyContractData {
            contract: address.clone(),
            key: ScVal::LedgerKeyContractInstance,
            durability: ContractDataDurability::Persistent,
        });
        let result = self
            .rpc(
                "getLedgerEntries",
                json!({"keys":[key.to_xdr_base64(limits()).map_err(|_| unsupported())?]}),
            )
            .await?;
        let entries = result["entries"].as_array().ok_or_else(unsupported)?;
        if entries.len() != 1 {
            return Err(unsupported());
        }
        let entry = LedgerEntryData::from_xdr_base64(
            entries[0]["xdr"].as_str().ok_or_else(unsupported)?,
            limits(),
        )
        .map_err(|_| unsupported())?;
        match entry {
            LedgerEntryData::ContractData(data)
                if data.contract == address && data.key == ScVal::LedgerKeyContractInstance =>
            {
                match data.val {
                    ScVal::ContractInstance(instance)
                        if instance.executable
                            == ContractExecutable::Wasm(Hash(
                                hex::decode(ACCOUNT_WASM).unwrap().try_into().unwrap(),
                            )) => {}
                    _ => return Err(unsupported()),
                }
            }
            _ => return Err(unsupported()),
        }
        ledger(&result)
    }
    async fn read_keys(&self, account: &str) -> ApiResult<Vec<String>> {
        let network = self.rpc("getNetwork", json!({})).await?;
        if network["passphrase"].as_str() != Some(NETWORK) {
            return Err(unavailable());
        }
        let before = self.instance(account).await?;
        let transaction = view_transaction(account)?;
        let result = self
            .rpc("simulateTransaction", json!({"transaction":transaction}))
            .await?;
        if result.get("error").is_some() || result.get("restorePreamble").is_some() {
            return Err(unsupported());
        }
        let at = ledger(&result)?;
        if at < before {
            return Err(unavailable());
        }
        let config = ScVal::from_xdr_base64(
            result["results"][0]["xdr"]
                .as_str()
                .ok_or_else(unsupported)?,
            limits(),
        )
        .map_err(|_| unsupported())?;
        let keys = admin_keys(account, &config, at)?;
        // Check the deployed code on both sides of the configuration read.
        if self.instance(account).await? < at {
            return Err(unavailable());
        }
        Ok(keys)
    }
}
pub fn unavailable() -> ApiError {
    ApiError(
        StatusCode::SERVICE_UNAVAILABLE,
        "Nido’s network could not be checked. Try signing in again shortly.".into(),
    )
}
fn unsupported() -> ApiError {
    ApiError(StatusCode::FORBIDDEN, "This wallet needs a current Nido testnet account with one passkey on a policy-free admin rule. Multisig, frozen, and older accounts cannot sign in here yet.".into())
}
fn limits() -> Limits {
    Limits {
        depth: 64,
        len: MAX_RESPONSE,
    }
}
fn ledger(value: &serde_json::Value) -> ApiResult<u64> {
    value["latestLedger"]
        .as_u64()
        .filter(|x| *x > 0)
        .ok_or_else(unavailable)
}
fn address(value: &str) -> ApiResult<ScAddress> {
    let key = stellar_strkey::Contract::from_string(value).map_err(|_| unsupported())?;
    Ok(ScAddress::Contract(ContractId(Hash(key.0))))
}
fn view_transaction(account: &str) -> ApiResult<String> {
    let op = Operation {
        source_account: None,
        body: OperationBody::InvokeHostFunction(InvokeHostFunctionOp {
            host_function: HostFunction::InvokeContract(InvokeContractArgs {
                contract_address: address(account)?,
                function_name: ScSymbol("configuration".try_into().unwrap()),
                args: Default::default(),
            }),
            auth: Default::default(),
        }),
    };
    TransactionEnvelope::Tx(TransactionV1Envelope {
        tx: Transaction {
            source_account: MuxedAccount::Ed25519(Uint256([0; 32])),
            fee: 100,
            seq_num: SequenceNumber(1),
            cond: Preconditions::None,
            memo: Memo::None,
            operations: vec![op].try_into().unwrap(),
            ext: TransactionExt::V0,
        },
        signatures: Default::default(),
    })
    .to_xdr_base64(limits())
    .map_err(|_| unsupported())
}
fn field<'a>(value: &'a ScVal, name: &str) -> ApiResult<&'a ScVal> {
    let ScVal::Map(Some(map)) = value else {
        return Err(unsupported());
    };
    map.iter()
        .find(|e| matches!(&e.key, ScVal::Symbol(s) if s.0.as_slice() == name.as_bytes()))
        .map(|e| &e.val)
        .ok_or_else(unsupported)
}
fn vector(value: &ScVal) -> ApiResult<&[ScVal]> {
    match value {
        ScVal::Vec(Some(v)) => Ok(v.as_slice()),
        _ => Err(unsupported()),
    }
}
fn tag(value: &ScVal, expected: &str) -> bool {
    matches!(value, ScVal::Symbol(s) if s.0.as_slice() == expected.as_bytes())
}
fn admin_keys(account: &str, config: &ScVal, ledger: u64) -> ApiResult<Vec<String>> {
    let gate = vector(field(config, "gate")?)?;
    if !gate.is_empty() {
        if gate.len() != 1 {
            return Err(unsupported());
        }
        match field(&gate[0], "until")? {
            ScVal::U32(until) if ledger >= u64::from(*until) => (),
            _ => return Err(unsupported()),
        }
    }
    let account = address(account)?;
    let verifier = address(VERIFIER)?;
    let mut keys = Vec::new();
    for rule in vector(field(config, "rules")?)? {
        if field(rule, "recovery")? != &ScVal::Bool(false) {
            continue;
        }
        let scope = vector(field(rule, "context_type")?)?;
        if scope.len() != 2
            || !tag(&scope[0], "CallContract")
            || scope[1] != ScVal::Address(account.clone())
        {
            continue;
        }
        // Reject expiring admin rules too: a cached session must not outlive one.
        if field(rule, "valid_until")? != &ScVal::Void
            || !vector(field(rule, "policies")?)?.is_empty()
        {
            continue;
        }
        let signers = vector(field(rule, "signers")?)?;
        if signers.len() != 1 {
            continue;
        }
        let signer = vector(&signers[0])?;
        if signer.len() != 3
            || !tag(&signer[0], "External")
            || signer[1] != ScVal::Address(verifier.clone())
        {
            continue;
        }
        if let ScVal::Bytes(key) = &signer[2]
            && key.len() >= 65
            && key[0] == 4
            && p256::ecdsa::VerifyingKey::from_sec1_bytes(&key.as_slice()[..65]).is_ok()
        {
            // Perch canonicalizes the first 65 bytes; a credential ID may follow.
            keys.push(hex::encode(&key.as_slice()[..65]));
        }
    }
    if keys.is_empty() {
        return Err(unsupported());
    }
    Ok(keys)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::sync::Mutex;
    pub fn account() -> String {
        stellar_strkey::Contract([1; 32]).to_string()
    }
    pub fn public_key() -> String {
        let key = p256::ecdsa::SigningKey::from_bytes((&[7u8; 32]).into()).unwrap();
        hex::encode(key.verifying_key().to_encoded_point(false).as_bytes())
    }
    fn vec(values: Vec<ScVal>) -> ScVal {
        ScVal::Vec(Some(ScVec(values.try_into().unwrap())))
    }
    fn symbol(value: &str) -> ScVal {
        ScVal::Symbol(ScSymbol(value.try_into().unwrap()))
    }
    fn map(values: Vec<(&str, ScVal)>) -> ScVal {
        let mut entries: Vec<_> = values
            .into_iter()
            .map(|(k, val)| ScMapEntry {
                key: symbol(k),
                val,
            })
            .collect();
        entries.sort_by(|a, b| a.key.cmp(&b.key));
        ScVal::Map(Some(ScMap(entries.try_into().unwrap())))
    }
    fn set(value: &mut ScVal, name: &str, replacement: ScVal) {
        let ScVal::Map(Some(m)) = value else { panic!() };
        let mut entries = m.to_vec();
        entries
            .iter_mut()
            .find(|e| e.key == symbol(name))
            .unwrap()
            .val = replacement;
        *m = ScMap(entries.try_into().unwrap());
    }
    fn rule() -> ScVal {
        map(vec![
            ("recovery", ScVal::Bool(false)),
            (
                "context_type",
                vec(vec![
                    symbol("CallContract"),
                    ScVal::Address(address(&account()).unwrap()),
                ]),
            ),
            ("valid_until", ScVal::Void),
            ("policies", vec(vec![])),
            (
                "signers",
                vec(vec![vec(vec![
                    symbol("External"),
                    ScVal::Address(address(VERIFIER).unwrap()),
                    ScVal::Bytes(
                        hex::decode(public_key() + &"ab".repeat(32))
                            .unwrap()
                            .try_into()
                            .unwrap(),
                    ),
                ])]),
            ),
        ])
    }
    fn config(rule: ScVal) -> ScVal {
        map(vec![("gate", vec(vec![])), ("rules", vec(vec![rule]))])
    }
    fn result(config: ScVal) -> serde_json::Value {
        json!({"latestLedger":100,"results":[{"xdr":config.to_xdr_base64(limits()).unwrap()}]})
    }
    fn instance_result(hash: &str) -> serde_json::Value {
        let entry = LedgerEntryData::ContractData(ContractDataEntry {
            ext: ExtensionPoint::V0,
            contract: address(&account()).unwrap(),
            key: ScVal::LedgerKeyContractInstance,
            durability: ContractDataDurability::Persistent,
            val: ScVal::ContractInstance(ScContractInstance {
                executable: ContractExecutable::Wasm(Hash(
                    hex::decode(hash).unwrap().try_into().unwrap(),
                )),
                storage: None,
            }),
        });
        json!({"latestLedger":100,"entries":[{"xdr":entry.to_xdr_base64(limits()).unwrap()}]})
    }
    pub struct Mock {
        pub network: serde_json::Value,
        pub instance: serde_json::Value,
        pub configuration: serde_json::Value,
        pub calls: usize,
        pub offline: bool,
    }
    pub async fn mock() -> (Config, Arc<Mutex<Mock>>, tokio::task::JoinHandle<()>) {
        let state = Arc::new(Mutex::new(Mock {
            network: json!({"passphrase":NETWORK}),
            instance: instance_result(ACCOUNT_WASM),
            configuration: result(config(rule())),
            calls: 0,
            offline: false,
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let router = Router::new()
            .route(
                "/",
                post(
                    |State(state): State<Arc<Mutex<Mock>>>,
                     Json(request): Json<serde_json::Value>| async move {
                        let mut state = state.lock().unwrap();
                        state.calls += 1;
                        if state.offline {
                            return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({})));
                        }
                        let result = match request["method"].as_str().unwrap() {
                            "getNetwork" => state.network.clone(),
                            "getLedgerEntries" => state.instance.clone(),
                            "simulateTransaction" => {
                                let tx = TransactionEnvelope::from_xdr_base64(
                                    request["params"]["transaction"].as_str().unwrap(),
                                    limits(),
                                )
                                .unwrap();
                                let TransactionEnvelope::Tx(tx) = tx else {
                                    panic!()
                                };
                                assert!(tx.signatures.is_empty());
                                let OperationBody::InvokeHostFunction(op) =
                                    &tx.tx.operations[0].body
                                else {
                                    panic!()
                                };
                                assert!(op.auth.is_empty());
                                let HostFunction::InvokeContract(call) = &op.host_function else {
                                    panic!()
                                };
                                assert_eq!(call.function_name.0.as_slice(), b"configuration");
                                state.configuration.clone()
                            }
                            _ => panic!("Only read-only RPC methods are allowed"),
                        };
                        (
                            StatusCode::OK,
                            Json(json!({"jsonrpc":"2.0","id":1,"result":result})),
                        )
                    },
                ),
            )
            .with_state(state.clone());
        let task = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        (Config::new(true, url).unwrap(), state, task)
    }
    #[test]
    fn accepts_only_independent_admin_passkeys() {
        assert_eq!(
            admin_keys(&account(), &config(rule()), 100).ok().unwrap(),
            vec![public_key()]
        );
        for (name, value) in [
            ("recovery", ScVal::Bool(true)),
            ("valid_until", ScVal::U32(150)),
            ("policies", vec(vec![ScVal::Void])),
            (
                "context_type",
                vec(vec![
                    symbol("CallContract"),
                    ScVal::Address(address(VERIFIER).unwrap()),
                ]),
            ),
            ("signers", vec(vec![])),
            (
                "signers",
                vec(vec![
                    vector(field(&rule(), "signers").unwrap()).unwrap()[0]
                        .clone();
                    2
                ]),
            ),
            (
                "signers",
                vec(vec![vec(vec![
                    symbol("Delegated"),
                    ScVal::Address(address(VERIFIER).unwrap()),
                ])]),
            ),
            (
                "signers",
                vec(vec![vec(vec![
                    symbol("External"),
                    ScVal::Address(address(&account()).unwrap()),
                    ScVal::Bytes(
                        hex::decode(public_key() + &"ab".repeat(32))
                            .unwrap()
                            .try_into()
                            .unwrap(),
                    ),
                ])]),
            ),
        ] {
            let mut r = rule();
            set(&mut r, name, value);
            assert!(admin_keys(&account(), &config(r), 100).is_err(), "{name}");
        }
        let mut frozen = config(rule());
        set(
            &mut frozen,
            "gate",
            vec(vec![map(vec![("until", ScVal::U32(101))])]),
        );
        assert!(admin_keys(&account(), &frozen, 100).is_err());
        assert!(admin_keys(&account(), &frozen, 101).is_ok());
    }
    #[tokio::test]
    async fn rpc_checks_network_code_and_monotonic_ledger() {
        let (config, state, task) = mock().await;
        assert_eq!(
            config.keys(&account()).await.ok().unwrap(),
            vec![public_key()]
        );
        state.lock().unwrap().network =
            json!({"passphrase":"Public Global Stellar Network ; September 2015"});
        assert!(config.keys(&account()).await.is_err());
        state.lock().unwrap().network = json!({"passphrase":NETWORK});
        state.lock().unwrap().instance = instance_result(&"00".repeat(32));
        assert!(config.keys(&account()).await.is_err());
        state.lock().unwrap().instance = instance_result(ACCOUNT_WASM);
        state.lock().unwrap().configuration["latestLedger"] = json!(99);
        assert!(config.keys(&account()).await.is_err());
        state.lock().unwrap().configuration["latestLedger"] = json!(100);
        state.lock().unwrap().configuration["restorePreamble"] = json!({});
        assert!(config.keys(&account()).await.is_err());
        state.lock().unwrap().offline = true;
        assert!(matches!(
            config.keys(&account()).await,
            Err(ApiError(StatusCode::SERVICE_UNAVAILABLE, _))
        ));
        task.abort();
    }
    #[tokio::test]
    #[ignore = "explicit live read-only network smoke; no wallet approval or chain writes"]
    async fn live_account_lookup() {
        let account =
            std::env::var("NIDO_SMOKE_ACCOUNT").expect("Set a public testnet wallet address");
        let config = Config::new(true, "https://soroban-testnet.stellar.org".into()).unwrap();
        match config.keys(&account).await {
            Ok(keys) => assert!(!keys.is_empty()),
            Err(e) => panic!("Live lookup failed: {}", e.1),
        }
    }
}
