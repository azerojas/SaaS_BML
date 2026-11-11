"""Legacy table mappings. Keep managed=False; business DDL remains externally owned."""
from django.conf import settings
from django.contrib.postgres.functions import TransactionNow
from django.db import models


class AnticiposCita(models.Model):
    id = models.BigAutoField(primary_key=True)
    cita = models.ForeignKey('Citas', models.DO_NOTHING)
    venta = models.ForeignKey('Ventas', models.DO_NOTHING, blank=True, null=True)
    metodo = models.CharField(max_length=18)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    estado = models.CharField(max_length=12, db_default='PENDIENTE')
    referencia = models.CharField(max_length=100, blank=True, null=True)
    comprobante_url = models.CharField(max_length=500, blank=True, null=True)
    pagado_en = models.DateTimeField(blank=True, null=True)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)
    creado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'anticipos_cita'


class Articulos(models.Model):
    id = models.BigAutoField(primary_key=True)
    categoria = models.ForeignKey('CategoriasArticulo', models.DO_NOTHING, blank=True, null=True)
    unidad = models.ForeignKey('UnidadesMedida', models.DO_NOTHING)
    nombre = models.CharField(max_length=160)
    slug = models.CharField(unique=True, max_length=180, blank=True, null=True)
    descripcion = models.TextField(blank=True, null=True)
    sku = models.CharField(unique=True, max_length=45, blank=True, null=True)
    tipo = models.CharField(max_length=12)
    precio_venta = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    stock_minimo = models.DecimalField(max_digits=14, decimal_places=3, db_default=0)
    visible_catalogo = models.BooleanField(db_default=False)
    orden = models.IntegerField(db_default=0)
    activo = models.BooleanField(db_default=True)
    creado_en = models.DateTimeField(db_default=TransactionNow())
    actualizado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'articulos'


class Auditoria(models.Model):
    id = models.BigAutoField(primary_key=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)
    entidad = models.CharField(max_length=80)
    entidad_id = models.CharField(max_length=80, blank=True, null=True)
    accion = models.CharField(max_length=25)
    datos = models.JSONField()
    creada_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'auditoria'


class BloqueosAgenda(models.Model):
    id = models.BigAutoField(primary_key=True)
    profesional = models.ForeignKey('Profesionales', models.DO_NOTHING, blank=True, null=True)
    inicio_en = models.DateTimeField()
    fin_en = models.DateTimeField()
    motivo = models.CharField(max_length=200, blank=True, null=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)
    creado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'bloqueos_agenda'


