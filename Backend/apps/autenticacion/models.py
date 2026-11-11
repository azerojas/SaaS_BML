from django.db import models


class LoginAttempt(models.Model):
    """Persistent counters shared by all backend processes; keys contain no PII."""
    key = models.CharField(max_length=64, primary_key=True)
    started_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)

