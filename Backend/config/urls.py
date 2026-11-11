"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from apps.operaciones.presentation import views as operations
from apps.operaciones.presentation.auth_views import verify_mfa
from apps.catalogo.urls import admin_router, public_router

urlpatterns = [
    *([path('admin/', admin.site.urls)] if settings.ADMIN_ENABLED else []),
    path('health/live', operations.live, name='health-live'),
    path('health/ready', operations.ready, name='health-ready'),
    path('api/auth/mfa/verify/',verify_mfa,name='mfa-verify'),
    path('api/v1/operations/status/',operations.status,name='operations-status'),
    path('api/auth/', include('apps.autenticacion.urls')),
    path('api/', include('apps.clientas.urls')),
    path('api/', include('apps.inventario.api.urls')),
    path('api/', include('apps.checkin.presentation.urls')),
    path('api/', include('apps.finanzas.presentation.urls')),
    path('api/v1/', include('apps.reporting.presentation.urls')),
    path('api/v1/', include('apps.agenda.presentation.urls')),
    path('api/admin/catalogo/', include(admin_router.urls)),
    path('api/catalogo/', include(public_router.urls)),
]
