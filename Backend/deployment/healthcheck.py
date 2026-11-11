import os
import sys
from urllib.request import Request,urlopen
from urllib.error import URLError

try:
    request=Request('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health/ready',headers={'Host':os.environ.get('HEALTHCHECK_HOST','localhost')})
    with urlopen(request,timeout=2) as response:ok=response.status==200
except (URLError,TimeoutError,OSError):ok=False
sys.exit(0 if ok else 1)
