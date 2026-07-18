"""Runtime location and singleton for CharacterFeatureSwap settings."""

from __future__ import annotations

from pathlib import Path

from .character_feature_swap_settings import CharacterFeatureSwapSettingsStore

_store: CharacterFeatureSwapSettingsStore | None = None


def _settings_path() -> Path:
    import folder_paths

    return Path(folder_paths.get_user_directory()) / "aaalice-nodes" / "character_feature_swap.json"


def get_character_feature_swap_store() -> CharacterFeatureSwapSettingsStore:
    global _store
    if _store is None:
        _store = CharacterFeatureSwapSettingsStore(_settings_path())
    return _store
