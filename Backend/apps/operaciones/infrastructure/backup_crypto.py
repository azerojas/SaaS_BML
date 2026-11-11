"""Streaming AES-256-GCM envelope. Key is external; plaintext is never an upload artifact."""
import base64
import os
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes

MAGIC=b'BMBAK001'
CHUNK=1024*1024


def parse_key(value:str)->bytes:
    key=base64.b64decode(value.encode(),altchars=b'-_',validate=True)
    if len(key)!=32:raise ValueError('Se requiere clave de256 bits.')
    return key


def encrypt(source:Path,target:Path,key:bytes)->None:
    nonce=os.urandom(12)
    header=MAGIC+nonce
    encryptor=Cipher(algorithms.AES(key),modes.GCM(nonce)).encryptor()
    encryptor.authenticate_additional_data(header)
    descriptor=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with source.open('rb') as incoming,os.fdopen(descriptor,'wb') as outgoing:
        outgoing.write(header)
        while data:=incoming.read(CHUNK):outgoing.write(encryptor.update(data))
        outgoing.write(encryptor.finalize())
        outgoing.write(encryptor.tag)


def decrypt(source:Path,target:Path,key:bytes)->None:
    size=source.stat().st_size
    if size<len(MAGIC)+12+16:raise ValueError('Archivo cifrado incompleto.')
    with source.open('rb') as incoming:
        header=incoming.read(len(MAGIC)+12)
        if not header.startswith(MAGIC):raise ValueError('Formato de respaldo desconocido.')
        incoming.seek(-16,2)
        tag=incoming.read(16)
        incoming.seek(len(header))
        decryptor=Cipher(algorithms.AES(key),modes.GCM(header[len(MAGIC):],tag)).decryptor()
        decryptor.authenticate_additional_data(header)
        remaining=size-len(header)-16
        descriptor=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        try:
            with os.fdopen(descriptor,'wb') as outgoing:
                while remaining:
                    data=incoming.read(min(CHUNK,remaining))
                    if not data:raise ValueError('Archivo truncado.')
                    remaining-=len(data)
                    outgoing.write(decryptor.update(data))
                outgoing.write(decryptor.finalize())
        except Exception:
            target.unlink(missing_ok=True)
            raise
