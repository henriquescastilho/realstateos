from sqlalchemy.orm import Session


class NotificationAgent:
    def run(self, db: Session, task) -> dict:
        return {"status": "completed", "message": task.payload.get("message")}

