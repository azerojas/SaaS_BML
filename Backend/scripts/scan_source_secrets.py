"""Bounded high-confidence source scan; never prints matched credential text."""
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from deployment.build_local import allowed

PATTERNS=[r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'\bAKIA[A-Z0-9]{16}\b',
          r'\bgh[pousr]_[A-Za-z0-9]{30,}\b',r'postgres(?:ql)?://[A-Za-z0-9_-]+:(?!REPLACE|CHANGE|synthetic@)[A-Za-z0-9!%._~+-]{8,}@']
findings=[]
for path in ROOT.rglob('*'):
    if not path.is_file() or not allowed(path) or path.suffix not in ('.py','.json','.toml','.yml','.yaml','.example'):continue
    if path.name=='scan_source_secrets.py':continue
    for number,line in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
        if any(re.search(pattern,line) for pattern in PATTERNS):findings.append(f'{path.relative_to(ROOT)}:{number}')
if findings:
    print('Potential source credentials (values redacted):\n'+'\n'.join(findings))
    raise SystemExit(1)
print('High-confidence source credential scan: no findings. Local ignored secrets were not scanned or printed.')
