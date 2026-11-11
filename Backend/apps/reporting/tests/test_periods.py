from datetime import date, datetime, timezone
from decimal import Decimal
from django.test import SimpleTestCase
from apps.reporting.domain.errors import ReportError
from apps.reporting.domain.periods import ReportFilter,preset_period,bucket,buckets,birthday_in_year
from apps.reporting.domain.metrics import percentage_change
from apps.reporting.presentation.serializers import parse_filters
from django.http import QueryDict
from rest_framework.exceptions import ValidationError


class PeriodTests(SimpleTestCase):
    def test_lima_boundaries_week_and_leap_month(self):
        filters=ReportFilter(date(2024,2,1),date(2024,3,1))
        self.assertEqual(len(list(buckets(filters))),29)
        self.assertEqual(filters.start.utcoffset().total_seconds(),-18000)
        self.assertEqual(preset_period('week',date(2026,11,6)),(date(2026,11,2),date(2026,11,9)))
        self.assertEqual(bucket(datetime(2026,11,1,4,59,tzinfo=timezone.utc),'month'),date(2026,10,1))
        self.assertEqual(birthday_in_year(date(2000,2,29),2025),date(2025,2,28))

    def test_ranges_limits_exclusive_and_partial_buckets(self):
        for start,end in [(date(2026,1,1),date(2026,1,1)),(date(2026,2,1),date(2026,1,1)),(date(2020,1,1),date(2026,1,1))]:
            with self.assertRaises(ReportError):ReportFilter(start,end)
        filters=ReportFilter(date(2026,10,2),date(2026,10,5),'week')
        self.assertEqual(list(buckets(filters)),[(date(2026,9,28),date(2026,10,2),date(2026,10,5))])

    def test_strict_query_contract(self):
        for value in ['desde=20261001&hasta=2026-11-01','desde=2026-10-01','timezone=UTC','orden=importe',
                      'desde=2026-10-01&hasta=2026-11-01&periodo=month','desde=2026-10-01&desde=2026-10-02&hasta=2026-11-01','servicio_id=0']:
            with self.subTest(value=value),self.assertRaises((ReportError,ValidationError)):
                parse_filters(QueryDict(value),'overview')
        filters,_,_=parse_filters(QueryDict('periodo=month&fecha=2024-02-12'),'overview')
        self.assertEqual((filters.desde,filters.hasta),(date(2024,2,1),date(2024,3,1)))

    def test_percentage_zero_base_is_null_and_decimal(self):
        self.assertIsNone(percentage_change(Decimal('10'),Decimal('0')))
        self.assertEqual(percentage_change(Decimal('120'),Decimal('100')),Decimal('20.00'))
