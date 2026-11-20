"""A prepared workflow is not production authorization. Fail closed until signed-off evidence exists."""
import argparse
import json
import os
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--approval',required=True)
parser.add_argument('--sha',required=True)
args=parser.parse_args()
evidence=json.loads(os.environ.get('BEAUTY_RELEASE_ATTESTATION') or (Path(__file__).parents[1]/'docs/phase7-release.json').read_text())
required=('staging_e2e_verified','container_verified','restore_verified','external_alert_verified','rollback_drill_verified','owner_approved')
if args.approval!='APPROVE_PRODUCTION_'+args.sha or evidence.get('production_decision')!='GO' or evidence.get('verified_commit')!=args.sha or not all(evidence.get(key) is True for key in required):
    raise SystemExit('NO-GO: exact commit approval and verified release evidence required. No deployment executed.')
