"""Actual Django HTTP server and synthetic PostgreSQL fixtures for browser acceptance. No primary DB writes."""
import base64
import hmac
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import sys
import threading
from urllib.parse import urlsplit,urlunsplit,urlencode
from wsgiref.simple_server import make_server,WSGIRequestHandler,WSGIServer
from socketserver import ThreadingMixIn
import psycopg
from psycopg import sql
from cryptography.fernet import Fernet
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
fixture=Path(os.environ['BM_E2E_FIXTURE']).resolve()
assert not fixture.exists(),'Refuse overwriting a test fixture.'
if os.environ.get('BM_E2E_DATABASE_URL'):
    source=urlsplit(os.environ['BM_E2E_DATABASE_URL'])
    assert os.environ.get('CI')=='true' and source.hostname in ('127.0.0.1','localhost') and source.path in ('/beauty_ci','/postgres'), 'Disposable localhost CI PostgreSQL required.'
    transport={'sslmode':'disable','connect_timeout':5}
else:
    private=Path.home()/'.codex/lasheo-private/local-operation'
    owner=dict(line.split('=',1) for line in (private/'restore-windows.env').read_text().splitlines() if '=' in line)
    source=urlsplit(owner['DATABASE_URL'])
    transport={'sslmode':'verify-full','sslrootcert':owner['DB_SSLROOTCERT'],'connect_timeout':5}
