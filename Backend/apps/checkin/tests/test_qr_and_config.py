import struct
import uuid
import zlib
from datetime import datetime, timedelta, timezone
import zxingcpp
from django.test import SimpleTestCase, override_settings
from apps.checkin.infrastructure.qr_renderer import render_qr
from apps.checkin.checks import checkin_deployment_checks


class QRTests(SimpleTestCase):
    def test_pure_pending_policy_at_expiration_boundary(self):
        from apps.checkin.domain.rules import pending_is_current
        boundary=datetime(2026,11,6,12,tzinfo=timezone.utc)
        self.assertTrue(pending_is_current('PENDIENTE',boundary,boundary))
        self.assertFalse(pending_is_current('PENDIENTE',boundary-timedelta(seconds=1),boundary))
        self.assertFalse(pending_is_current('CONFIRMADA',boundary,boundary))

    @override_settings(PUBLIC_CHECKIN_URL='https://app.example.com/checkin/',CHECKIN_DEMO_MODE=False)
    def test_generated_png_is_decoded_by_independent_scanner(self):
        token=uuid.uuid4()
        data=render_qr(token,'png')
        position=8
        compressed=b''
        while position<len(data):
            length=struct.unpack('>I',data[position:position+4])[0]
            kind=data[position+4:position+8]
            chunk=data[position+8:position+8+length]
            if kind==b'IHDR':
                width,height,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',chunk)
            elif kind==b'IDAT':compressed+=chunk
            position+=length+12
        self.assertEqual((depth,color,interlace),(1,0,0))
        filtered=zlib.decompress(compressed)
        stride=(width+7)//8
        raw=bytearray()
        previous=bytearray(stride)
        for y in range(height):
            row=filtered[y*(stride+1):(y+1)*(stride+1)]
            restored=bytearray(stride)
            for x,value in enumerate(row[1:]):
                left=restored[x-1] if x else 0
                above=previous[x]
                upper_left=previous[x-1] if x else 0
                p=left+above-upper_left
                pa,pb,pc=abs(p-left),abs(p-above),abs(p-upper_left)
                paeth=left if pa<=pb and pa<=pc else above if pb<=pc else upper_left
                predictors=[0,left,above,(left+above)//2,paeth]
                restored[x]=(value+predictors[row[0]])&255
            raw.extend(255 if restored[x//8] & (1<<(7-x%8)) else 0 for x in range(width))
            previous=restored
        decoded=zxingcpp.read_barcode(memoryview(raw).cast('B',shape=[height,width]))
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded.text,'https://app.example.com/checkin/'+str(token)+'/')
        self.assertNotIn('telefono',decoded.text)

    @override_settings(CHECKIN_DEMO_MODE=True)
    def test_deployment_detects_demo_notice(self):
        self.assertIn('checkin.E001',[error.id for error in checkin_deployment_checks(None)])

    @override_settings(CHECKIN_DEMO_MODE=False,PUBLIC_CHECKIN_URL='https://app.example.com/checkin/',
        CHECKIN_PRIVACY_NOTICE_URL='https://app.example.com/privacy/',CHECKIN_PRIVACY_NOTICE_VERSION='v1')
    def test_production_configuration_shape_passes(self):
        self.assertEqual(checkin_deployment_checks(None),[])

