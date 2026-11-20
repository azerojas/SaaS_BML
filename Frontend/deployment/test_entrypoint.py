import unittest
from pathlib import Path
from entrypoint import render


class NginxConfigurationTests(unittest.TestCase):
    def test_release_gate_refuses_default_no_go_even_with_a_matching_approval(self):
        import os
        import subprocess
        import sys
        sha='1'*40
        env={key:value for key,value in os.environ.items() if key!='BEAUTY_RELEASE_ATTESTATION'}
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('release_gate.py')),'--sha',sha,'--approval','APPROVE_PRODUCTION_'+sha],env=env,capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('NO-GO',result.stderr)
    def test_rejects_injected_origins_ports_and_image_sources(self):
        for value in ('http://backend; include /etc/passwd;', 'http://user:pass@backend', 'http://backend/api/', 'https://backend?secret=x', ''):
            with self.subTest(value=value), self.assertRaises(ValueError):
                render('template', {'DJANGO_UPSTREAM':value})
        for value in ('80','0','65536'):
            with self.assertRaises(ValueError):
                render('template',{'DJANGO_UPSTREAM':'http://backend:8000','PORT':value})
        with self.assertRaises(ValueError):
            render('template',{'DJANGO_UPSTREAM':'http://backend:8000','CATALOG_IMAGE_SOURCES':'https://image; invalid'})

    def test_valid_same_origin_proxy_renders_without_header_inheritance_gaps(self):
        template=Path(__file__).with_name('nginx.conf.template').read_text()
        result=render(template,{'DJANGO_UPSTREAM':'http://backend.railway.internal:8000','PORT':'8080','CATALOG_IMAGE_SOURCES':'https://images.example.test'})
        self.assertNotIn('__',result)
        self.assertIn('proxy_pass http://backend.railway.internal:8000;',result)
        self.assertIn('proxy_hide_header Cache-Control',result)
        self.assertIn('location = /ngsw-worker.js',result)
        self.assertEqual(result.count('add_header Cache-Control'),1)
