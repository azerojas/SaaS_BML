from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class ActualConsumption:
    detail_id: int
    article_id: int
    unit_id: int
    quantity: Decimal

