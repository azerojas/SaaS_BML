from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import NotFound
from apps.finanzas.infrastructure.idempotency import canonical
from apps.reporting.domain.errors import ReportError
from apps.reporting.application import services
from apps.reporting.application.exports import export_report
from apps.reporting.infrastructure.snapshot import ensure_ready, read_snapshot
from apps.reporting.infrastructure.excel_export import REPORT_TITLES
from datetime import timedelta
from .permissions import ReportingPermission
from .serializers import parse_filters, parse_month


class ReportView(APIView):
    permission_classes=[ReportingPermission]
    http_method_names=['get','head','options']
    report=None

    def handle_exception(self, exc):
        if isinstance(exc,ReportError):
            return Response({'code':exc.code,'detail':exc.detail},status={'invalid':400,'limit':422,'unavailable':503,'rate':429}[exc.kind])
        return super().handle_exception(exc)

    def get(self, request):
        ensure_ready()
        if self.report=='month-comparison':
            month,today=parse_month(request.query_params)
            with read_snapshot(): data=services.month_comparison(month,today)
        else:
            filters,params,target=parse_filters(request.query_params,self.report,self.report=='export')
            if self.report=='export':
                content=export_report(target,filters,request.user,params['orden'],params['limit'])
                response=HttpResponse(content,content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                filename='Lasheo - '+REPORT_TITLES[target]+' - '+filters.desde.isoformat()+' al '+(filters.hasta-timedelta(days=1)).isoformat()+'.xlsx'
                response['Content-Disposition']='attachment; filename="'+filename+'"'
                response['Cache-Control']='private, no-store'
                response['X-Content-Type-Options']='nosniff'
                return response
            if self.report=='clients-retention':
                from django.utils import timezone
                from apps.reporting.domain.periods import ZONE
                with read_snapshot(): data=services.clients_retention(filters,timezone.localdate(timezone=ZONE))
            else:
                data=services.execute(self.report,filters,**({'ordering':params['orden']} if self.report in ('top-services','top-clients') else {}))
            if self.report in ('top-services','top-clients','inventory-alerts','expenses'):
                rows=data['results']
                total=len(rows)
                if self.report in ('top-services','top-clients'): rows=rows[:params['limit']]
                count=len(rows)
                start=(params['page']-1)*params['page_size']
                if start>=count and params['page']!=1: raise NotFound('Pagina inexistente.')
                def link(page):
                    query=request.query_params.copy()
                    query['page']=str(page)
                    return request.build_absolute_uri(request.path+'?'+query.urlencode())
                data.update({'total_grupos':total,'count':count,'next':link(params['page']+1) if start+params['page_size']<count else None,
                             'previous':link(params['page']-1) if params['page']>1 else None,'results':rows[start:start+params['page_size']]})
        return Response(canonical(data))
