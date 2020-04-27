import ee
#!/usr/bin/env python
"""Required credentials configuration."""

# service account for access-mapper project
EE_ACCOUNT = 'ee-access-tool@access-mapper.iam.gserviceaccount.com'

# private key for ee-api-testing service account OR private key for access-mapper service account
# these are .gitignored and so not in repo
EE_PRIVATE_KEY_JSON_FILE = 'access-mapper-77c3c2dfef55.json'
EE_CREDENTIALS = ee.ServiceAccountCredentials(EE_ACCOUNT, EE_PRIVATE_KEY_JSON_FILE)

# Email sending configuration. We are using mailgun for sending and the domain of the sender
# must be registered with mailgun via DNS settings on the domain
APP_SENDER_ADDRESS = "access-mapper-noreply@mail.malariaatlas.org"
MAILGUN_BASE_URL = "https://api.eu.mailgun.net/v3/mail.malariaatlas.org/messages"
# Mailgun API key is in a .gitignored file, needs to be retrieved from mailgun if needed

# The service account that will be creating the files (i.e. the EE service account EE_ACCOUNT)
# must have access to write and modify objects in this bucket.
# For ease, the bucket has been configured so that new objects are public-readable
APP_STORAGE_BUCKET = "access-mapper.appspot.com"
