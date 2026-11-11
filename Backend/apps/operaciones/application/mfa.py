"""Operator-provisioned TOTP, encrypted at rest, replay protection and single-use recovery."""
import hashlib
import secrets
import time
import uuid
from datetime import timedelta
from cryptography.fernet import Fernet,InvalidToken
from django.conf import settings
from django.contrib.auth import get_user_model,login
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django_otp.oath import TOTP
from apps.operaciones.models import MFADevice
from negocio.models import Auditoria


def begin(request,user):
    if not(settings.MFA_REQUIRED or settings.MFA_OPTIONAL_ENABLED):return None
    device=MFADevice.objects.filter(user=user).first()
    if device is None:
        if settings.MFA_REQUIRED:return {'code':'mfa_setup_required','detail':'Segundo factor requiere aprovisionamiento autorizado.'},403
        return None
    request.session.flush()
    request.session['mfa_candidate']={'user_id':user.pk,'hash':user.get_session_auth_hash(),'until':timezone.now().timestamp()+300}
    return {'mfa_required':True,'setup_confirmation_required':not device.confirmed},202


def session_valid(request):
    if not request.user.is_authenticated:return False
    epoch=request.session.get('mfa_epoch')
    if not epoch:return False
    return MFADevice.objects.filter(user_id=request.user.pk,confirmed=True,session_epoch=epoch).exists()


def verify(request,code):
    candidate=request.session.get('mfa_candidate',{})
    if not isinstance(candidate,dict) or candidate.get('until',0)<timezone.now().timestamp():
        request.session.pop('mfa_candidate',None)
        return {'code':'mfa_challenge_expired','detail':'La sesion de verificacion vencio. Inicia sesion de nuevo.'},401
    with transaction.atomic():
        user=get_user_model().objects.filter(pk=candidate.get('user_id'),is_staff=True,is_active=True).first()
        if not user or not constant_time_compare(user.get_session_auth_hash(),candidate.get('hash','')):
            request.session.flush()
            return {'code':'mfa_challenge_expired','detail':'La sesion de verificacion vencio. Inicia sesion de nuevo.'},401
        device=MFADevice.objects.select_for_update().filter(user=user).first()
        if device is None:return {'code':'mfa_invalid','detail':'Segundo factor invalido.'},401
        now=timezone.now()
        if device.locked_until and device.locked_until>now:return {'code':'mfa_locked','detail':'Segundo factor temporalmente bloqueado.'},429
        accepted=False
        used_recovery=False
        if len(code)==6 and code.isascii() and code.isdigit():
            try:
                secret=Fernet(settings.MFA_ENCRYPTION_KEY.encode()).decrypt(device.secret_encrypted.encode())
                token=TOTP(bytes.fromhex(secret.decode()),step=30,digits=6)
                token.time=now.timestamp()
                accepted=token.verify(int(code),tolerance=1,min_t=device.last_step+1)
                if accepted:device.last_step=token.t()
            except (ValueError,InvalidToken):
                return {'code':'mfa_unavailable','detail':'Segundo factor no disponible.'},503
        elif device.confirmed:
            digest=hashlib.sha256(code.encode()).hexdigest()
            for stored in device.recovery_hashes:
                if constant_time_compare(digest,stored):
                    accepted=True
                    used_recovery=True
                    device.recovery_hashes=[item for item in device.recovery_hashes if item!=stored]
                    device.session_epoch=uuid.uuid4()
                    break
        if not accepted:
            device.attempts+=1
            if device.attempts>=5:
                device.locked_until=now+timedelta(minutes=15)
                device.attempts=0
            device.save(update_fields=['attempts','locked_until'])
            return {'code':'mfa_invalid','detail':'Segundo factor invalido.'},401
        recovery=[]
        if not device.confirmed:
            recovery=[secrets.token_urlsafe(24) for _ in range(6)]
            device.recovery_hashes=[hashlib.sha256(item.encode()).hexdigest() for item in recovery]
        device.confirmed=True
        device.attempts=0
        device.locked_until=None
        device.save()
        login(request,user,backend='django.contrib.auth.backends.ModelBackend')
        request.session.pop('mfa_candidate',None)
        request.session['mfa_epoch']=str(device.session_epoch)
        Auditoria.objects.create(usuario=user,entidad='security',entidad_id=str(user.pk),accion='MFA_VERIFICADO',
            datos={'recovery_used':used_recovery},creada_en=now)
        result={'mfa_verified':True}
        if recovery:result['recovery_codes']=recovery
        return result,200
