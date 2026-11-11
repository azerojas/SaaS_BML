from django.test import SimpleTestCase
from apps.operaciones.domain.http_metrics import evaluate


class HTTPMetricTests(SimpleTestCase):
    def test_low_traffic_does_not_trigger_rate_alert(self):
        self.assertEqual(evaluate([{'event':'http_request','status':500,'duration_ms':2000}]),[])

    def test_fault_rate_and_latency_report_only_operational_codes(self):
        rows=[{'event':'http_request','status':500 if index==0 else 200,'duration_ms':1500,'private':'never included'} for index in range(20)]
        self.assertEqual(evaluate(rows),[{'code':'HTTP_5XX_RATE_HIGH','severity':'high'},{'code':'HTTP_P95_HIGH','severity':'high'}])

    def test_healthy_samples_and_other_events_are_ignored(self):
        self.assertEqual(evaluate([{'event':'http_request','status':200,'duration_ms':10} for _ in range(30)]+[{'event':'job_failure','status':500}]),[])