name='frontend_e2e_'+secrets.token_hex(8)
assert source.path.strip('/')!=name
control=psycopg.connect(urlunsplit(source._replace(path='/postgres')),**transport,autocommit=True)
control.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
print('Creating isolated frontend_e2e_* database; primary tables remain untouched.',flush=True)
try:
    os.environ.update({'DJANGO_ENV':'ci','DJANGO_SETTINGS_MODULE':'config.settings.frontend_e2e',
        'SECRET_KEY':secrets.token_urlsafe(64),'FRONTEND_TEST_MFA_KEY':Fernet.generate_key().decode(),
        'DATABASE_URL':urlunsplit(source._replace(path='/'+name,query=urlencode(transport)))})
    import django
    django.setup()
    from django.conf import settings
    from django.db import connection,connections
    from django.core.management import call_command
    from django.core.wsgi import get_wsgi_application
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Permission
    from django.contrib.sessions.models import Session
    from apps.operaciones.models import MFADevice
    from apps.autenticacion.models import LoginAttempt
    assert settings.APP_ENV=='ci' and connection.settings_dict['NAME']==name
    with connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'");assert cursor.fetchone()[0]==0
        cursor.execute((ROOT/'tests/legacy_schema.sql').read_text(encoding='utf-8'))
        cursor.execute('SET search_path TO public')
    call_command('migrate',interactive=False,verbosity=0)
    password=secrets.token_urlsafe(26)
    users={}
    for role,staff in [('admin',True),('limited',True),('regular',False),('second',True),('summary',True),('clients',True),('inventory',True),('exporter',True),('agenda_reader',True),('agenda_manager',True),('specialist',True)]:
        user=get_user_model().objects.create_user('e2e_'+role,password=password,is_staff=staff,first_name='Equipo' if staff else 'Persona',last_name='de prueba E2E')
        if role in ('admin','second'):
            user.user_permissions.add(*Permission.objects.filter(content_type__app_label__in=['negocio','finanzas','agenda','reporting']).exclude(codename__startswith='delete_'))
        report_roles={'summary':['view_summary'],'clients':['view_clients'],'inventory':['view_inventory'],'exporter':['view_summary','export']}
        if role in report_roles:user.user_permissions.add(*Permission.objects.filter(content_type__app_label='reporting',codename__in=report_roles[role]))
        if role=='agenda_reader':user.user_permissions.add(Permission.objects.get(content_type__app_label='agenda',codename='view_agenda'))
        if role=='specialist':user.user_permissions.add(Permission.objects.get(content_type__app_label='agenda',codename='view_own_agenda'))
        if role=='agenda_manager':
            user.user_permissions.add(*Permission.objects.filter(content_type__app_label='agenda',codename__in=['view_agenda','manage_appointments']))
            user.user_permissions.add(*Permission.objects.filter(content_type__app_label='negocio',codename__in=['view_clientas','view_servicios']))
        secret=secrets.token_bytes(20)
        recovery=secrets.token_urlsafe(24)
        if staff:MFADevice.objects.create(user=user,secret_encrypted=Fernet(settings.MFA_ENCRYPTION_KEY.encode()).encrypt(secret.hex().encode()).decode(),confirmed=True,recovery_hashes=[hashlib.sha256(recovery.encode()).hexdigest()])
        users[role]={'username':user.username,'password':password,'totp_secret':base64.b32encode(secret).decode(),'recovery_code':recovery}
    from negocio import models as m
    admin=get_user_model().objects.get(username='e2e_admin')
    admin.user_permissions.add(Permission.objects.get(content_type__app_label='negocio',codename='delete_imagenescatalogo'))
    category=m.CategoriasServicio.objects.create(nombre='Categoria base E2E',activa=True,orden=0)
    article_category=m.CategoriasArticulo.objects.create(nombre='Articulos base E2E')
    unit=m.UnidadesMedida.objects.create(codigo='ML',nombre='Mililitro E2E')
    material=m.Articulos.objects.create(nombre='Material base E2E',slug='material-base-e2e',tipo='INSUMO',unidad=unit,activo=True,visible_catalogo=False)
    product=m.Articulos.objects.create(nombre='Producto visible E2E',slug='producto-visible-e2e',tipo='VENTA',unidad=unit,categoria=article_category,precio_venta='27.35',activo=True,visible_catalogo=True)
    public_service=m.Servicios.objects.create(nombre='Tratamiento visible E2E',slug='tratamiento-visible-e2e',categoria=category,precio_base='80.10',activo=True,visible_catalogo=True,duracion_minutos=60)
    hidden_service=m.Servicios.objects.create(nombre='Tratamiento privado E2E',slug='tratamiento-privado-e2e',precio_base='9.99',activo=True,visible_catalogo=False)
    for index in range(25):
        m.Clientas.objects.create(nombres='Clienta E2E '+str(index).zfill(2),apellidos='Prueba',telefono='+5198'+str(index).zfill(7),notas_privadas='PRIVATE_SENTINEL_PHASE2',canal_preferido='EMAIL',acepta_recordatorios=False)
    catalog_fixture={'category':category.pk,'unit':unit.pk,'material':material.pk,'product':product.pk,'public_service':public_service.pk,'hidden_slug':hidden_service.slug}
    supplier=m.Proveedores.objects.create(nombre='Proveedor base E2E',ruc='SYNTHETIC-E2E',activo=True)
    articles=[]
    for index in range(25):
        article=m.Articulos.objects.create(nombre='ZZ insumo E2E '+str(index).zfill(2),slug='zz-insumo-e2e-'+str(index),sku='INV-E2E-'+str(index).zfill(2),tipo='INSUMO',unidad=unit,categoria=article_category,stock_minimo='2.000',activo=True,visible_catalogo=False)
        articles.append(article.pk)
    for index in range(21):
        m.Proveedores.objects.create(nombre='ZZ proveedor E2E '+str(index).zfill(2),ruc='SYNTH-'+str(index),activo=True)
    inventory_fixture={'supplier':supplier.pk,'articles':articles,'unit':unit.pk}
    # Separate phase-4 fixtures preserve stock and recipes asserted by prior phases.
    from decimal import Decimal
    from apps.inventario import services as inventory_services
    finance_product=m.Articulos.objects.create(nombre='Producto caja F4 E2E',slug='producto-caja-f4-e2e',tipo='VENTA',unidad=unit,precio_venta='20.00',activo=True)
    finance_material=m.Articulos.objects.create(nombre='Insumo caja F4 E2E',slug='insumo-caja-f4-e2e',tipo='INSUMO',unidad=unit,activo=True)
    finance_service=m.Servicios.objects.create(nombre='Tratamiento caja F4 E2E',slug='tratamiento-caja-f4-e2e',precio_base='80.00',activo=True)
    m.RecetasServicio.objects.create(servicio=finance_service,articulo=finance_material,cantidad_estimada=Decimal('0.250'))
    purchase=inventory_services.save_purchase({'detalles':[{'articulo_id':item.pk,'unidad_id':unit.pk,'cantidad':Decimal('100.000'),'costo_unitario':Decimal('3.0000')} for item in [finance_product,finance_material]]},admin)
    inventory_services.receive_purchase(purchase.pk,admin)
    point=m.PuntosQr.objects.create(nombre='Recepcion F4 E2E',activo=True)
    finance_client=m.Clientas.objects.create(nombres='Recurrente F4',apellidos='Ficticia',telefono='+51955123000',activa=True,acepta_recordatorios=False,canal_preferido='EMAIL')
    finance_fixture={'point':point.pk,'token':str(point.token),'product':finance_product.pk,'material':finance_material.pk,'service':finance_service.pk,'unit':unit.pk,'client':finance_client.pk,'phone':finance_client.telefono}
    # Existing appointment with a confirmed advance for the application-only UI.
    from datetime import timedelta
    from django.utils import timezone
    from django.db import transaction
    from apps.finanzas.application import visits as finance_visits,sales as finance_sales,advances as finance_advances
    with transaction.atomic():
        professional=m.Profesionales.objects.create(nombres='Profesional F4',apellidos='Ficticia')
        advance_visit=finance_visits.open_visit({'clienta_id':finance_client.pk},admin)['visita_id']
        now=timezone.now()
        appointment=m.Citas.objects.create(clienta=finance_client,profesional=professional,visita_id=advance_visit,inicio_en=now,fin_en=now+timedelta(minutes=30),precio_total=Decimal('100.00'))
        advance_id=finance_advances.create_advance({'cita_id':appointment.pk,'metodo':'EFECTIVO','monto':Decimal('10.00')},admin)['anticipo_id']
        finance_advances.confirm_advance(advance_id,{'verificado_manualmente':True},admin)
        advance_sale=finance_sales.create_sale_draft({'visita_id':advance_visit,'lineas':[{'tipo':'PRODUCTO','articulo_id':finance_product.pk,'unidad_id':unit.pk,'cantidad':Decimal('1.000')}]},admin)['venta_id']
        finance_sales.confirm_sale(advance_sale,{'consumos_revisados':True,'consumos_reales':[]},admin)
    finance_fixture.update({'advance_sale':advance_sale,'advance':advance_id,'professional':professional.pk})
    from frontend_analytics_fixture import seed as seed_analytics
    analytics_fixture=seed_analytics(admin,unit)
    from frontend_agenda_fixture import seed as seed_agenda
    agenda_fixture=seed_agenda(admin)
    m.Profesionales.objects.filter(pk=agenda_fixture['professional']).update(usuario=get_user_model().objects.get(username='e2e_specialist'))
    if os.environ.get('BM_E2E_BACKUP_CHECK')=='1':
        from frontend_phase7_ops import verify_backup
        verify_backup(transport,ROOT.parent/'Frontend/.artifacts/phase7-restore.json')
    key=secrets.token_urlsafe(32)
    real_app=get_wsgi_application()
    def application(environ,start_response):
        try:
            if environ.get('PATH_INFO','').startswith('/__test__/'):
                allowed=environ.get('REQUEST_METHOD')=='POST' and hmac.compare_digest(environ.get('HTTP_X_TEST_CONTROL',''),key)
                if not allowed:
                    start_response('403 Forbidden',[('Content-Type','application/json')]);return [b'{}']
                assert connection.settings_dict['NAME']==name and name.startswith('frontend_e2e_')
                path=environ['PATH_INFO']
                if path=='/__test__/reset':
                    settings.FRONTEND_CONTRACT_VERSION=''
                    Session.objects.all().delete();LoginAttempt.objects.all().delete()
                    MFADevice.objects.all().update(last_step=-1,attempts=0,locked_until=None)
                    for values in users.values():
                        MFADevice.objects.filter(user__username=values['username']).update(recovery_hashes=[hashlib.sha256(values['recovery_code'].encode()).hexdigest()])
                    settings.LOGIN_RATE_LIMIT=1000
                    settings.AGENDA_REQUIRE_DEPOSITS=True
                    settings.AGENDA_PUBLIC_WRITE_ENABLED=False
                    get_user_model().objects.get(username='e2e_specialist').user_permissions.remove(Permission.objects.get(content_type__app_label='agenda',codename='manage_own_schedule'))
                    m.ConfiguracionReservas.objects.filter(pk=1).update(reservas_online_activas=False)
                    settings.CHECKIN_POST_IP_LIMIT=1000
                    settings.CATALOG_IMAGE_ALLOWED_HOSTS=['images.example.test']
                    m.Auditoria.objects.filter(entidad='reporting',accion='EXPORTAR_XLSX').delete()
                elif path=='/__test__/booking-mode':
                    settings.AGENDA_REQUIRE_DEPOSITS=False
                    settings.AGENDA_PUBLIC_WRITE_ENABLED=True
                    m.ConfiguracionReservas.objects.filter(pk=1).update(reservas_online_activas=True)
                    m.Profesionales.objects.filter(pk=agenda_fixture['professional']).update(visible_reservas=True)
                    m.Servicios.objects.filter(pk=agenda_fixture['service']).update(visible_catalogo=True,reservable_online=True)
                elif path=='/__test__/specialist-mode':
                    get_user_model().objects.get(username='e2e_specialist').user_permissions.add(Permission.objects.get(content_type__app_label='agenda',codename='manage_own_schedule'))
                elif path=='/__test__/contract-on':settings.FRONTEND_CONTRACT_VERSION='1'
                elif path=='/__test__/contract-next':settings.FRONTEND_CONTRACT_VERSION='2'
                elif path=='/__test__/expire':Session.objects.all().delete()
                elif path=='/__test__/throttle':settings.LOGIN_RATE_LIMIT=1
                elif path=='/__test__/images-disabled':settings.CATALOG_IMAGE_ALLOWED_HOSTS=[]
                elif path=='/__test__/checkin-throttle':settings.CHECKIN_POST_IP_LIMIT=1
                elif path=='/__test__/shutdown':threading.Thread(target=server.shutdown,daemon=True).start()
                else:
                    start_response('404 Not Found',[('Content-Type','application/json')]);return [b'{}']
                start_response('200 OK',[('Content-Type','application/json')]);return [b'{"test_control":true}']
            return real_app(environ,start_response)
        finally:connections.close_all()
    class Server(ThreadingMixIn,WSGIServer):daemon_threads=True
    class QuietHandler(WSGIRequestHandler):
        def log_message(self,*args):pass
    server=make_server('127.0.0.1',0,application,server_class=Server,handler_class=QuietHandler)
    sys.path.insert(0,str(ROOT/'deployment'))
    from local_certificates import create
    certificate_folder=fixture.parent/'certificates'
    create(certificate_folder)
    values={'backend_port':server.server_port,'control_key':key,'users':users,'synthetic':True,'catalog':catalog_fixture,'inventory':inventory_fixture,'finance':finance_fixture,'analytics':analytics_fixture,'agenda':agenda_fixture,
        'certificate':str(certificate_folder/'server.crt'),'certificate_key':str(certificate_folder/'server.key')}
    fixture.parent.mkdir(parents=True,exist_ok=True)
    with os.fdopen(os.open(fixture,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w',encoding='utf-8') as file:json.dump(values,file)
    def stop(signum,frame):raise KeyboardInterrupt
    signal.signal(signal.SIGINT,stop)
    if hasattr(signal,'SIGBREAK'):signal.signal(signal.SIGBREAK,stop)
    print('FRONTEND_E2E_READY',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();connections.close_all()
finally:
    assert name.startswith('frontend_e2e_') and name!=source.path.strip('/')
    print('Removing isolated frontend E2E database.',flush=True)
    control.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))
    control.close()
    print('Isolated frontend E2E database removed.',flush=True)
