import base64
import json
import os
from pathlib import Path
import tempfile
from django.test import SimpleTestCase
from cryptography.exceptions import InvalidTag
from apps.operaciones.infrastructure.backup_crypto import parse_key,encrypt,decrypt


class BackupTests(SimpleTestCase):
    def test_streaming_roundtrip_tamper_and_wrong_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            source=root/'source'
            source.write_bytes(os.urandom(1024*1024+15))
            target=root/'backup.enc'
            key=os.urandom(32)
            encrypt(source,target,key)
            restored=root/'restored'
            decrypt(target,restored,key)
            self.assertEqual(source.read_bytes(),restored.read_bytes())
            with self.assertRaises(InvalidTag):decrypt(target,root/'wrong',os.urandom(32))
            self.assertFalse((root/'wrong').exists())
            modified=bytearray(target.read_bytes())
            modified[40]^=1
            target.write_bytes(modified)
            with self.assertRaises(InvalidTag):decrypt(target,root/'tamper',key)
            self.assertFalse((root/'tamper').exists())

    def test_key_and_archive_format_rejections(self):
        with self.assertRaises(ValueError):parse_key(base64.urlsafe_b64encode(b'short').decode())
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            (root/'bad').write_bytes(b'bad')
            with self.assertRaises(ValueError):decrypt(root/'bad',root/'out',os.urandom(32))

    def test_only_equivalent_pg_array_casts_are_normalized(self):
        from scripts.backup_common import canonical_sql
        before="CHECK (estado = ANY ((ARRAY['A'::character varying, 'B'::character varying])::text[]))"
        after="CHECK (estado = ANY (ARRAY[('A'::character varying)::text, ('B'::character varying)::text]))"
        self.assertEqual(canonical_sql(before),canonical_sql(after))
        self.assertNotEqual(canonical_sql(before),canonical_sql(after.replace("'B'","'C'")))
        self.assertEqual(canonical_sql('monto::numeric(12,2) > 0'),'monto::numeric(12,2) > 0')
