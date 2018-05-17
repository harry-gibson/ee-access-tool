from oauth2client.service_account import ServiceAccountCredentials
from httplib2 import Http
from apiclient.discovery import build
from apiclient.http import MediaFileUpload
from apiclient import errors

DELETE_FILES = True
UPLOAD_A_FILE = False
SCOPES = ['https://www.googleapis.com/auth/drive']
KEY_PATH='access-mapper-77c3c2dfef55.json'
#KEY_PATH='/media/sf_Code_General/ee-access-tool/access-mapper-77c3c2dfef55.json'
credentials=ServiceAccountCredentials.from_json_keyfile_name(KEY_PATH, SCOPES)

http_authorised=credentials.authorize(Http())
svc=build('drive','v2',http=http_authorised)

# now use it

# try to see what items are stored
results=svc.files().list(maxResults=10000).execute()
items=results.get('items',[])
for item in items:
	fileid = item.get('id')
	filetitle = item.get('title')
	if not DELETE_FILES:
		print("Not actually deleting %s... (id is %s)" % (filetitle, fileid))
		continue
	print("Deleting %s..." % filetitle)
	try:
		svc.files().delete(fileId=fileid).execute()
		print("done")
	except Exception as error:
		print('An error occurred: %s' % error)

# try to upload something
if UPLOAD_A_FILE:
	try:
		file_metadata={'title':'old_dude.png'}
		media = MediaFileUpload('test_dude.png',mimetype='image/png')
		filedone=svc.files().insert(body=file_metadata,
									media_body=media,
									fields='id').execute()
		print('File ID: %s' % filedone.get('id'))
	except Exception as e:
		print('Upload failed! %s' % str(e))

# see what quota we have 
svcProps = svc.about().get().execute()
print('Total bytes: %s' % svcProps['quotaBytesTotal'])
print('Used bytes: %s' % svcProps['quotaBytesUsed'])

