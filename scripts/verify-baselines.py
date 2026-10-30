# Author: yunnuo <ymz@ebox.vip>
# Description: Isolated, explicit-target new-baseline verification with owned-resource cleanup.
import argparse, datetime, json, os, pathlib, secrets, shutil, subprocess, sys, tempfile, time

root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Verify new baselines using fresh, disposable local databases only')
parser.add_argument('--output',required=True)
options=parser.parse_args()
output=pathlib.Path(options.output).resolve()
assert not output.exists(), 'Evidence destination exists; do not overwrite prior work'
output.mkdir(parents=True)
run_id=secrets.token_hex(4)
pg_name='unicore-r10b-pg-'+run_id
mysql_name='unicore-r10b-mysql-'+run_id
environment={k:v for k,v in os.environ.items() if not k.startswith(('APP_','UNICORE_','PG','MYSQL','DB_')) and k!='DATABASE_URL'}
environment.pop('DOCKER_HOST',None)
environment.pop('DOCKER_CONTEXT',None)
endpoint=subprocess.run(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}'],env=environment,text=True,capture_output=True,check=True).stdout.strip()
assert endpoint.startswith('unix://'), 'Only a local Unix-socket Docker context is permitted'
environment['DOCKER_HOST']=endpoint
environment['GOTOOLCHAIN']='local'
scratch=pathlib.Path(tempfile.mkdtemp(prefix='unicore-r10b-',dir=str(pathlib.Path(tempfile.gettempdir()).resolve())))
created=[]
record={'author':'yunnuo <ymz@ebox.vip>','generated_evidence':True,'run_id':run_id,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inherited_application_database_environment_removed':True,'container_network':'bridge; published ports bound only to 127.0.0.1','containers':[]}
def command(args,check=True):
    result=subprocess.run(args,cwd=root,env=environment,text=True,capture_output=True)
    if check and result.returncode:raise RuntimeError(str(args[:3])+': '+result.stderr)
    return result
def save(name,value):
    (output/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def envfile(name,values):
    path=scratch/name;path.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));path.chmod(0o600);return path
try:
    command(['go','build','-o',str(scratch/'verifier'),'./scripts/verify-baselines'])
    for name,image,mount,values,port,ready in [
        (pg_name,'postgres:15','/var/lib/postgresql/data',{'POSTGRES_PASSWORD':secrets.token_hex(24)},5432,['pg_isready','-U','postgres','-q']),
        (mysql_name,'mysql:8.0','/var/lib/mysql',{'MYSQL_ROOT_PASSWORD':secrets.token_hex(24),'MYSQL_ROOT_HOST':'%'},3306,['bash','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping --protocol=socket -uroot --silent'])
    ]:
        file=envfile(name+'.env',values)
        size='512m' if port==5432 else '1024m'
        result=command(['docker','run','--pull=never','--rm','-d','--name',name,'--label','unicore.audit=r1.0b','--label','unicore.audit.run='+run_id,'--env-file',str(file),'--tmpfs',mount+':rw,nosuid,nodev,size='+size,'-p','127.0.0.1::'+str(port),image])
        created.append(name)
        detail=json.loads(command(['docker','inspect',name]).stdout)[0]
        mapped=detail['NetworkSettings']['Ports'][str(port)+'/tcp'][0]
        assert mapped['HostIp']=='127.0.0.1'
        assert not any(item['Type']=='volume' for item in detail['Mounts'])
        metadata={'name':name,'image':image,'image_id':detail['Image'],'published_address':mapped,'tmpfs':detail['HostConfig']['Tmpfs'],'persistent_volumes':[]}
        record['containers'].append(metadata)
        if port==5432:pg_dsn='postgres://postgres:'+values['POSTGRES_PASSWORD']+'@127.0.0.1:'+mapped['HostPort']+'/postgres?sslmode=disable&connect_timeout=5'
        else:mysql_dsn='root:'+values['MYSQL_ROOT_PASSWORD']+'@tcp(127.0.0.1:'+mapped['HostPort']+')/mysql?charset=utf8mb4&parseTime=true'
        deadline=time.monotonic()+60
        while command(['docker','exec',name,*ready],False).returncode:
            if time.monotonic()>deadline:raise RuntimeError('new temporary container did not become ready: '+name)
            time.sleep(1)
        print('READY',name,image,flush=True)
    config=scratch/'config.json'
    config.write_text(json.dumps({'Temp':str(scratch),'Output':str(output),'PG':pg_dsn,'MySQL':mysql_dsn,'Commit':command(['git','rev-parse','HEAD']).stdout.strip(),'Root':str(root)}));config.chmod(0o600)
    result=command([str(scratch/'verifier'),str(config)],False)
    (output/'execution.log.txt').write_text(result.stdout+result.stderr)
    print(result.stdout,flush=True)
    assert result.returncode==0,'audit harness failed; see execution.log.txt'
    for profile,database in [('web-platform','r10b_platform'),('web-standalone','r10b_standalone')]:
        pg=command(['docker','exec',pg_name,'pg_dump','-U','postgres','--schema-only','--no-owner','--no-privileges','--schema=public','--dbname',database]).stdout
        (output/('postgres-'+profile+'.schema.sql')).write_text('-- Author: yunnuo <ymz@ebox.vip>\n-- Generated new-baseline observed schema evidence; not a migration definition.\n'+pg)
        mysql=command(['docker','exec',mysql_name,'bash','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump --no-data --no-tablespaces --skip-comments -uroot '+database]).stdout
        (output/('mysql-'+profile+'.schema.sql')).write_text('-- Author: yunnuo <ymz@ebox.vip>\n-- Generated new-baseline observed schema evidence; not a migration definition.\n'+mysql)
    for profile in ['web-platform','web-standalone','desktop']:
        data=json.loads((output/('sqlite-'+profile+'.json')).read_text())
        statements=[]
        for name,table in sorted(data['schema']['tables'].items()):
            statements.extend(row['sql']+';' for row in table['ddl'])
            for index in table['indexes']:
                statements.extend(row['sql']+';' for row in index['ddl'] if row['sql'])
        (output/('sqlite-'+profile+'.schema.sql')).write_text('-- Author: yunnuo <ymz@ebox.vip>\n-- Generated from observed sqlite_schema; not a migration definition.\n'+'\n\n'.join(statements)+'\n')
    result=command(['python3',str(root/'scripts/compare-baselines.py'),'--output',str(output)],False)
    (output/'comparison.log.txt').write_text(result.stdout+result.stderr)
    print(result.stdout,flush=True)
    assert result.returncode==0,'baseline equivalence comparison failed; see comparison.log.txt'
    record['execution_passed']=True
except Exception as error:
    record['execution_passed']=False
    record['failure']=str(error)
    raise
finally:
    record['cleanup']=[]
    for name in reversed(created):
        detail=json.loads(command(['docker','inspect',name]).stdout)[0]
        assert detail['Config']['Labels'].get('unicore.audit.run')==run_id
        command(['docker','rm','-f',name])
        absent=command(['docker','inspect',name],False).returncode!=0
        record['cleanup'].append({'container':name,'removed':absent,'tmpfs_data_discarded':True,'persistent_volumes_created':False})
    shutil.rmtree(scratch)
    record['scratch_credentials_and_databases_removed']=not scratch.exists()
    record['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    save('isolation-and-cleanup.json',record)
    print('CLEANUP',json.dumps(record['cleanup']),flush=True)
