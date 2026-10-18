import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("gpu_h3_promote_cu130.py")
SPEC = importlib.util.spec_from_file_location("gpu_h3_promote_cu130", MODULE_PATH)
module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(module)


class PromoteCu130Test(unittest.TestCase):
    def test_override_replaces_exec_start_and_preserves_production_arguments(self):
        content = module.render_override(Path("/candidate/python"))
        self.assertIn("ExecStart=\n", content)
        self.assertIn("ExecStart=/candidate/python /home/neo/ComfyUI/main.py", content)
        self.assertIn("--port 8188", content)
        self.assertIn("--cuda-device 0", content)
        self.assertIn("--cpu-vae", content)
        self.assertIn("--disable-async-offload", content)
        self.assertIn("--reserve-vram 4", content)

    def test_required_nodes_cover_reference_and_audio_workflow(self):
        for node in (
            "MiniMaxH3ImageToVideo", "MiniMaxH3ReferenceToVideo",
            "VAEDecodeAudio", "SaveVideo",
        ):
            self.assertIn(node, module.REQUIRED_NODES)


if __name__ == "__main__":
    unittest.main()
