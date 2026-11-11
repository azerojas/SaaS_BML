from django.apps import AppConfig


class OperacionesConfig(AppConfig):
    name='apps.operaciones'
    def ready(self):
        from . import checks  # noqa: F401
