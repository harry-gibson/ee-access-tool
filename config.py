import ee
#!/usr/bin/env python
"""Required credentials configuration."""

# service account for ee-api-testing project
# EE_ACCOUNT = 'ee-map-oxford-hsg@ee-api-testing.iam.gserviceaccount.com'
# OR
# service account for access-mapper project
EE_ACCOUNT = 'ee-access-tool@access-mapper.iam.gserviceaccount.com'

# The private key associated with your service account in Privacy Enhanced
# Email format (.pem suffix).  To convert a private key from the RSA format
# (.p12 suffix) to .pem, run the openssl command like this:
# openssl pkcs12 -in downloaded-privatekey.p12 -nodes -nocerts > privatekey.pem
# You can find more detailed instructions in the README.

# private key for ee-api-testing service account
# EE_PRIVATE_KEY_FILE = 'ee-api-testing.pem'
# OR
# private key for access-mapper service account, not in repo
EE_PRIVATE_KEY_JSON_FILE = 'access-mapper-77c3c2dfef55.json'
EE_CREDENTIALS = ee.ServiceAccountCredentials(EE_ACCOUNT, EE_PRIVATE_KEY_JSON_FILE)


# Sender address for the mail API must be whatever@projectname.appspotmail.com OR a registered
# sender for the project in the AppEngine console
#APP_SENDER_ADDRESS = "donotreply@access-mapper.appspotmail.com"
APP_SENDER_ADDRESS = "malariaatlasproject@gmail.com"

# The service account that will be creating the files (i.e. the EE service account EE_ACCOUNT)
# must have access to write and modify objects in this bucket.
# For ease, the bucket has been configured so that new objects are public-readable
APP_STORAGE_BUCKET = "access-mapper.appspot.com"