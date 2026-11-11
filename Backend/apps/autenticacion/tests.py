from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


class AuthenticationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user('admin_test', password='Test-only-long-pass!', is_staff=True)
        cls.regular = get_user_model().objects.create_user('regular_test', password='Test-only-long-pass!')

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf(self):
        self.assertEqual(self.client.get('/api/auth/csrf/').status_code, 200)
        return self.client.cookies['csrftoken'].value

    def login(self, username='admin_test', password='Test-only-long-pass!'):
        token = self.csrf()
        return self.client.post('/api/auth/login/', {'username': username, 'password': password},
                                format='json', HTTP_X_CSRFTOKEN=token)

    def test_login_me_logout(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {'id', 'username', 'nombre', 'is_staff','permissions'})
        self.assertTrue(self.client.cookies['sessionid']['httponly'])
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)
        token = self.client.cookies['csrftoken'].value
        self.assertEqual(self.client.post('/api/auth/logout/', HTTP_X_CSRFTOKEN=token).status_code, 204)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 403)

    def test_me_exposes_only_effective_permissions_without_sensitive_fields(self):
        from django.contrib.auth.models import Permission
        permission=Permission.objects.get(content_type__app_label='negocio',codename='view_clientas')
        self.admin.user_permissions.add(permission)
        self.assertEqual(self.login().status_code,200)
        response=self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['permissions'],['negocio.view_clientas'])
        self.assertNotIn('password',response.json())
        self.assertNotIn('email',response.json())

    def test_invalid_password_and_unknown_account_generic(self):
        first = self.login(password='bad')
        second = self.login(username='missing')
        self.assertEqual(first.status_code, 401)
        self.assertEqual(first.json(), second.json())

    def test_inactive_and_non_staff_cannot_login(self):
        self.assertEqual(self.login(username='regular_test').status_code, 401)
        self.admin.is_active = False
        self.admin.save()
        self.assertEqual(self.login().status_code, 401)

    def test_login_requires_csrf_even_anonymous(self):
        self.assertEqual(self.client.post('/api/auth/login/', {'username': 'admin_test', 'password': 'x'}, format='json').status_code, 403)

    def test_logout_requires_csrf_and_post(self):
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 403)
        self.assertEqual(self.client.get('/api/auth/logout/').status_code, 405)

    def test_anonymous_private_routes(self):
        for path, method in [('/api/auth/me/', 'get'), ('/api/auth/logout/', 'post'),
                             ('/api/clientas/', 'get'), ('/api/clientas/', 'post'),
                             ('/api/clientas/1/', 'get'), ('/api/clientas/1/', 'patch'),
                             ('/api/clientas/1/desactivar/', 'post'),
                             ('/api/clientas/1/reactivar/', 'post'),
                             ('/api/clientas/1/consentimiento/', 'post')]:
            with self.subTest(path=path, method=method):
                self.assertEqual(getattr(self.client, method)(path).status_code, 403)

    def test_non_admin_private_routes(self):
        self.client.force_login(self.regular)
        token = self.csrf()
        for path, method in [('/api/auth/me/', 'get'), ('/api/auth/logout/', 'post'),
                             ('/api/clientas/', 'get'), ('/api/clientas/', 'post'),
                             ('/api/clientas/1/', 'get'), ('/api/clientas/1/', 'patch'),
                             ('/api/clientas/1/desactivar/', 'post'),
                             ('/api/clientas/1/reactivar/', 'post'),
                             ('/api/clientas/1/consentimiento/', 'post')]:
            with self.subTest(path=path, method=method):
                self.assertEqual(getattr(self.client, method)(path, HTTP_X_CSRFTOKEN=token).status_code, 403)

    def test_no_registration_route(self):
        self.assertEqual(self.client.get('/api/auth/register/').status_code, 404)

    def test_api_responses_are_not_cached(self):
        response = self.client.get('/api/auth/csrf/')
        self.assertEqual(response['Cache-Control'], 'no-store, private')

    @override_settings(LOGIN_RATE_LIMIT=2)
    def test_login_throttle_persistent_across_clients(self):
        self.assertEqual(self.login(password='bad').status_code, 401)
        self.assertEqual(self.login(password='bad').status_code, 401)
        self.client = APIClient(enforce_csrf_checks=True)
        response = self.login()
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)

    def test_bad_payload(self):
        token = self.csrf()
        for payload in ([], {}, {'username': [], 'password': 1}):
            self.assertEqual(self.client.post('/api/auth/login/', payload, format='json', HTTP_X_CSRFTOKEN=token).status_code, 400)

    @override_settings(PRIVACY_NOTICE_VERSION='test-v1', PRIVACY_NOTICE_URL='https://example.test/privacy', CATALOG_IMAGE_ALLOWED_HOSTS=['images.example.test'])
    def test_presentation_config_is_private_and_contains_only_public_metadata(self):
        self.assertEqual(self.client.get('/api/auth/config/').status_code,403)
        self.login()
        data=self.client.get('/api/auth/config/').json()
        self.assertEqual(data,{'privacy_notice':{'version':'test-v1','url':'https://example.test/privacy'},'image_allowed_hosts':['images.example.test']})

