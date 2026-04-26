# Security policy

YuhoLens-Pipeline is a research artefact released under MIT (wrapper
code) and the Tongyi Qianwen license (model weights). It is not
operationally hardened software, and the responsible-use considerations
below are at least as important as the cryptographic-vulnerability
considerations.

## Supported versions

Only `main` is supported. There are no pinned releases yet. Once the
project tags a `v0.1.0` release the table below will be filled in.

| Version | Status            |
| ------- | ----------------- |
| `main`  | Active            |
| < main  | Not supported     |

## Reporting a vulnerability

Please report security-relevant issues by email to
**javier.dejesusj9@gmail.com** with the subject prefix
`[security]`. Do not open a public GitHub issue for an unpatched
vulnerability.

You can expect:

- An acknowledgement within 5 business days.
- A status update within 14 business days.
- A coordinated disclosure window before any fix is publicised.

## What counts as a security issue here

The most likely real risks for this project are:

- **Prompt-injection through Yuho input** that causes the Citation
  Grounder to be bypassed (memo claims emitted without a Japanese-span
  backing). The grounder is the load-bearing safety check; bypasses
  qualify as security issues.
- **Path-traversal or arbitrary-file-read** through CLI arguments
  (`--yuho-row`, `--out`, `--model-path`).
- **Server-side issues** in `scripts/serve_local.py` if you run it on
  an externally reachable host (the script is intended for
  loopback-only demos and ships without auth).
- **Credential leakage.** The OpenAI key is read from the environment;
  if a code path logs or persists it, that's a bug worth reporting.

## What does not count as a security issue

- The model produces a factually wrong memo. The README and model card
  state explicitly that outputs may contain factual errors and must be
  verified against the underlying Yuho before any decision. This is a
  research artefact, not a financial-advice product.
- The model refuses to make a claim because the supporting Japanese
  span could not be grounded. That's the abstention-as-feature design,
  not a bug.
- The model card or README contains an unrealistic throughput or cost
  number. That's a documentation issue; please open a regular GitHub
  issue.

## Responsible use

- Do not use this model to generate filings, summaries, or research
  notes that will be presented as human-authored work without
  disclosure.
- Do not use this model as the sole basis for a financial decision.
  Verify every material claim against the underlying Yuho or the
  primary EDINET filing.
- Comply with the Tongyi Qianwen licence terms when redistributing
  weights, including any downstream-use notification requirements
  inherited from `Qwen/Qwen-14B` via `rinna/nekomata-14b` and
  `pfnet/nekomata-14b-pfn-qfin`.
