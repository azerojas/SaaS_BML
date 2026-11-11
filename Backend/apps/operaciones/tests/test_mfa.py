from datetime import timedelta
from unittest.mock import patch
import hashlib
from cryptography.fernet import Fernet
from django.test import override_settings
from django.utils import timezone
from django_otp.oath import TOTP
from rest_framework.test import APIClient
from apps.finanzas.tests.base import FinanceTestCase
from apps.operaciones.models import MFADevice

KEY=Fernet.generate_key().decode()
SECRET='ab'*20


@override_settings(MFA_REQUIRED=True,MFA_ENCRYPTION_KEY=KEY)
class MFATests(FinanceTestCase):
    def setUp(self):
        super().setUp()
        self.admin.set_password('Synthetic-Only-Long-Password!')
        self.admin.save(update_fields=['password'])
        self.client=APIClient(enforce_csrf_checks=True)

    def csrf(self):
        self.client.get('/api/auth/csrf/')
        return self.client.cookies['csrftoken'].value

    def login(self):
        return self.client.post('/api/auth/login/',{'username':self.admin.username,'password':'Synthetic-Only-Long-Password!'},format='json',HTTP_X_CSRFTOKEN=self.csrf())

    def device(self,confirmed=False):
        return MFADevice.objects.create(user=self.admin,secret_encrypted=Fernet(KEY.encode()).encrypt(SECRET.encode()).decode(),confirmed=confirmed)

    def code(self):
        token=TOTP(bytes.fromhex(SECRET))
        token.time=timezone.now().timestamp()
        return str(token.token()).zfill(6)

    def verify(self,code=None):
        return self.client.post('/api/auth/mfa/verify/',{'code':code or self.code()},format='json',HTTP_X_CSRFTOKEN=self.client.cookies['csrftoken'].value)

    def test_first_factor_does_not_grant_access_second_factor_enrolls_and_rotates(self):
        device=self.device()
        response=self.login()
        self.assertEqual(response.status_code,202)
        self.assertEqual(self.client.get('/api/clientas/').status_code,403)
        response=self.verify()
        self.assertEqual(response.status_code,200,response.data if hasattr(response,'data') else response.content)
        self.assertEqual(len(response.json()['recovery_codes']),6)
        self.assertEqual(self.client.get('/api/clientas/').status_code,200)
        device.refresh_from_db()
        self.assertTrue(device.confirmed)
        for code in response.json()['recovery_codes']:self.assertNotIn(code,str(device.recovery_hashes))
        self.assertNotIn(SECRET,device.secret_encrypted)

    def test_missing_device_cannot_self_enroll_or_bypass_with_password(self):
        self.assertEqual(self.login().status_code,403)
        self.assertEqual(self.client.get('/api/clientas/').status_code,403)

    def test_replayed_totp_rejected_and_failed_attempts_lock(self):
        self.device(True)
        self.login()
        token=self.code()
        self.assertEqual(self.verify(token).status_code,200)
        self.login()
        self.assertEqual(self.verify(token).status_code,401)
        for _ in range(4):self.assertEqual(self.verify('invalid-code').status_code,401)
        self.assertEqual(self.verify(token).status_code,429)

    def test_recovery_is_one_time_and_invalidates_other_mfa_sessions(self):
        device=self.device(True)
        device.recovery_hashes=[hashlib.sha256(b'synthetic-recovery-code').hexdigest()]
        device.save()
        previous=str(device.session_epoch)
        self.login()
        self.assertEqual(self.verify('synthetic-recovery-code').status_code,200)
        device.refresh_from_db()
        self.assertNotEqual(previous,str(device.session_epoch))
        self.login()
        self.assertEqual(self.verify('synthetic-recovery-code').status_code,401)

    def test_challenge_expiry_password_change_and_csrf(self):
        self.device(True)
        self.login()
        self.assertEqual(self.client.post('/api/auth/mfa/verify/',{'code':self.code()},format='json').status_code,403)
        with patch('apps.operaciones.application.mfa.timezone.now',return_value=timezone.now()+timedelta(minutes=6)):
            expired=self.verify()
            self.assertEqual(expired.status_code,401)
            self.assertEqual(expired.json()['code'],'mfa_challenge_expired')
        self.assertEqual(self.verify().json()['code'],'mfa_challenge_expired')
        device=MFADevice.objects.get(user=self.admin)
        self.assertEqual(device.attempts,0)
        self.login()
        self.admin.set_password('Changed-Synthetic-Only-Password!')
        self.admin.save(update_fields=['password'])
        invalidated=self.verify()
        self.assertEqual(invalidated.status_code,401)
        self.assertEqual(invalidated.json()['code'],'mfa_challenge_expired')

    def test_existing_single_factor_session_is_denied(self):
        self.device(True)
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get('/api/clientas/').status_code,403)
