import json
from urllib.parse import urlsplit
from urllib.request import Request,build_opener,HTTPRedirectHandler
from django.conf import settings


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None


def deliver(findings):
    url=settings.ALERT_WEBHOOK_URL
    parts=urlsplit(url)
    local=settings.ALLOW_LOCAL_ALERT_TESTS and settings.APP_ENV in ('ci','development') and parts.hostname in ('127.0.0.1','localhost')
    if not url or parts.scheme!='https' and not local or parts.username or parts.password:
        raise ValueError('Destino de alertas HTTPS aprobado requerido.')
    token=settings.ALERT_WEBHOOK_TOKEN
    if not token:raise ValueError('Falta credencial de alertas.')
    request=Request(url,data=json.dumps({'service':'beauty-manager','alerts':findings}).encode(),method='POST',
        headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
    with build_opener(NoRedirect()).open(request,timeout=5) as response:
        if response.status not in (200,201,202,204):raise ValueError('Alerta no aceptada.')
