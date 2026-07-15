"""Pure value routing for ParameterReceiver."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

MAX_RECEIVER_SLOTS = 32


def receiver_values(inputs: Mapping[str, Any]) -> tuple[Any, ...]:
    """Return the fixed receiver slots in protocol order."""
    return tuple(inputs.get(f"input_{index}") for index in range(1, MAX_RECEIVER_SLOTS + 1))
