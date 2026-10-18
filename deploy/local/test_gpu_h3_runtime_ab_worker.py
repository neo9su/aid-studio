import tempfile
import unittest
import os
from unittest import mock
from pathlib import Path

import gpu_h3_runtime_ab_worker as worker


class H3RuntimeAbWorkerTest(unittest.TestCase):
    def job(self, **values):
        return {"profile": "h3-runtime-ab", "payload": {"benchmark": values}}

    def test_accepts_fixed_runtime_comparison(self):
        result = worker.validated(self.job(
            resolution="480P", duration=4, steps=20, warmRuns=1,
            targets=["torch-2.8-cu128"],
        ))
        self.assertEqual("480P", result["resolution"])
        self.assertEqual(1, result["warmRuns"])
        self.assertEqual(["torch-2.8-cu128"], result["targets"])
        self.assertEqual([], result["referenceImages"])

    def test_accepts_multi_reference_images(self):
        result = worker.validated(self.job(
            resolution="768P", duration=5, steps=20, warmRuns=2,
            referenceImages=["fs_024.png", "fs_023.png"],
        ))
        self.assertEqual(["fs_024.png", "fs_023.png"], result["referenceImages"])

    def test_rejects_unsafe_reference_image_name(self):
        with self.assertRaisesRegex(RuntimeError, "unsafe image name"):
            worker.validated(self.job(
                resolution="768P", duration=5, steps=20, warmRuns=1,
                referenceImages=["../fs_024.png", "fs_023.png"],
            ))

    def test_rejects_acceleration_step_change(self):
        with self.assertRaisesRegex(RuntimeError, "unsupported benchmark parameters"):
            worker.validated(self.job(
                resolution="480P", duration=4, steps=8, warmRuns=1,
            ))

    def test_rejects_wrong_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "job.json"
            path.write_text('{"profile":"h3-standard-quality"}', encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "profile must be h3-runtime-ab"):
                worker.load_job(path)

    def test_accepts_empty_success_response_from_comfy_free(self):
        response = mock.MagicMock()
        response.read.return_value = b""
        response.__enter__.return_value = response
        with mock.patch.object(worker.urllib.request, "urlopen", return_value=response):
            self.assertEqual({}, worker.request_json("http://127.0.0.1:8188/free", {}))

    def test_rejects_unknown_runtime_target(self):
        with self.assertRaisesRegex(RuntimeError, "runtime targets"):
            worker.validated(self.job(
                resolution="480P", duration=4, steps=20, warmRuns=1,
                targets=["aki-bundle"],
            ))

    def test_cancel_marker_stops_before_next_warm_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            cancel_file = Path(directory) / "job.cancel"
            item = worker.validated(self.job(
                resolution="768P", duration=5, steps=20, warmRuns=2,
                targets=["torch-2.8-cu128"],
            ))
            phases = []

            def run_once(runtime, url, benchmark, phase, seed, timeout_seconds):
                phases.append(phase)
                cancel_file.write_text("cancel_requested\n", encoding="utf-8")
                return {"phase": phase, "output": {"filename": "cold.mp4"}}

            with mock.patch.dict(os.environ, {"GPU_JOB_CANCEL_FILE": str(cancel_file)}), \
                    mock.patch.object(worker, "wait_runtime"), \
                    mock.patch.object(worker, "free_runtime"), \
                    mock.patch.object(worker, "run_once", side_effect=run_once):
                results, cancel_observed = worker.run_benchmark(item, 600)

            self.assertEqual(["cold"], phases)
            self.assertEqual(1, len(results))
            self.assertTrue(cancel_observed)

    def test_run_once_uses_comfy_input_root_for_reference_hashes(self):
        item = worker.validated(self.job(
            resolution="768P", duration=5, steps=20, warmRuns=1,
            targets=["torch-2.8-cu128"],
            referenceImages=["front.png", "sunlanlan_ref.png"],
        ))
        completed = mock.MagicMock(
            returncode=0, stdout='{"output":null}\n', stderr="",
        )
        with mock.patch.object(worker, "_gpu_sample", return_value=None), \
                mock.patch.object(worker.subprocess, "run", return_value=completed) as run:
            worker.run_once(
                "torch-2.8-cu128", "http://127.0.0.1:8188", item,
                "cold", 20261017, 600,
            )

        command = run.call_args.args[0]
        self.assertEqual(
            str(worker.INPUT_ROOT), command[command.index("--input-root") + 1],
        )


if __name__ == "__main__":
    unittest.main()
