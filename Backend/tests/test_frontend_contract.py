from django.http import JsonResponse
from django.test import SimpleTestCase,RequestFactory,override_settings
from config.middleware import FrontendContractMiddleware


@override_settings(FRONTEND_CONTRACT_VERSION='1')
class BrowserContractTests(SimpleTestCase):
    def test_missing_or_stale_contract_never_executes_a_mutation(self):
        calls=[]
        middleware=FrontendContractMiddleware(lambda request:calls.append(request) or JsonResponse({'written':True}))
        for version in ('','old'):
            response=middleware(RequestFactory().post('/api/ventas/',{},HTTP_X_BEAUTY_CONTRACT=version))
            self.assertEqual(response.status_code,503)
            self.assertEqual(response.content.count(b'APP_UPDATE_REQUIRED'),1)
        self.assertEqual(calls,[])
        self.assertEqual(middleware(RequestFactory().post('/api/ventas/',{},HTTP_X_BEAUTY_CONTRACT='1')).status_code,200)
        self.assertEqual(len(calls),1)

    def test_recovery_get_and_health_are_unaffected(self):
        middleware=FrontendContractMiddleware(lambda request:JsonResponse({'read':True}))
        for path in ('/api/v1/agenda/intentos/test/','/health/ready'):
            self.assertEqual(middleware(RequestFactory().get(path)).status_code,200)
