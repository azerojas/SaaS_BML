import uuid
from django.db import models


class UploadedPhoto(models.Model):
    """Normalized catalog photographs, included in the existing database backups."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content = models.BinaryField(editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        default_permissions = ()
