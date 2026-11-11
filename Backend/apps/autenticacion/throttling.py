from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from .models import LoginAttempt


def consume_login_attempt(request, username):
    # REMOTE_ADDR only: forwarded headers are not trusted automatically.
    ip = request.META.get('REMOTE_ADDR', 'unknown')
    keys = sorted([
        salted_hmac('login-ip', ip).hexdigest(),
        salted_hmac('login-account', username.casefold()).hexdigest(),
    ])
    now = timezone.now()
    with transaction.atomic():
        allowed = True
        for key in keys:
            LoginAttempt.objects.get_or_create(key=key, defaults={'started_at': now})
            row = LoginAttempt.objects.select_for_update().get(pk=key)
            if row.started_at <= now - timedelta(seconds=settings.LOGIN_RATE_WINDOW):
                row.started_at, row.attempts = now, 0
            row.attempts = min(row.attempts + 1, settings.LOGIN_RATE_LIMIT + 1)
            row.save(update_fields=['started_at', 'attempts'])
            allowed = allowed and row.attempts <= settings.LOGIN_RATE_LIMIT
    return allowed

