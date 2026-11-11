"""Keep the scanner cache local; preserve unfiltered HIGH/CRITICAL results, including unfixed."""
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
SCANNER='aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb'
subprocess.run(['docker','volume','create','--label','beauty.phase8.synthetic=true','beauty-phase8-trivy-cache'],check=True,stdout=subprocess.DEVNULL)
summary=[]
for name,tag in [('web','beauty-manager:phase8-local'),('backup','beauty-manager-backup:phase8-local'),
    ('proxy','nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311')]:
    output=ROOT/f'backups/phase8-trivy-{name}.json'
    with output.open('wb') as report,(ROOT/f'backups/phase8-trivy-{name}.log').open('wb') as log:
        result=subprocess.run(['docker','run','--rm','-v','/var/run/docker.sock:/var/run/docker.sock','-v','beauty-phase8-trivy-cache:/root/.cache/',SCANNER,
            'image','--no-progress','--scanners','vuln','--severity','HIGH,CRITICAL','--format','json',tag],stdout=report,stderr=log)
    if result.returncode:raise SystemExit(result.returncode)
    data=json.loads(output.read_text(encoding='utf-8'))
    vulnerabilities=[v for target in data.get('Results',[]) for v in target.get('Vulnerabilities',[])]
    summary.append({'image':tag,'high_critical_package_findings':len(vulnerabilities),
        'unique_cves':len({v['VulnerabilityID'] for v in vulnerabilities}),
        'with_fix':sum(bool(v.get('FixedVersion')) for v in vulnerabilities)})
(ROOT/'backups/phase8-image-security-summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary))
if any(row['high_critical_package_findings'] for row in summary):raise SystemExit(1)
