from fastapi import HTTPException, status


def ensure_roles(user_role: str, allowed_roles: set[str]) -> None:
    if user_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this resource.",
        )

