from django.apps import AppConfig


class CheckinConfig(AppConfig):
    name = 'apps.checkin'
    def ready(self):
        from . import checks  # noqa: F401

