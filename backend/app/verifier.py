"""Citation verifier: an answer may only cite entries the executor returned (proposal decision 4)."""

from collections.abc import Sequence

from app.schemas.api import Answer


def verify(answer: Answer, returned_ids: Sequence[str]) -> Answer | None:
    """Return the answer unchanged if it cites at least one entry and every citation is valid, else None."""
    if not answer.text.strip() or not answer.cited:
        return None
    if len(set(answer.cited)) != len(answer.cited):
        return None
    allowed = set(returned_ids)
    if any(c not in allowed for c in answer.cited):
        return None
    return answer
