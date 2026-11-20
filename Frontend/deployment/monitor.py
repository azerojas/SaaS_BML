"""Read-only HTTPS monitoring. No customer or financial endpoints; never logs response bodies."""
import argparse
import json
import ssl
import time
from urllib.parse import urlsplit
from urllib.request import urlopen, Request

parser=argparse.ArgumentParser()
parser.add_argument('origin')
args=parser.parse_args()
origin=urlsplit(args.origin)
if origin.scheme!='https' or not origin.hostname or origin.username or origin.password or origin.query or origin.fragment or origin.path not in ('','/'):
    raise SystemExit('Provide an exact public HTTPS origin without credentials.')
checks=[]
for path in ('/health','/health/ready'):
    started=time.monotonic()
    try:
        with urlopen(Request(args.origin.rstrip('/')+path,headers={'User-Agent':'BeautyManager-Availability/1'}),timeout=10,context=ssl.create_default_context()) as response:
            healthy=response.status==200 and response.headers.get('Cache-Control','').find('no-store')>=0
    except Exception:
        healthy=False
    checks.append({'path':path,'healthy':healthy,'milliseconds':round((time.monotonic()-started)*1000)})
print(json.dumps({'healthy':all(item['healthy'] for item in checks),'checks':checks}))
raise SystemExit(0 if all(item['healthy'] for item in checks) else 1)
