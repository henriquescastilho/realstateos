"""Contract Q&A Agent — LlmAgent that answers natural language questions about a contract.

Uses RAG: retrieves relevant contract chunks via pgvector, then synthesizes
an answer grounded in the actual contract text.

Non-ADK fallback: returns a simple RAG-based answer dict when google-adk is not installed.
"""
from __future__ import annotations

import logging
from typing import Any

try:
    from google.adk.agents import LlmAgent  # type: ignore
    _ADK_AVAILABLE = True
except ModuleNotFoundError:  # pragma: no cover
    LlmAgent = None  # type: ignore[assignment,misc]
    _ADK_AVAILABLE = False

from app.config import settings

logger = logging.getLogger(__name__)

_INSTRUCTION = """
You are ContractQAAgent for Real Estate OS — a specialist that answers natural language
questions about a specific rental contract.

Your workflow:
1. Call `get_contract_metadata(contract_id)` FIRST to load the contract header.
2. Call `search_contract_chunks(contract_id, query, limit=5)` with the user's question
   to retrieve the most relevant sections of the contract.
3. Synthesize an answer based ONLY on the retrieved chunks and metadata.
4. If the information is not found in the retrieved chunks, say clearly:
   "Não encontrei essa informação no contrato disponível."
5. Always cite the source (chunk_index) when quoting specific terms.
6. Answer in the same language as the question (Portuguese or English).

Rules:
- Never invent contract terms. Ground every answer in retrieved text.
- Do not hallucinate dates, amounts, or party names.
- Keep answers concise — one paragraph per sub-question at most.
- If asked about legal interpretation, recommend consulting a lawyer.
"""


def build_contract_qa_agent(tools: list) -> Any:
    """Build the ContractQAAgent.

    Args:
        tools: List of callables to expose as ADK tools.

    Returns:
        LlmAgent instance, or None if google-adk is not installed.
    """
    if not _ADK_AVAILABLE or LlmAgent is None:
        logger.warning("google-adk not installed — ContractQAAgent ADK mode unavailable")
        return None

    return LlmAgent(
        name="ContractQAAgent",
        model=settings.google_adk_model,
        instruction=_INSTRUCTION,
        tools=tools,
    )


# ---------------------------------------------------------------------------
# Non-ADK fallback: direct RAG answer
# ---------------------------------------------------------------------------

def answer_question_fallback(
    db: Any,
    contract_id: str,
    question: str,
) -> dict:
    """
    Non-ADK RAG fallback. Retrieves relevant chunks and returns them for
    the caller to compose an answer or display raw context.

    Returns:
        {
          "contract_id": str,
          "question": str,
          "chunks": [{"content": ..., "similarity": ..., "chunk_index": ...}],
          "metadata": {...},
          "answer_mode": "rag_fallback"
        }
    """
    from app.agents.contract_qa_agent.tools import (  # noqa: PLC0415
        get_contract_metadata,
        search_contract_chunks,
    )

    chunks = search_contract_chunks(db, contract_id, question, limit=5)
    metadata = get_contract_metadata(db, contract_id)

    return {
        "contract_id": contract_id,
        "question": question,
        "chunks": [
            {
                "chunk_id": c.chunk_id,
                "content": c.content,
                "similarity": c.similarity,
                "chunk_index": c.chunk_index,
            }
            for c in chunks
        ],
        "metadata": metadata,
        "answer_mode": "rag_fallback",
    }
