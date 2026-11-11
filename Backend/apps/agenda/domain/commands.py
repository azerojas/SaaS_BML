from dataclasses import dataclass
from datetime import datetime,date


@dataclass(frozen=True)
class BookingCommand:
    clienta_id:int
    profesional_id:int
    servicios:tuple[int,...]
    inicio_en:datetime
    notas:str|None=None
    origen:str='MANUAL'


@dataclass(frozen=True)
class AvailabilityQuery:
    profesional_id:int
    servicios:tuple[int,...]
    fecha:date
    public:bool=False
