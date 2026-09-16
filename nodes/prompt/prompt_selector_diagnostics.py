"""Failure-only, read-only diagnosis without logging prompt content."""

from __future__ import annotations

import logging
import sqlite3
from contextlib import closing

from .._lib.prompt_selector import MissingPromptText
from .prompt_library_routes import get_library_database_path

logger = logging.getLogger(__name__)


def diagnose_missing_text(error: MissingPromptText) -> str:
    database = None
    try:
        database = get_library_database_path().resolve()
        # Do not initialize or repair a library while diagnosing a failed submission.
        with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True, timeout=10)) as db:
            count, present = db.execute(
                "SELECT COUNT(*), EXISTS(SELECT 1 FROM entries WHERE id = ?) FROM entries",
                (error.entry_id,),
            ).fetchone()
    except Exception:
        logger.exception(
            "[Aaalice PromptSelector] status=database-unavailable entry_id=%r "
            "selection_count=%d database=%r; original_error=%s",
            error.entry_id, error.selection_count, database.as_posix() if database else None, error,
        )
        return f"{error}. Server library inspection failed; see the server log. Execution remains blocked."

    status = "entry-present" if present else "entry-absent"
    logger.error(
        "[Aaalice PromptSelector] status=%s entry_id=%r selection_count=%d "
        "database=%r entry_count=%d; submitted text is missing or invalid; execution blocked",
        status, error.entry_id, error.selection_count, database.as_posix(), count,
    )
    if present:
        return (
            f"{error}. The ID exists in the server library at inspection time. "
            "Reload the prompt library and submit again; the submitted text was not replaced automatically."
        )
    return (
        f"{error}. The ID is absent from the current server library at inspection time. "
        "Restore the matching library or explicitly reselect the entry."
    )