class CategoriasArticulo(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(unique=True, max_length=100)

    class Meta:
        managed = False
        db_table = 'categorias_articulo'


class CategoriasGasto(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(unique=True, max_length=100)

    class Meta:
        managed = False
        db_table = 'categorias_gasto'


class CategoriasServicio(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(unique=True, max_length=100)
    orden = models.IntegerField(db_default=0)
    activa = models.BooleanField(db_default=True)

    class Meta:
        managed = False
        db_table = 'categorias_servicio'


class CitaEstadosHistorial(models.Model):
    id = models.BigAutoField(primary_key=True)
    cita = models.ForeignKey('Citas', models.DO_NOTHING)
    estado_anterior = models.CharField(max_length=14, blank=True, null=True)
    estado_nuevo = models.CharField(max_length=14)
    cambiado_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)
    origen = models.CharField(max_length=10, db_default='SISTEMA')
    detalle = models.CharField(max_length=250, blank=True, null=True)
    cambiado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'cita_estados_historial'


class CitaServicios(models.Model):
    id = models.BigAutoField(primary_key=True)
    cita = models.ForeignKey('Citas', models.DO_NOTHING)
    servicio = models.ForeignKey('Servicios', models.DO_NOTHING)
    orden = models.SmallIntegerField(db_default=1)
    duracion_minutos = models.IntegerField()
    precio_snapshot = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        managed = False
        db_table = 'cita_servicios'
        unique_together = (('cita', 'servicio'),)


class Citas(models.Model):
    id = models.BigAutoField(primary_key=True)
    clienta = models.ForeignKey('Clientas', models.DO_NOTHING)
    profesional = models.ForeignKey('Profesionales', models.DO_NOTHING)
    visita = models.OneToOneField('Visitas', models.DO_NOTHING, blank=True, null=True)
    codigo_reserva = models.CharField(unique=True, max_length=12, db_default=models.expressions.RawSQL("upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))", []))
    token_gestion = models.UUIDField(unique=True, db_default=models.expressions.RawSQL('gen_random_uuid()', []))
    origen = models.CharField(max_length=10, db_default='MANUAL')
    estado = models.CharField(max_length=14, db_default='PROGRAMADA')
    inicio_en = models.DateTimeField()
    fin_en = models.DateTimeField()
    duracion_total_minutos = models.IntegerField(blank=True, null=True)
    precio_total = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    anticipo_requerido = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    expira_en = models.DateTimeField(blank=True, null=True)
    confirmada_en = models.DateTimeField(blank=True, null=True)
    cancelada_en = models.DateTimeField(blank=True, null=True)
    cancelada_por = models.CharField(max_length=10, blank=True, null=True)
    motivo_cancelacion = models.CharField(max_length=250, blank=True, null=True)
    notas = models.TextField(blank=True, null=True)
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)
    creada_en = models.DateTimeField(db_default=TransactionNow())
    actualizado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'citas'


class Clientas(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombres = models.CharField(max_length=120)
    apellidos = models.CharField(max_length=120)
    telefono = models.CharField(unique=True, max_length=25)
    email = models.CharField(max_length=150, blank=True, null=True)
    fecha_nacimiento = models.DateField(blank=True, null=True)
    notas_privadas = models.TextField(blank=True, null=True)
    consentimiento_datos = models.BooleanField(db_default=False)
    consentimiento_fecha = models.DateTimeField(blank=True, null=True)
    acepta_recordatorios = models.BooleanField(db_default=True)
    canal_preferido = models.CharField(max_length=10, db_default='WHATSAPP')
    activa = models.BooleanField(db_default=True)
    creado_en = models.DateTimeField(db_default=TransactionNow())
    actualizado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'clientas'


class Compras(models.Model):
    id = models.BigAutoField(primary_key=True)
    proveedor = models.ForeignKey('Proveedores', models.DO_NOTHING, blank=True, null=True)
    numero_documento = models.CharField(max_length=90, blank=True, null=True)
    fecha = models.DateTimeField(db_default=TransactionNow())
    estado = models.CharField(max_length=12, db_default='BORRADOR')
    total = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    observaciones = models.TextField(blank=True, null=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'compras'


class ConfiguracionReservas(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    reservas_online_activas = models.BooleanField()
    intervalo_slots_minutos = models.IntegerField()
    anticipacion_minima_minutos = models.IntegerField()
    anticipacion_maxima_dias = models.IntegerField()
    horas_limite_cancelacion = models.IntegerField()
    anticipo_porcentaje = models.DecimalField(max_digits=5, decimal_places=2)
    minutos_expiracion_pago = models.IntegerField()
    max_citas_activas_por_clienta = models.IntegerField()
    actualizado_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'configuracion_reservas'


class ConsumosServicio(models.Model):
    id = models.BigAutoField(primary_key=True)
    detalle_venta = models.ForeignKey('DetallesVenta', models.DO_NOTHING)
    articulo = models.ForeignKey(Articulos, models.DO_NOTHING)
    cantidad = models.DecimalField(max_digits=14, decimal_places=3)
    costo_unitario_snapshot = models.DecimalField(max_digits=12, decimal_places=4)

    class Meta:
        managed = False
        db_table = 'consumos_servicio'


class DetallesCompra(models.Model):
    id = models.BigAutoField(primary_key=True)
    compra = models.ForeignKey(Compras, models.DO_NOTHING)
    articulo = models.ForeignKey(Articulos, models.DO_NOTHING)
    cantidad = models.DecimalField(max_digits=14, decimal_places=3)
    costo_unitario = models.DecimalField(max_digits=12, decimal_places=4)
    numero_lote = models.CharField(max_length=80, blank=True, null=True)
    vencimiento = models.DateField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'detalles_compra'


class DetallesVenta(models.Model):
    id = models.BigAutoField(primary_key=True)
    venta = models.ForeignKey('Ventas', models.DO_NOTHING)
    tipo = models.CharField(max_length=10)
    servicio = models.ForeignKey('Servicios', models.DO_NOTHING, blank=True, null=True)
    articulo = models.ForeignKey(Articulos, models.DO_NOTHING, blank=True, null=True)
    profesional = models.ForeignKey('Profesionales', models.DO_NOTHING, blank=True, null=True)
    descripcion_snapshot = models.CharField(max_length=200)
    cantidad = models.DecimalField(max_digits=14, decimal_places=3)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    descuento_linea = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    costo_unitario_snapshot = models.DecimalField(max_digits=12, decimal_places=4, db_default=0)
    comision_porcentaje_snapshot = models.DecimalField(max_digits=5, decimal_places=2, db_default=0)

    class Meta:
        managed = False
        db_table = 'detalles_venta'


class GastosOperativos(models.Model):
    id = models.BigAutoField(primary_key=True)
    categoria = models.ForeignKey(CategoriasGasto, models.DO_NOTHING)
    descripcion = models.CharField(max_length=250)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    fecha = models.DateField()
    proveedor = models.ForeignKey('Proveedores', models.DO_NOTHING, blank=True, null=True)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)
    creado_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'gastos_operativos'


class HorariosProfesional(models.Model):
    id = models.BigAutoField(primary_key=True)
    profesional = models.ForeignKey('Profesionales', models.DO_NOTHING)
    dia_semana = models.SmallIntegerField()
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()

    class Meta:
        managed = False
        db_table = 'horarios_profesional'


class ImagenesCatalogo(models.Model):
    id = models.BigAutoField(primary_key=True)
    servicio = models.ForeignKey('Servicios', models.DO_NOTHING, blank=True, null=True)
    articulo = models.ForeignKey(Articulos, models.DO_NOTHING, blank=True, null=True)
    url = models.CharField(max_length=500)
    texto_alt = models.CharField(max_length=200, blank=True, null=True)
    orden = models.IntegerField(db_default=0)
    es_principal = models.BooleanField(db_default=False)
    creado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'imagenes_catalogo'


class ListaEspera(models.Model):
    id = models.BigAutoField(primary_key=True)
    clienta = models.ForeignKey(Clientas, models.DO_NOTHING)
    servicio = models.ForeignKey('Servicios', models.DO_NOTHING)
    profesional = models.ForeignKey('Profesionales', models.DO_NOTHING, blank=True, null=True)
    fecha_deseada = models.DateField()
    franja_inicio = models.TimeField(blank=True, null=True)
    franja_fin = models.TimeField(blank=True, null=True)
    estado = models.CharField(max_length=12, db_default='ACTIVA')
    creada_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'lista_espera'


class Llegadas(models.Model):
    id = models.BigAutoField(primary_key=True)
    clienta = models.ForeignKey(Clientas, models.DO_NOTHING)
    punto_qr = models.ForeignKey('PuntosQr', models.DO_NOTHING, blank=True, null=True)
    origen = models.CharField(max_length=12)
    estado = models.CharField(max_length=12, db_default='PENDIENTE')
    solicitada_en = models.DateTimeField(db_default=TransactionNow())
    confirmada_en = models.DateTimeField(blank=True, null=True)
    confirmada_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'llegadas'


class MovimientosInventario(models.Model):
    id = models.BigAutoField(primary_key=True)
    articulo = models.ForeignKey(Articulos, models.DO_NOTHING)
    fecha = models.DateTimeField(db_default=TransactionNow())
    motivo = models.CharField(max_length=24)
    cantidad_firmada = models.DecimalField(max_digits=14, decimal_places=3)
    costo_unitario = models.DecimalField(max_digits=12, decimal_places=4, db_default=0)
    detalle_compra = models.OneToOneField(DetallesCompra, models.DO_NOTHING, blank=True, null=True)
    consumo_servicio = models.OneToOneField(ConsumosServicio, models.DO_NOTHING, blank=True, null=True)
    detalle_venta = models.OneToOneField(DetallesVenta, models.DO_NOTHING, blank=True, null=True)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)
    notas = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'movimientos_inventario'


class Negocio(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    nombre = models.CharField(max_length=160)
    ruc = models.CharField(max_length=20, blank=True, null=True)
    telefono = models.CharField(max_length=25, blank=True, null=True)
    email = models.CharField(max_length=150, blank=True, null=True)
    direccion = models.CharField(max_length=250, blank=True, null=True)
    moneda = models.CharField(max_length=3)
    zona_horaria = models.CharField(max_length=60)
    creado_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'negocio'


class NotificacionesCita(models.Model):
    id = models.BigAutoField(primary_key=True)
    cita = models.ForeignKey(Citas, models.DO_NOTHING)
    canal = models.CharField(max_length=10)
    tipo = models.CharField(max_length=16)
    programada_en = models.DateTimeField()
    enviada_en = models.DateTimeField(blank=True, null=True)
    estado = models.CharField(max_length=10)
    intentos = models.SmallIntegerField()
    error = models.CharField(max_length=300, blank=True, null=True)
    creado_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'notificaciones_cita'
        unique_together = (('cita', 'canal', 'tipo', 'programada_en'),)


class Pagos(models.Model):
    id = models.BigAutoField(primary_key=True)
    venta = models.ForeignKey('Ventas', models.DO_NOTHING)
    metodo = models.CharField(max_length=18)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    estado = models.CharField(max_length=12, db_default='CONFIRMADO')
    pagado_en = models.DateTimeField(db_default=TransactionNow())
    referencia = models.CharField(max_length=100, blank=True, null=True)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'pagos'


class ProfesionalServicios(models.Model):
    pk = models.CompositePrimaryKey('profesional_id', 'servicio_id')
    profesional = models.ForeignKey('Profesionales', models.DO_NOTHING)
    servicio = models.ForeignKey('Servicios', models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'profesional_servicios'


class Profesionales(models.Model):
    id = models.BigAutoField(primary_key=True)
    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)
    nombres = models.CharField(max_length=120)
    apellidos = models.CharField(max_length=120)
    telefono = models.CharField(max_length=25, blank=True, null=True)
    foto_url = models.CharField(max_length=500, blank=True, null=True)
    comision_porcentaje = models.DecimalField(max_digits=5, decimal_places=2, db_default=0)
    visible_reservas = models.BooleanField(db_default=True)
    activa = models.BooleanField(db_default=True)
    creado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'profesionales'


class Proveedores(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(max_length=160)
    ruc = models.CharField(max_length=20, blank=True, null=True)
    telefono = models.CharField(max_length=25, blank=True, null=True)
    email = models.CharField(max_length=150, blank=True, null=True)
    activo = models.BooleanField(db_default=True)

    class Meta:
        managed = False
        db_table = 'proveedores'


class PuntosQr(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(max_length=100)
    token = models.UUIDField(unique=True, db_default=models.Func(function='gen_random_uuid'))
    activo = models.BooleanField(db_default=True)
    creado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'puntos_qr'


class RecetasServicio(models.Model):
    id = models.BigAutoField(primary_key=True)
    servicio = models.ForeignKey('Servicios', models.DO_NOTHING)
    articulo = models.ForeignKey(Articulos, models.DO_NOTHING)
    cantidad_estimada = models.DecimalField(max_digits=14, decimal_places=3)

    class Meta:
        managed = False
        db_table = 'recetas_servicio'
        unique_together = (('servicio', 'articulo'),)


class Servicios(models.Model):
    id = models.BigAutoField(primary_key=True)
    categoria = models.ForeignKey(CategoriasServicio, models.DO_NOTHING, blank=True, null=True)
    nombre = models.CharField(unique=True, max_length=150)
    slug = models.CharField(unique=True, max_length=160, blank=True, null=True)
    descripcion = models.TextField(blank=True, null=True)
    duracion_minutos = models.IntegerField(blank=True, null=True)
    precio_base = models.DecimalField(max_digits=12, decimal_places=2)
    visible_catalogo = models.BooleanField(db_default=True)
    reservable_online = models.BooleanField(db_default=False)
    requiere_anticipo = models.BooleanField(db_default=False)
    orden = models.IntegerField(db_default=0)
    activo = models.BooleanField(db_default=True)
    creado_en = models.DateTimeField(db_default=TransactionNow())
    actualizado_en = models.DateTimeField(db_default=TransactionNow())

    class Meta:
        managed = False
        db_table = 'servicios'


class UnidadesMedida(models.Model):
    id = models.BigAutoField(primary_key=True)
    codigo = models.CharField(unique=True, max_length=15)
    nombre = models.CharField(max_length=60)

    class Meta:
        managed = False
        db_table = 'unidades_medida'


class Ventas(models.Model):
    id = models.BigAutoField(primary_key=True)
    visita = models.OneToOneField('Visitas', models.DO_NOTHING, blank=True, null=True)
    clienta = models.ForeignKey(Clientas, models.DO_NOTHING, blank=True, null=True)
    estado = models.CharField(max_length=12, db_default='BORRADOR')
    creada_en = models.DateTimeField(db_default=TransactionNow())
    confirmada_en = models.DateTimeField(blank=True, null=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    descuento_global = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    propina = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, db_default=0)
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'ventas'


class Visitas(models.Model):
    id = models.BigAutoField(primary_key=True)
    clienta = models.ForeignKey(Clientas, models.DO_NOTHING)
    llegada = models.OneToOneField(Llegadas, models.DO_NOTHING, blank=True, null=True)
    inicio_en = models.DateTimeField(db_default=TransactionNow())
    fin_en = models.DateTimeField(blank=True, null=True)
    estado = models.CharField(max_length=12, db_default='ABIERTA')
    notas = models.TextField(blank=True, null=True)
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'visitas'


# Existing SQL views; imported so Django registers their canonical mappings.
from .catalogo_views import VwCatalogoServicios, VwCatalogoArticulos, VwStockActual  # noqa: E402,F401
