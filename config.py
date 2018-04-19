
import lib.ee as ee
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
# private key for access-mapper service account
EE_PRIVATE_KEY_JSON_FILE = 'access-mapper-77c3c2dfef55.json'
EE_CREDENTIALS = ee.ServiceAccountCredentials(EE_ACCOUNT, EE_PRIVATE_KEY_JSON_FILE)

# oauth config for ee-api-testing project
# OAUTH_CLIENT_ID = '308656483216-9mdtaetrect57ai3tljl7dpsd0m7413c.apps.googleusercontent.com'
# OAUTH_CLIENT_SECRET = 'fedgfOspPoaX8Bqbe_QSzmHV'
# OR
# oauth config for access-mapper project
OAUTH_CLIENT_ID = '170429793209-0sfrkq47739b443os6cidt6dtbg02iki.apps.googleusercontent.com'
OAUTH_CLIENT_SECRET = 'suHQy8orERy9bdP9IHzd5L20'