"""Day-4 smoke: vLLM-ROCm inference on nekomata-14b-pfn-qfin (Qwen1).

Launches ``vllm serve`` in a subprocess, sends a single Japanese prompt to
the OpenAI-compatible completions endpoint, and shuts the server down. The
test passes if the response contains at least 32 generated characters.

Qwen1's ``model_type: "qwen"`` requires ``--trust-remote-code``.
"""

from __future__ import annotations

import subprocess
import sys
import time
from urllib import error, request

import json

MODEL_ID = "pfnet/nekomata-14b-pfn-qfin"
PORT = 8000
PROMPT = "有価証券報告書の「事業の状況」とは、"


def wait_for_server(deadline_s: float = 300.0) -> bool:
    """Poll the health endpoint until it responds or the deadline passes."""
    end = time.monotonic() + deadline_s
    while time.monotonic() < end:
        try:
            with request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=2):
                return True
        except (error.URLError, TimeoutError):
            time.sleep(3)
    return False


def main() -> int:
    """Run the smoke; return 0 on pass, non-zero on fail."""
    proc = subprocess.Popen(
        [
            "vllm",
            "serve",
            MODEL_ID,
            "--trust-remote-code",
            "--dtype",
            "bfloat16",
            "--max-model-len",
            "12288",
            "--gpu-memory-utilization",
            "0.85",
            "--port",
            str(PORT),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    try:
        if not wait_for_server():
            print("vLLM failed to become ready within 300s", file=sys.stderr)
            return 1

        body = json.dumps(
            {"model": MODEL_ID, "prompt": PROMPT, "max_tokens": 128}
        ).encode()
        req = request.Request(
            f"http://127.0.0.1:{PORT}/v1/completions",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read())
        text = payload["choices"][0]["text"]
        print(f"Generated {len(text)} chars:\n{text}")
        return 0 if len(text) >= 32 else 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
