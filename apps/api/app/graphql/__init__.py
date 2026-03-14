"""GraphQL layer — strawberry-graphql alongside REST.

Mounted at /graphql (HTTP + WebSocket for subscriptions).

If strawberry-graphql is not installed, a placeholder router returns HTTP 503
with instructions to install the dependency.
"""
