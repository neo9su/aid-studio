#!/usr/bin/env python3
"""Promote the production H3 ComfyUI service to the validated cu130 runtime."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path


UNIT = Path("/etc/systemd/system/comfyui.service")
DROPIN_DIR = Path("/etc/systemd/system/comfyui.service.d")
OVERRIDE = DROPIN_DIR / "30-h3-cu130-runtime.conf"
STATE_ROOT = Path("/home/neo/.local/state/aid-gpu-scheduler")
OLD_PYTHON = Path("/home/neo/miniconda3/envs/comfyui/bin/python")
NEW_PYTHON = Path("/home/neo/comfyui-fasth3-shadow/env-cu130/bin/python")
COMFY_MAIN = Path("/home/neo/ComfyUI/main.py")
COMFY_URL = "http://127.0.0.1:8188"
REQUIRED_NODES = {
    "UNETLoader", "MiniMaxH3SigmaShift", "CLIPLoader", "VAELoaderKJ",
    "MiniMaxH3ImageToVideo", "MiniMaxH3ReferenceToVideo", "RandomNoise",
    "KSamplerSelect", "BasicGuider",
    "BasicScheduler", "SamplerCustomAdvanced", "VAEDecodeTiled",
    "LTXVSeparateAVLatent", "CreateVideo", "SaveVideo", "VAEDecodeAudio",
}


class PromoteError(RuntimeError):
    pass


def run(command: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command, text=True, capture_output=True, check=False, timeout=timeout,
    )
    if result.returncode != 0:
        raise PromoteError((result.stderr or result.stdout or "command failed")[-4000:])
    return result


def request_json(path: str, timeout: int = 30) -> dict:
    with urllib.request.urlopen(COMFY_URL + path, timeout=timeout) as response:
        raw = response.read()
    return json.loads(raw) if raw else {}


def queue_idle() -> None:
    queue = request_json("/queue")
    running = len(queue.get("queue_running") or [])
    pending = len(queue.get("queue_pending") or [])
    if running or pending:
        raise PromoteError(f"production ComfyUI queue is busy: running={running}, pending={pending}")


def render_override(python: Path = NEW_PYTHON) -> str:
    return (
        "[Service]\n"
        "ExecStart=\n"
        f"ExecStart={python} {COMFY_MAIN} --listen 0.0.0.0 --port 8188 "
        "--cuda-device 0 --cpu-vae --disable-async-offload --reserve-vram 4\n"
    )


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, encoding="utf-8") as handle:
        handle.write(content)
        temporary = Path(handle.name)
    try:
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def python_version(python: Path) -> str:
    result = run([
        str(python), "-c",
        "import torch; print(torch.__version__ + ' / CUDA ' + str(torch.version.cuda))",
    ])
    return result.stdout.strip()


def wait_runtime(expected_python: Path, timeout_seconds: int = 420) -> dict:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            stats = request_json("/system_stats", timeout=15)
            nodes = request_json("/object_info", timeout=30)
            missing = REQUIRED_NODES - set(nodes)
            if missing:
                raise PromoteError("runtime missing nodes: " + ", ".join(sorted(missing)))
            show = run([
                "systemctl", "show", "comfyui.service", "--property=MainPID", "--value",
            ]).stdout.strip()
            if not show.isdigit() or int(show) <= 0:
                raise PromoteError("comfyui.service has no MainPID")
            cmdline = Path(f"/proc/{show}/cmdline").read_bytes().replace(b"\0", b" ").decode()
            if str(expected_python) not in cmdline:
                raise PromoteError(f"unexpected runtime command: {cmdline[:500]}")
            return {
                "mainPid": int(show),
                "command": cmdline.strip(),
                "comfyVersion": (stats.get("system") or {}).get("comfyui_version"),
            }
        except Exception as exc:  # service startup can fail in several transient ways
            last_error = exc
            time.sleep(3)
    raise PromoteError(f"runtime did not become healthy: {last_error}")


def backup_files(backup_root: Path) -> list[dict]:
    paths = [UNIT, OVERRIDE]
    if DROPIN_DIR.is_dir():
        paths.extend(path for path in sorted(DROPIN_DIR.iterdir()) if path.is_file() and path != OVERRIDE)
    records: list[dict] = []
    for path in paths:
        record = {"path": str(path), "existed": path.exists(), "backup": None}
        if path.exists():
            backup = backup_root / path.relative_to("/")
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup)
            record["backup"] = str(backup)
        records.append(record)
    return records


def restore(records: list[dict]) -> None:
    for record in records:
        target = Path(record["path"])
        if record["existed"]:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(record["backup"], target)
        else:
            target.unlink(missing_ok=True)


def restart_and_wait(expected_python: Path) -> dict:
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "restart", "comfyui.service"])
    return wait_runtime(expected_python)


def promote() -> dict:
    if os.geteuid() != 0:
        raise PromoteError("must run as root")
    for path in (UNIT, OLD_PYTHON, NEW_PYTHON, COMFY_MAIN):
        if not path.exists():
            raise PromoteError(f"required path missing: {path}")
    if run(["systemctl", "is-active", "comfyui.service"]).stdout.strip() != "active":
        raise PromoteError("comfyui.service is not active")
    queue_idle()
    versions = {"old": python_version(OLD_PYTHON), "new": python_version(NEW_PYTHON)}
    if not versions["old"].startswith("2.8.0+cu128"):
        raise PromoteError(f"unexpected old runtime: {versions['old']}")
    if not versions["new"].startswith("2.9.1+cu130"):
        raise PromoteError(f"unexpected candidate runtime: {versions['new']}")

    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    backup_root = STATE_ROOT / "backups" / f"h3-production-cu130-{stamp}"
    backup_root.mkdir(parents=True, exist_ok=False)
    records = backup_files(backup_root)
    manifest = backup_root / "manifest.json"
    manifest_payload = {
        "stage": "h3-production-cu130-runtime",
        "createdAt": time.time(),
        "files": records,
        "versions": versions,
        "status": "prepared",
    }
    manifest.write_text(json.dumps(manifest_payload, indent=2) + "\n", encoding="utf-8")

    try:
        atomic_write(OVERRIDE, render_override())
        run(["systemd-analyze", "verify", "comfyui.service"])
        health = restart_and_wait(NEW_PYTHON)
        queue_idle()
    except Exception:
        restore(records)
        restart_and_wait(OLD_PYTHON)
        manifest_payload["status"] = "rolled-back"
        manifest.write_text(json.dumps(manifest_payload, indent=2) + "\n", encoding="utf-8")
        raise

    manifest_payload["status"] = "promoted"
    manifest_payload["health"] = health
    manifest.write_text(json.dumps(manifest_payload, indent=2) + "\n", encoding="utf-8")
    return {"promoted": True, "rollbackManifest": str(manifest), "versions": versions,
            "health": health}


def rollback(manifest: Path) -> dict:
    if os.geteuid() != 0:
        raise PromoteError("must run as root")
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    if payload.get("stage") != "h3-production-cu130-runtime":
        raise PromoteError("not an H3 production runtime manifest")
    queue_idle()
    restore(payload["files"])
    health = restart_and_wait(OLD_PYTHON)
    payload["status"] = "rolled-back"
    payload["rollbackHealth"] = health
    manifest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return {"rolledBack": True, "manifest": str(manifest), "health": health}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rollback")
    parser.add_argument("--print-override", action="store_true")
    args = parser.parse_args()
    if args.print_override:
        print(render_override(), end="")
        return
    try:
        result = rollback(Path(args.rollback)) if args.rollback else promote()
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"promoted": False, "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
