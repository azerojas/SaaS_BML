from datetime import datetime,timedelta
from typing import Any


def stale_jobs(rows:dict[str,dict[str,Any]],now:datetime)->list[dict[str,str]]:
    findings=[]
    for name,minutes in [('maintenance',15),('backup',60)]:
        row=rows.get(name,{})
        last=row.get('last_success_at')
        if not isinstance(last,datetime) or now-last>timedelta(minutes=minutes):
            findings.append({'code':'JOB_STALE','job':name,'severity':'high'})
        if row.get('status')=='FAILED':findings.append({'code':'JOB_FAILED','job':name,'severity':'high'})
    return findings
