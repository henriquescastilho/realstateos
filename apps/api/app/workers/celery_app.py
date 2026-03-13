from app.core.config import settings

try:
    from celery import Celery
except ModuleNotFoundError:  # pragma: no cover
    class _FakeTask:
        def __init__(self, func):
            self.func = func

        def __call__(self, *args, **kwargs):
            return self.func(*args, **kwargs)

        def delay(self, *args, **kwargs):
            return {"status": "queued"}

    class Celery:  # type: ignore[override]
        def __init__(self, *args, **kwargs):
            self.conf = type("Conf", (), {"task_routes": {}})()

        def task(self, *args, **kwargs):
            def decorator(func):
                return _FakeTask(func)

            return decorator


celery_app = Celery("realestateos", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_routes = {"app.workers.jobs.*": {"queue": "default"}}
