import json
import logging
from datetime import datetime,timezone


class SafeJSONFormatter(logging.Formatter):
    """Allowlisted structure: no raw message, path, query, body, headers or exception text."""
    def format(self,record):
        result={'timestamp':datetime.now(timezone.utc).isoformat(),'level':record.levelname,
                'logger':record.name,'event':getattr(record,'event','application_event')}
        for key in ('request_id','route','method','status','duration_ms','job','error_type'):
            if hasattr(record,key):result[key]=getattr(record,key)
        if record.exc_info:result['error_type']=record.exc_info[0].__name__
        return json.dumps(result,ensure_ascii=True,separators=(',',':'))
