"""Persistent fixed-window HMAC counters; shared by every worker using PostgreSQL."""
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import Throttled
from apps.autenticacion.models import LoginAttempt


def consume(rules):
    now = timezone.now()
    keyed = sorted((salted_hmac('checkin-' + name, str(value), algorithm='sha256').hexdigest(), limit, seconds)
                   for name, value, limit, seconds in rules)
    waits = []
    with transaction.atomic():
        for key, limit, seconds in keyed:
            LoginAttempt.objects.get_or_create(key=key, defaults={'started_at': now})
            row = LoginAttempt.objects.select_for_update().get(pk=key)
            if row.started_at <= now - timedelta(seconds=seconds):
                row.started_at, row.attempts = now, 0
            row.attempts = min(row.attempts + 1, limit + 1)
            row.save(update_fields=['started_at', 'attempts'])
            if row.attempts > limit:
                waits.append(max(1, seconds - (now - row.started_at).total_seconds()))
    if waits:
        raise Throttled(wait=max(waits), detail='Demasiadas solicitudes; intenta mas tarde.')


def consume_request(request):
    ip = request.META.get('REMOTE_ADDR', 'unknown')
    agent = request.META.get('HTTP_USER_AGENT', '')[:128]
    limit = settings.CHECKIN_POST_IP_LIMIT if request.method == 'POST' else settings.CHECKIN_GET_IP_LIMIT
    consume([('ip-minute-' + request.method, ip, limit, 60),
             ('ip-day', ip, settings.CHECKIN_IP_DAY_LIMIT, 86400),
             ('fingerprint-' + request.method, ip + ':' + agent, limit, 60)])


def consume_phone(phone):
    consume([('phone-window', phone, settings.CHECKIN_PHONE_LIMIT, 900)])

