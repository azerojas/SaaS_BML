"""Render only validated values. No credentials, migrations or shell interpolation."""
import os
from pathlib import Path
from urllib.parse import urlsplit


def render(template, environ):
    port=int(environ.get('PORT', '8080'))
    if not 1024 <= port <= 65535:
        raise ValueError('PORT must be an unprivileged TCP port.')
    backend=environ.get('DJANGO_UPSTREAM', '')
    parsed=urlsplit(backend)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment:
        raise ValueError('Set DJANGO_UPSTREAM to an internal origin without credentials or path.')
    import re
    if not re.fullmatch(r'https?://[A-Za-z0-9.-]+(?::[0-9]{1,5})?/?',backend):
        raise ValueError('Invalid upstream origin.')
    sources=[]
    for source in environ.get('CATALOG_IMAGE_SOURCES','').split():
        url=urlsplit(source)
        if url.scheme!='https' or not url.hostname or url.username or url.password or url.path not in ('','/') or url.query or url.fragment or not re.fullmatch(r'https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?/?',source):
            raise ValueError('Image sources must be exact HTTPS origins.')
        sources.append(source.rstrip('/'))
    if len(sources)>20:
        raise ValueError('Too many image sources.')
    return template.replace('__PORT__',str(port)).replace('__DJANGO_UPSTREAM__',backend.rstrip('/')).replace('__CATALOG_IMAGE_SOURCES__',' '.join(sources))


if __name__=='__main__':
    target=Path('/tmp/nginx/nginx.conf')
    if not Path('/srv/frontend/index.html').is_file():
        raise SystemExit('Missing compiled Angular shell.')
    target.write_text(render(Path('/etc/nginx/nginx.conf.template').read_text(),os.environ))
    os.execvp('nginx',['nginx','-c',str(target),'-g','daemon off;'])
