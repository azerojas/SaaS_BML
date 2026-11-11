from rest_framework.permissions import BasePermission


class LegacyModelPermission(BasePermission):
    """Explicit model permissions replace the old trusted-staff-only policy."""
    def has_permission(self,request,view):
        user=request.user
        if not user or not user.is_authenticated or not user.is_active or not user.is_staff:return False
        module=type(view).__module__
        name=type(view).__name__
        if module.startswith('apps.clientas'):model='clientas'
        elif module.startswith('apps.catalogo') and getattr(view,'kind',None):
            from apps.catalogo.entities import ENTITIES
            model=ENTITIES[view.kind][0]._meta.model_name
        else:
            models={'ImagenViewSet':'imagenescatalogo','StockViewSet':'articulos','ProveedorViewSet':'proveedores',
                    'CompraViewSet':'compras','MovimientoViewSet':'movimientosinventario','AjusteViewSet':'movimientosinventario',
                    'AlertaViewSet':'articulos','CostoRecetaViewSet':'servicios','PuntoViewSet':'puntosqr','ArrivalViewSet':'llegadas'}
            model=models.get(name)
        if not model:return False
        if request.method in ('GET','HEAD','OPTIONS'):operation='view'
        elif getattr(view,'action',None)=='create':operation='add'
        elif request.method=='DELETE':operation='delete'
        else:operation='change'
        if not user.has_perm('negocio.'+operation+'_'+model):return False
        action=getattr(view,'action','')
        extras={
            'crear_visita':['finanzas.manage_visits'],
            'asociar_visita':['finanzas.manage_visits'],
            'enlazar_cita':['agenda.link_arrivals'],
        }
        if action in extras and not all(user.has_perm(perm) for perm in extras[action]):return False
        if action=='imagenes' and request.method=='POST':return user.has_perm('negocio.add_imagenescatalogo')
        return True
