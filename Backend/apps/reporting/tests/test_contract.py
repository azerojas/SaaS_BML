import json
from django.conf import settings
from django.http import QueryDict
from django.test import SimpleTestCase
from django.urls import resolve
from apps.reporting.presentation.serializers import parse_filters,parse_month,FILTERS


class ContractTests(SimpleTestCase):
    def test_examples_match_query_validators(self):
        examples=json.loads((settings.BASE_DIR/'apps/reporting/examples/api-examples.json').read_text(encoding='utf-8'))
        for report,query in examples['queries'].items():
            with self.subTest(report=report):parse_filters(QueryDict(query),report)
        parse_month(QueryDict(examples['month_comparison']))
        parse_filters(QueryDict(examples['excel']),'export',True)

    def test_openapi_reports_match_routes_security_and_filters(self):
        doc=json.loads((settings.BASE_DIR/'docs/openapi.json').read_text(encoding='utf-8'))
        paths={path:spec for path,spec in doc['paths'].items() if path.startswith(('/api/v1/analytics/','/api/v1/reports/'))}
        self.assertEqual(len(paths),10)
        for path,spec in paths.items():
            self.assertEqual(set(spec),{'get'})
            match=resolve(path)
            self.assertNotEqual(spec['get'].get('security'),[])
            for status in ['400','403','422','503']:self.assertIn(status,spec['get']['responses'])
            report=match.func.view_initkwargs['report']
            if report in FILTERS:
                parameters={param['name'] for param in spec['get']['parameters']}
                self.assertEqual(parameters,{'desde','hasta','periodo','fecha','granularidad','timezone'}|FILTERS[report])
