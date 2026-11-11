"""Bounded operational thresholds; no request paths, identifiers or payloads in alerts."""
def evaluate(records):
    samples=[row for row in records if row.get('event')=='http_request' and isinstance(row.get('status'),int)]
    if len(samples)<20:return []
    findings=[]
    if sum(row['status']>=500 for row in samples)/len(samples)>.01:
        findings.append({'code':'HTTP_5XX_RATE_HIGH','severity':'high'})
    durations=sorted(row['duration_ms'] for row in samples if isinstance(row.get('duration_ms'),(int,float)))
    if durations and durations[min(len(durations)-1,int(len(durations)*.95))]>1000:
        findings.append({'code':'HTTP_P95_HIGH','severity':'high'})
    return findings
