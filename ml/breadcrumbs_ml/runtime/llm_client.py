"""Local LLM client (runtime decided in ml/CLAUDE.md Q&A item 1). Implements app.ports.LLMClient.

Modes: live (call the local model), record (call and save the response keyed by
request hash), replay (return the saved response; graded runs use this).
"""

NOT_READY = "not implemented yet: see ml/CLAUDE.md Q&A"


class LocalLLMClient:
    def __init__(self, mode: str) -> None:
        self.mode = mode

    def complete(self, messages: list[dict[str, str]], json_schema: dict) -> str:
        raise NotImplementedError(NOT_READY)
