import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class MFADevice(models.Model):
    user=models.OneToOneField(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
    secret_encrypted=models.TextField()
    confirmed=models.BooleanField(default=False)
    last_step=models.BigIntegerField(default=-1)
    attempts=models.PositiveIntegerField(default=0)
    locked_until=models.DateTimeField(null=True)
    recovery_hashes=models.JSONField(default=list)
    session_epoch=models.UUIDField(default=uuid.uuid4)
    created_at=models.DateTimeField(default=timezone.now)
    class Meta:
        permissions=[('view_operations','Consultar estado operativo privado')]


class JobState(models.Model):
    key=models.CharField(max_length=64,primary_key=True)
    status=models.CharField(max_length=16,default='NEVER')
    started_at=models.DateTimeField(null=True)
    finished_at=models.DateTimeField(null=True)
    last_success_at=models.DateTimeField(null=True)
    summary=models.JSONField(default=dict)
