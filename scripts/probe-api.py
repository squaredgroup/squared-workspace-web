"""Read-only production checks: health, CORS OPTIONS and WebAuthn metadata.
No password, session, database write, or secret is used.
"""
import concurrent.futures
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

API='https://workspace.squaredgroup.studio'
WEB='https://workspace.app.squaredgroup.studio'
JOBS=[
 ('health','GET','/health',WEB,None,None),
 ('login-preflight','OPTIONS','/v1/auth/password',WEB,'POST','content-type,x-workspace-client'),
 ('read-preflight','OPTIONS','/v1/me',WEB,'GET','authorization,x-workspace-client'),
 ('write-preflight','OPTIONS','/v1/projects',WEB,'PATCH','authorization,content-type,if-match,x-workspace-client'),
 ('untrusted-origin','OPTIONS','/v1/auth/password','https://untrusted.example.invalid','POST','content-type'),
 ('passkey-related-origin','GET','/.well-known/webauthn',None,None,None)
]

def check(job):
 name,method,path,origin,wanted_method,wanted_headers=job
 headers={'Accept':'application/json','User-Agent':'Squared-Workspace-Browser-Check'}
 if origin:headers['Origin']=origin
 if wanted_method:headers['Access-Control-Request-Method']=wanted_method
 if wanted_headers:headers['Access-Control-Request-Headers']=wanted_headers
 try:
  request=urllib.request.Request(API+path,method=method,headers=headers)
  try:response=urllib.request.urlopen(request,timeout=12)
  except urllib.error.HTTPError as error:response=error
  with response:
   status=response.status
   allow=response.headers.get('Access-Control-Allow-Origin','')
   methods=[v.strip().upper() for v in response.headers.get('Access-Control-Allow-Methods','').split(',')]
   allowed_headers=[v.strip().lower() for v in response.headers.get('Access-Control-Allow-Headers','').split(',')]
   if name=='untrusted-origin':ok=not allow
   elif name=='passkey-related-origin':
    try:ok=status==200 and WEB in json.loads(response.read(8192)).get('origins',[])
    except (ValueError,TypeError):ok=False
   elif method=='OPTIONS':ok=200<=status<300 and allow==WEB and wanted_method in methods and all(h in allowed_headers for h in wanted_headers.split(','))
   else:ok=status==200 and allow==WEB
   return {'check':name,'status':status,'ok':ok,'allowOrigin':allow,'allowMethods':methods,'allowHeaders':allowed_headers}
 except Exception as error:return {'check':name,'ok':False,'errorType':type(error).__name__}

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(check,JOBS))
Path('backend-probe.json').write_text(json.dumps(results,indent=2))
summary='## Accès navigateur à l’API de production\n\nTest en lecture seule, sans identifiants.\n\n'
for result in results:
 print(json.dumps(result))
 summary+=f"- {result['check']} : {'OK' if result['ok'] else 'NON VALIDÉ'} (HTTP {result.get('status','injoignable')})\n"
if os.getenv('GITHUB_STEP_SUMMARY'):
 with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write(summary)
failed=[r['check'] for r in results if not r['ok']]
if failed:
 print('::error::La compatibilité navigateur de l’API de production reste à valider : '+', '.join(failed))
 raise SystemExit(1)
