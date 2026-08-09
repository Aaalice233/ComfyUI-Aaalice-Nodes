"""Runtime contracts for UniversalVAEEncode."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import torch

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.tools import NODE_CLASSES  # noqa: E402
from nodes.tools.universal_vae_encode import (  # noqa: E402
    IMAGE_BATCH,
    INPUT_MODES,
    VIDEO_FRAMES,
    UniversalVAEEncode,
    _vae_for_input_mode,
)


class _RecordingVAE:
    def __init__(self, latent_dim: int, not_video: bool = False):
        self.latent_dim = latent_dim
        self.not_video = not_video
        self.first_stage_model = object()
        self.patcher = object()
        self.calls = []

    def encode(self, pixels):
        self.calls.append({
            "instance": self,
            "not_video": self.not_video,
            "shape": tuple(pixels.shape),
        })
        if pixels.ndim == 5:
            markers = pixels[:, :, 0, 0, 0]
            return markers.reshape(pixels.shape[0], 1, pixels.shape[1], 1, 1)

        markers = pixels[:, 0, 0, 0]
        if self.latent_dim == 3 and not self.not_video:
            return markers.reshape(1, 1, -1, 1, 1)
        if self.latent_dim == 3:
            return markers.reshape(-1, 1, 1, 1, 1)
        return markers.reshape(-1, 1, 1, 1)


def _pixels(count: int) -> torch.Tensor:
    pixels = torch.zeros((count, 8, 8, 3), dtype=torch.float32)
    if count:
        pixels[:, 0, 0, 0] = torch.arange(count, dtype=torch.float32)
    return pixels


def _batched_frames(batch: int, frames: int) -> torch.Tensor:
    pixels = torch.zeros((batch, frames, 8, 8, 3), dtype=torch.float32)
    pixels[:, :, 0, 0, 0] = torch.arange(batch * frames, dtype=torch.float32).reshape(batch, frames)
    return pixels


class UniversalVAEEncodeTests(unittest.TestCase):
    def test_node_is_registered_in_tools_domain(self):
        self.assertIn(UniversalVAEEncode, NODE_CLASSES)

    def test_schema_exposes_only_semantic_mode_not_manual_batch_size(self):
        schema = UniversalVAEEncode.define_schema()
        self.assertEqual(schema.node_id, "UniversalVAEEncode")
        self.assertEqual(schema.category, "Aaalice/tools")
        self.assertEqual([item.id for item in schema.inputs], ["pixels", "vae", "input_mode"])
        self.assertEqual(schema.inputs[2].options, list(INPUT_MODES))
        self.assertEqual(schema.inputs[2].default, IMAGE_BATCH)
        self.assertEqual([item.id for item in schema.outputs], ["latent"])

    def test_independent_images_keep_one_latent_sample_per_input(self):
        vae = _RecordingVAE(latent_dim=3, not_video=False)

        output = UniversalVAEEncode.execute(_pixels(3), vae, IMAGE_BATCH).args[0]

        self.assertEqual(tuple(output["samples"].shape), (3, 1, 1, 1, 1))
        self.assertEqual(output["samples"][:, 0, 0, 0, 0].tolist(), [0.0, 1.0, 2.0])
        self.assertEqual(len(vae.calls), 1)
        self.assertTrue(vae.calls[0]["not_video"])
        self.assertEqual(vae.calls[0]["shape"], (3, 8, 8, 3))

    def test_preprocessed_image_batch_keeps_every_frame_independent(self):
        vae = _RecordingVAE(latent_dim=3, not_video=False)

        output = UniversalVAEEncode.execute(_batched_frames(2, 3), vae, IMAGE_BATCH).args[0]

        self.assertEqual(tuple(output["samples"].shape), (6, 1, 1, 1, 1))
        self.assertEqual(output["samples"][:, 0, 0, 0, 0].tolist(), [0.0, 1.0, 2.0, 3.0, 4.0, 5.0])
        self.assertEqual(len(vae.calls), 1)
        self.assertTrue(vae.calls[0]["not_video"])
        self.assertEqual(vae.calls[0]["shape"], (6, 8, 8, 3))

    def test_video_frames_make_one_temporal_latent(self):
        vae = _RecordingVAE(latent_dim=3, not_video=True)

        output = UniversalVAEEncode.execute(_pixels(3), vae, VIDEO_FRAMES).args[0]

        self.assertEqual(tuple(output["samples"].shape), (1, 1, 3, 1, 1))
        self.assertEqual(output["samples"][0, 0, :, 0, 0].tolist(), [0.0, 1.0, 2.0])
        self.assertEqual(len(vae.calls), 1)
        self.assertFalse(vae.calls[0]["not_video"])

    def test_prebatched_video_keeps_batch_and_time_axes(self):
        vae = _RecordingVAE(latent_dim=3, not_video=True)

        output = UniversalVAEEncode.execute(_batched_frames(2, 3), vae, VIDEO_FRAMES).args[0]

        self.assertEqual(tuple(output["samples"].shape), (2, 1, 3, 1, 1))
        self.assertEqual(output["samples"][:, 0, :, 0, 0].tolist(), [[0.0, 1.0, 2.0], [3.0, 4.0, 5.0]])
        self.assertEqual(len(vae.calls), 1)
        self.assertFalse(vae.calls[0]["not_video"])
        self.assertEqual(vae.calls[0]["shape"], (2, 3, 8, 8, 3))

    def test_mode_configuration_does_not_mutate_shared_vae(self):
        vae = _RecordingVAE(latent_dim=3, not_video=False)

        configured = _vae_for_input_mode(vae, IMAGE_BATCH)

        self.assertIsNot(configured, vae)
        self.assertTrue(configured.not_video)
        self.assertFalse(vae.not_video)
        self.assertIs(configured.first_stage_model, vae.first_stage_model)
        self.assertIs(configured.patcher, vae.patcher)

    def test_two_dimensional_vae_uses_native_image_batch_path_unchanged(self):
        vae = _RecordingVAE(latent_dim=2, not_video=False)

        configured = _vae_for_input_mode(vae, IMAGE_BATCH)
        output = UniversalVAEEncode.execute(_pixels(3), vae, IMAGE_BATCH).args[0]

        self.assertIs(configured, vae)
        self.assertEqual(tuple(output["samples"].shape), (3, 1, 1, 1))
        self.assertIs(vae.calls[0]["instance"], vae)
        self.assertFalse(vae.not_video)

    def test_video_frames_rejects_two_dimensional_vae(self):
        vae = _RecordingVAE(latent_dim=2)

        with self.assertRaisesRegex(ValueError, "requires a 3D/video VAE"):
            UniversalVAEEncode.execute(_pixels(3), vae, VIDEO_FRAMES)

        self.assertEqual(vae.calls, [])

    def test_invalid_mode_fails_before_encoding(self):
        vae = _RecordingVAE(latent_dim=3)

        with self.assertRaisesRegex(ValueError, "unsupported input_mode"):
            UniversalVAEEncode.execute(_pixels(1), vae, "guess")

        self.assertEqual(vae.calls, [])

    def test_empty_image_batch_fails_clearly(self):
        vae = _RecordingVAE(latent_dim=3)

        with self.assertRaisesRegex(ValueError, "at least one image"):
            UniversalVAEEncode.execute(_pixels(0), vae, IMAGE_BATCH)

        self.assertEqual(vae.calls, [])

    def test_vae_errors_propagate_without_fallback_or_partial_output(self):
        class _FailingVAE(_RecordingVAE):
            def encode(self, pixels):
                raise RuntimeError("backend encode failed")

        with self.assertRaisesRegex(RuntimeError, "backend encode failed"):
            UniversalVAEEncode.execute(_pixels(2), _FailingVAE(3), IMAGE_BATCH)


if __name__ == "__main__":
    unittest.main()
