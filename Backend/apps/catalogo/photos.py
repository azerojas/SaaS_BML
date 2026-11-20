from io import BytesIO
import json
import warnings
from django.conf import settings
from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import PermissionDenied, ValidationError
from .models import UploadedPhoto


def normalized_photo(upload):
    if upload.size > settings.CATALOG_PHOTO_MAX_BYTES:
        raise ValidationError({'foto': 'La foto debe pesar como máximo 5 MB.'})
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(upload) as source:
                if source.format not in ('JPEG', 'PNG', 'WEBP') or getattr(source, 'n_frames', 1) != 1:
                    raise ValueError()
                if source.width * source.height > 20_000_000:
                    raise ValidationError({'foto': 'Usa una foto de hasta 20 megapíxeles.'})
                source.verify()
            upload.seek(0)
            with Image.open(upload) as source:
                image = ImageOps.exif_transpose(source).convert('RGBA')
                image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
                flattened = Image.new('RGB', image.size, 'white')
                flattened.paste(image, mask=image.getchannel('A'))
                output = BytesIO()
                flattened.save(output, format='JPEG', quality=85, optimize=True)
                content = output.getvalue()
                if len(content) > 2 * 1024 * 1024:
                    raise ValidationError({'foto': 'Reduce las dimensiones de la foto e inténtalo de nuevo.'})
                return content
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError,
            Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise ValidationError({'foto': 'Selecciona una foto JPG, PNG o WebP válida, sin animación.'}) from None


def multipart_photo(request):
    if set(request.data) != {'datos', 'foto'} or len(request.FILES.getlist('foto')) != 1 or len(request.data.getlist('datos')) != 1:
        raise ValidationError({'foto': 'Envía una sola foto junto a los datos del tratamiento.'})
    raw = request.data['datos']
    if not isinstance(raw, str) or len(raw.encode('utf-8')) > settings.DATA_UPLOAD_MAX_MEMORY_SIZE:
        raise ValidationError({'datos': 'Los datos del tratamiento son demasiado grandes.'})
    try:
        data = json.loads(raw)
    except (ValueError, RecursionError):
        raise ValidationError({'datos': 'Los datos del tratamiento no son válidos.'}) from None
    if not isinstance(data, dict):
        raise ValidationError({'datos': 'Se espera un objeto de datos del tratamiento.'})
    return data, normalized_photo(request.FILES['foto'])


@transaction.atomic
def save_with_photo(data, content, actor, pk=None):
    from . import services
    if not actor.has_perm('negocio.add_imagenescatalogo'):
        raise PermissionDenied('No tienes permiso para añadir fotografías.')
    parent = services.save_entity('servicios', data, actor, pk)
    if services.image_rows('servicios', parent.pk).exists() and not actor.has_perm('negocio.change_imagenescatalogo'):
        raise PermissionDenied('No tienes permiso para cambiar la foto principal.')
    photo = UploadedPhoto.objects.create(content=content)
    services.add_image('servicios', parent.pk, {
        'url': '/api/catalogo/fotos/' + photo.id.hex + '.jpg',
        'texto_alt': parent.nombre, 'orden': 0, 'es_principal': True,
    }, actor)
    return parent
