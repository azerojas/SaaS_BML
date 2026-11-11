import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
import environ

ROOT=Path(__file__).resolve().parents[1]


def canonical_sql(value):
    if not isinstance(value,str):return value
    # PostgreSQL may reparse a varchar[] -> text[] cast as identical per-element casts on restore.
    # Normalize ONLY arrays of constant varchar literals; don't strip arbitrary casts/parentheses.
    literal=r"'(?:[^']|'')*'::character varying"
    pattern=re.compile(r'\(ARRAY\[((?:'+literal+r')(?:,\s*'+literal+r')*)\]\)::text\[\]')
    def expand(match):
        items=re.findall(literal,match.group(1))
        return 'ARRAY['+', '.join('('+item+')::text' for item in items)+']'
    return pattern.sub(expand,value)


def connection_config():
    env=environ.Env()
    if os.environ.get('DJANGO_ENV','development')=='development':
        from config.environment import development_env
        environ.Env.read_env(development_env(ROOT))
    if os.environ.get('DATABASE_URL'):
        db=env.db('DATABASE_URL')
        return {'dbname':db['NAME'],'user':db['USER'],'password':db['PASSWORD'],'host':db['HOST'],'port':db['PORT'],
                'sslmode':os.environ.get('DB_SSLMODE','verify-full'),'connect_timeout':5}
    return {'dbname':env('DB_NAME'),'user':env('DB_USER'),'password':env('DB_PASSWORD'),
            'host':env('DB_HOST',default='127.0.0.1'),'port':env.int('DB_PORT',default=5432),'connect_timeout':5}


def pg_tool(name):
    folder=Path(os.environ.get('PG_BIN',r'C:\Program Files\PostgreSQL\18\bin' if os.name=='nt' else '/usr/lib/postgresql/18/bin'))
    return str(folder/(name+('.exe' if os.name=='nt' else '')))


def pg_args(db):return ['-h',db['host'],'-p',str(db['port']),'-U',db['user'],'-d',db['dbname']]


def pg_environment(db):
    result={**os.environ,'PGPASSWORD':db['password']}
    if db.get('sslmode'):result['PGSSLMODE']=db['sslmode']
    return result


def fingerprint(conn,details=None):
    result={}
    queries={
        'columns':"SELECT table_name,column_name,data_type,is_nullable,column_default,is_identity FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,ordinal_position",
        'constraints':"SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2",
        'indexes':"SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2",
        'views':"SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY 1",
        'functions':"SELECT proname,pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'fn_%' ORDER BY proname",
        'triggers':"SELECT tgrelid::regclass::text,tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY 1,2",
    }
    for name,query in queries.items():
        rows=sorted(conn.execute(query).fetchall(),key=lambda row:json.dumps(row,default=str))
        if details is not None:details[name]=rows
        normalized=[[canonical_sql(value) for value in row] for row in rows]
        result[name]=hashlib.sha256(json.dumps(normalized,default=str).encode()).hexdigest()
    tables=conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1").fetchall()
    from psycopg import sql
    result['rows']={}
    for (table,) in tables:
        query=sql.SQL("SELECT count(*),md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) FROM {} t").format(sql.Identifier(table))
        result['rows'][table]=list(conn.execute(query).fetchone())
    return result
