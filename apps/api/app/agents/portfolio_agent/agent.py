"""Portfolio Intelligence Agent — ADK LlmAgent with portfolio analysis tools.

Non-ADK fallback: returns a simple dict with available tools when google-adk is not installed.
"""
from __future__ import annotations

import logging

try:
    from google.adk.agents import LlmAgent
except ModuleNotFoundError:  # pragma: no cover
    LlmAgent = None  # type: ignore[assignment,misc]

from app.config import settings

logger = logging.getLogger(__name__)

_INSTRUCTION = """
You are PortfolioIntelligenceAgent for Real Estate OS — a financial analytics specialist.

Your role is to analyze real estate portfolio performance and surface actionable insights
for property managers and owners.

Available tools:
- get_portfolio_summary(): Overall KPIs — active contracts, revenue, charges
- calculate_default_rate(period_months): Payment default rate over past N months
- get_expiring_contracts(days_ahead): Contracts expiring soon (renewal opportunities)
- calculate_avg_resolution_time(): Task automation rate and escalation stats
- generate_portfolio_report(month): Comprehensive monthly report (YYYY-MM format)

Behavior guidelines:
- Always use tools to fetch real data before making any assertions
- Highlight risk signals: high default rates (>5%), many expiring contracts, low automation
- Format monetary values as BRL when displaying to users
- Be specific with numbers — avoid vague statements
- When asked for a report, call generate_portfolio_report first, then add interpretation
- Escalate to humans if you detect anomalies (default rate > 15%, sudden revenue drop > 20%)
"""


def build_portfolio_agent(tools: list):
    """Build the PortfolioIntelligenceAgent.

    Args:
        tools: List of callables to expose as ADK tools.

    Returns:
        LlmAgent instance, or None if google-adk is not installed.
    """
    if LlmAgent is None:
        logger.warning("google-adk not installed — PortfolioAgent unavailable")
        return None

    return LlmAgent(
        name="PortfolioIntelligenceAgent",
        model=settings.google_adk_model,
        instruction=_INSTRUCTION,
        tools=tools,
    )
