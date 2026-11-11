from django.urls import path
from .views import ReportView

urlpatterns=[path('analytics/'+report+'/',ReportView.as_view(report=report),name='analytics-'+report)
             for report in ('overview','revenue-series','payment-methods','top-services','top-clients','inventory-alerts','expenses','month-comparison')]
urlpatterns += [path('analytics/clients/retention/',ReportView.as_view(report='clients-retention'),name='analytics-clients-retention'),
                path('reports/export.xlsx',ReportView.as_view(report='export'),name='reports-export')]
