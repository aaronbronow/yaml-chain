# Zero-Memory, Streaming Validation Proxy Server

A multi-document YAML stream (separated by `---`) is structurally isomorphic to a **JSON Lines (JSONL)** or NDJSON (Newline-Delimited JSON) stream. Because every document in our chain has a fixed, predictable top-level envelope (the payload document followed by `$yaml-chain-meta`), we can stream, parse, and validate it over HTTP or WebSockets with incredibly high efficiency.

This opens up a powerful backend architecture pattern: a **Zero-Memory, Streaming Validation Proxy Server**.

---

## 🏛️ The Streaming Proxy Architecture

Instead of forcing a client (or a small CI/CD runner) to download a massive 500MB `chain.yaml` history file to verify the latest state, the trusted third-party server reads the raw file as a stream and exposes line-delimited chunks or index-based ranges over HTTP.

```text
[ Git / Storage Layer ] ──(Raw File Stream)──> [ Trusted 3rd-Party Server ]
                                                      │
                                                      ├─ Splits on "---"
                                                      ├─ Exposes stream via NDJSON
                                                      ▼
                                       [ Client Pipeline / Runner ]
                                         (Validates chunks in O(1) memory)
```

By streaming the ledger this way, the proxy server can process endless history files while maintaining an absolute $O(1)$ memory ceiling.

---

## 📋 How the API Endpoints Look

Because our ledger is inherently ordered by `block_index`, a streaming server exposes range-bound endpoints that match standard transaction logging systems:

### 1. Stream the Tail (For Fast Pipeline Status Checks)
* **`GET /api/v1/chain/tail?blocks=1`**
* Returns the absolute last block in the chain as a single JSON object. A pipeline query can pull this single block, verify its self-signature, and instantly obtain the expected `meta_hash` anchor without downloading any historical data.

### 2. Stream a Specific Delta Range (For Verification Catch-Up)
* **`GET /api/v1/chain/stream?from=40&to=42`**
* The server reads the file, skips to block 40, and streams the raw multi-doc YAML blocks transformed on-the-fly into NDJSON:

```json
{"$yaml-chain-meta":{"version":"1.0.0","block_index":40,"timestamp":"2026-05-27T10:00:00.000Z","hashing_strategy":"raw","data_hash":"a1b2c3d4...","prev_meta_hash":"fa378c9a...","meta_hash":"ce87654a..."},"payload":{"schema_version":"1.0.0","event_type":"delta","git_ref":{"commit_sha":"c3b2a1f9...","branch":"refs/heads/main"},"data":{"package_delta":{"manager":"npm","added":["lodash@4.17.21"],"removed":[],"updated":[]}}}}
{"$yaml-chain-meta":{"version":"1.0.0","block_index":41,"timestamp":"2026-05-27T10:15:00.000Z","hashing_strategy":"raw","data_hash":"e5f6g7h8...","prev_meta_hash":"ce87654a...","meta_hash":"1a2b3c4d..."},"payload":{"schema_version":"1.0.0","event_type":"delta","git_ref":{"commit_sha":"e8d7c6b5...","branch":"refs/heads/main"},"data":{"package_delta":{"manager":"npm","added":[],"removed":[],"updated":["semver@7.5.2"]}}}}
{"$yaml-chain-meta":{"version":"1.0.0","block_index":42,"timestamp":"2026-05-27T10:30:00.000Z","hashing_strategy":"raw","data_hash":"b54a2b97...","prev_meta_hash":"1a2b3c4d...","meta_hash":"ab23cd45..."},"payload":{"schema_version":"1.0.0","event_type":"pointer","git_ref":{"commit_sha":"5a4f3e2d...","branch":"refs/heads/main"},"data":{"external_target":{"path":"outputs/bom.cyclonedx.json","sha256":"f67c29e61bd64de587be11cb42ab85c96752d8a41bfbe888b209e25d0c7a10ea"}}}}
```

### 3. Securely Append New Block State
* **`POST /api/v1/chain/append`**
* Standard POST request sent by a CI/CD runner to submit the latest computed block signature and detached metadata:
```bash
curl -X POST -H "Authorization: Bearer ${{ steps.oidc_auth.outputs.token }}" \
  -d @chain.sig.yaml \
  https://ledger.trusted-3rd-party.com/append
```
* **Server Logic**: Receives the block payload and detached signature, parses and validates that GPG/SSH commit signatures match authorized keys (**Aaron**, **Bob**, or **Carol**), confirms the chronological increments (`block_index` is previous + 1, and `prev_meta_hash` matches previous `meta_hash`), and appends the new block. Any signature mismatch from unauthorized actors (like **Eve**) is instantly rejected with `403 Forbidden`.

---

## ⚡ Multi-Parser Validation Advantages

Implementing an NDJSON streaming API server perfectly closes the loop on our multi-parser research:

* **The `node-parser` / `bash-parser` Win**: Our stream-based Node and Bash tools excel in this environment. Because the server outputs line-delimited or cleanly separated chunks, `node-parser` pipes the incoming HTTP response buffer directly through its hashing logic block-by-block. It completes verification of thousands of blocks while utilizing less than 30MB of RAM.
* **The `ys-parser` (Clojure) Advantage**: Clojure excels at processing lazy sequences. Our YAMLScript/Clojure parser treats the incoming server stream as a lazy sequence of maps via standard Clojure HTTP streaming libraries. It processes the blocks one at a time, keeping memory completely flat until it evaluates the full chain.

---

## 🛡️ The Security Bonus: Stream Sanitization

A trusted third-party server running this architecture also serves as a secure gateway filter. If **Eve** attempts to upload a malformed YAML file containing a Billion Laughs attack or malicious anchor references to the server, the server's streaming parser chokes or sanitizes it *before* serving it downstream to client pipelines, effectively acting as an **SBOM Security Gateway**.
