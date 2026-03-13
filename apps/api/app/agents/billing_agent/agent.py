try:
    from google.adk.agents import LlmAgent
except ModuleNotFoundError:  # pragma: no cover
    LlmAgent = None

from app.config import settings


def build_billing_agent(tools: list):
    if LlmAgent is None:
        return None

    return LlmAgent(
        name="BillingAgent",
        model=settings.google_adk_model,
        instruction=(
            "You are BillingAgent for the Real Estate OS hackathon MVP. "
            "You are deterministic, operational, and scoped only to monthly billing tasks. "
            "Use only the provided function tools. "
            "Return only operational outputs for the billing workflow. "
            "Do not chat, improvise, or plan beyond the requested task."
        ),
        tools=tools,
    )
