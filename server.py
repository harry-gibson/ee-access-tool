import json
import lib.ee as ee
import lib.drive as drive
import webapp2
import jinja2
import config
import socket
import logging
import random
import time
import string
from google.appengine.api import urlfetch, users, taskqueue, channel
import lib.oauth2client.appengine
import lib.oauth2client.client
import os
# from AccessToolConstants import *
from AccessToolStaticHelpers import *


############################## DRIVE LOGIN ####################################
# Both the app and the user logins are to the Drive scope only
OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive'


# Login for the app service account's drive space: the image gets exported to here
# in the first instance then copied to the user's drive
APP_CREDENTIALS = lib.oauth2client.client.SignedJwtAssertionCredentials(
    config.EE_ACCOUNT,
    open(config.EE_PRIVATE_KEY_FILE, 'rb').read(),
    OAUTH_SCOPE
)
# Drive helper authenticated with the service account to give access to the drive
# space associated with that account
#APP_DRIVE_HELPER = drive.DriveHelper(APP_CREDENTIALS)

# This triggers the user's Drive permissions request flow when used as a
# decorator on a request handler function
OAUTH_DECORATOR = lib.oauth2client.appengine.OAuth2Decorator(
    client_id=config.OAUTH_CLIENT_ID,
    client_secret=config.OAUTH_CLIENT_SECRET,
    scope=OAUTH_SCOPE
)

ee.Initialize(config.EE_CREDENTIALS)
ee.data.setDeadline(URL_FETCH_TIMEOUT)
socket.setdefaulttimeout(URL_FETCH_TIMEOUT)
urlfetch.set_default_fetch_deadline(URL_FETCH_TIMEOUT)

# Create the Jinja templating system we use to dynamically generate HTML. See:
# http://jinja.pocoo.org/docs/dev/
JINJA2_ENVIRONMENT = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)),
    autoescape=True,
    extensions=['jinja2.ext.autoescape'])


###############################################################################
#                             Web request handlers.                           #
###############################################################################

class DataHandler(webapp2.RequestHandler):
    """Base class for servlets to respond to queries.

    Taken from EE export-to-drive template but also just as applicable to the
    trendy-lights derived code for the cost path map"""
    def get(self):
        self.Handle(self.DoGet)

    def post(self):
        self.Handle(self.DoPost)

    def DoGet(self):
        """Processes a GET request and returns a JSON-encodable result."""
        raise NotImplementedError()

    def DoPost(self):
        """Processes a POST request and returns a JSON-encodable result."""
        raise NotImplementedError()

    @OAUTH_DECORATOR.oauth_required
    def Handle(self, handle_function):
        """Responds with the result of the handle_function or errors, if any."""
        # Note: The fetch timeout is thread-local so must be set separately
        # for each incoming request.
        # TODO maybe move the oauth_required decorator to only the export handler
        urlfetch.set_default_fetch_deadline(URL_FETCH_TIMEOUT)
        try:
            response = handle_function()
        except Exception as e:  # pylint: disable=broad-except
            response = {'error': str(e)}
        if response:
            self.response.headers['Content-Type'] = 'application/json'
            self.response.out.write(json.dumps(response))

class MainHandler(webapp2.RequestHandler):
    """Servlet to load the main Accessibility Tool web page

    This returns the index.html page with the mapid and token for the overlay image
    either set to point to a rendered version of the friction surface or to 'None',
    in which case the js code will not create an overlay on top of the googlemap """

    def get(self, path=''):
        client_id = GetUniqueString()
        template_values = {
            'eeMapId': "None"
            ,'eeToken': "None"
            , 'channelToken': channel.create_channel(client_id)
            , 'channelClientId': client_id
        }
        if USE_BACKDROP:
            eeFrictionMapId = GetFrictionMapId()
            template_values['eeMapId'] = eeFrictionMapId['mapid']
            template_values['eeToken'] = eeFrictionMapId['token']
        template = JINJA2_ENVIRONMENT.get_template('index.html')
        self.response.out.write(template.render(template_values))

class CostPathHandler(webapp2.RequestHandler):
    """Servlet to handle running a cost path map operation on input points, producing a map overlay

    Parses the request item called 'points' and paints the points onto a new
    ee.Image, runs cost path, and returns the mapid and token to add the result
    to the map, along with the downloadurl for it"""

    def get(self):
        requestPts = unicode(self.request.get('sourcepoints'))
        eeFcPts = jsonPtsToFeatureColl(requestPts)
        requestRegion = unicode(self.request.get('mapBounds'))
        eeRectRegion = jsonRegionToJsonRectangle(requestRegion)
        srcImage = paintPointsToImage(eeFcPts)
        costImage = computeCostDist(srcImage, computationScale=INTERACTIVE_RESOLUTION)
        costImageId = GetAccessMapId_Plain(costImage)
        #costImageId = GetAccessMapId_Pretty(costImage)
        costImageDownloadUrl = getImageDownloadUrl(costImage, eeRectRegion)
        layers = []
        layers.append({
            'eeMapId': costImageId['mapid'],
            'eeToken': costImageId['token']
        })
        if (costImageDownloadUrl):
            layers[0]['downloadUrl'] = costImageDownloadUrl
        self.response.out.write(json.dumps(layers))

    def post(self):
        self.get()

class ImageValueHandler(webapp2.RequestHandler):
    """Servlet to handle calculating the accessibility value for a single location.

    This entails running the full analysis as for the CostPathHandler but then returning
    the image value at a given point rather than the image itself. This is really really
    slow, which may be an inevitable consequence of the EE lazy processing but feels a bit
    wrong"""
    def get(self):
        sourcePts = unicode(self.request.get('sourcepoints'))
        eeSourcePts = jsonPtsToFeatureColl(sourcePts)
        srcImage = paintPointsToImage(eeSourcePts)
        costImage = computeCostDist(srcImage, computationScale=INTERACTIVE_RESOLUTION)
        requestPts = unicode(self.request.get('querypoints'))
        requestPtsObj = json.loads(requestPts)
        requestPt = requestPtsObj[0]
        #eeRequestPts = jsonPtsToFeatureColl(requestPts)
        #eeRequestPt = eeRequestPts.first() #ee.Geometry.Point(eeRequestPts.first())
        eeRequestPt = ee.Geometry.Point(requestPt['lng'], requestPt['lat'])
        value = costImage.reduceRegion(
            reducer = ee.Reducer.first(),
            geometry = eeRequestPt,
            bestEffort = True).get('cumulative_cost')
        output = value.getInfo() # just a number, or null
        self.response.out.write(json.dumps(output))

    def post(self):
        self.get()

class ExportHandler(DataHandler):
    """A servlet to handle requests for image exports

    Adapted from the EE export-to-drive sample. Submits a task to the default push queue.
    App engine will then run this task, in the form of submitting a task to the exportrunner
    URL endpoint - the one which actually runs the export."""
    def DoPost(self):
        taskqueue.add(url='/exportrunner', params={
            'filename': self.request.get('filename'),
            'client_id': self.request.get('client_id'),
            'email': users.get_current_user().email(),
            'user_id': users.get_current_user().user_id(),
            'region': self.request.get('region'),
            'sourcepoints': self.request.get('sourcepoints')
        })

class ExportRunnerHandler(webapp2.RequestHandler):
    """A servlet for handling async export task requests

    Adapted from the EE export-to-drive sample. This handler is configured in app.yaml
    to only be available to admin users, which includes internal appengine requests.
    Thus, it can't be called externally, only from the ExportHandler handler (in
    response to a user request to /export)."""

    def post(self):
        """Exports an image for the year and region, gives it to the user.

        This is called by our trusted export handler and runs as a separate
        process.

        HTTP Parameters:
          email: The email address of the user who initiated this task.
          filename: The final filename of the file to create in the user's Drive.
          client_id: The ID of the client (for the Channel API).
          task: The pickled task to poll.
          temp_file_prefix: The prefix of the temp file in the service account's
              Drive.
          user_id: The ID of the user who initiated this task.
        """

        # Note that the response from this is only seen by the task queue service, there
        # is no path back from here to the client that submitted the request to /export.
        # That is why we use the channel api to get a message back, and replacing it needs
        # some thought.

        # At present this works fine if we are exporting a pre-existing asses such as the friction
        # surface. However for the on-the-fly accessibility map it is catastrophically slow to the
        # extent that it times out unless you do a really small area.

        requestRegion = self.request.get('region')
        arrRegion = jsonRegionToArrayCoords(requestRegion)
        filename = self.request.get('filename')
        client_id = self.request.get('client_id')
        email = self.request.get('email')
        user_id = self.request.get('user_id')

        # Get the image to export, i.e. run the cost mapping with the points
        sourcePts = unicode(self.request.get('sourcepoints'))
        eeSourcePts = jsonPtsToFeatureColl(sourcePts)
        srcImage = paintPointsToImage(eeSourcePts)
        costImage = computeCostDist(srcImage, computationScale=NATIVE_RESOLUTION)
        #costImage = ee.Image(FRICTION_SURFACE)
        #image = GetExportableImage(_GetImage(), region)

        # Use a unique prefix to identify the exported file.
        temp_file_prefix = GetUniqueString()

        # todo implement exporting a set region only
        #logging.info(eeRectRegion)
        # Create and start the task.
        task = ee.batch.Export.image(
            image=costImage,
            description='Earth Engine Demo Export',
            config={
                'driveFileNamePrefix': temp_file_prefix,
                'maxPixels': EXPORT_MAX_PIXELS,
                'scale': NATIVE_RESOLUTION,
                'region': arrRegion
            })
        task.start()
        logging.info('Started EE task (id: %s).', task.id)

        # Wait for the task to complete (taskqueue auto times out after 10 mins).
        while task.active():
            logging.info('Polling for task (id: %s).', task.id)
            time.sleep(TASK_POLL_FREQUENCY)

        def _SendMessage(message):
            logging.info('Sent to client: ' + json.dumps(message))
            self._SendMessageToClient(client_id, filename, message)

        # Make a copy (or copies) in the user's Drive if the task succeeded.
        state = task.status()['state']
        if state == ee.batch.Task.State.COMPLETED:
            logging.info('Task succeeded (id: %s).', task.id)
            try:
                link = self._GiveFilesToUser(temp_file_prefix, email, user_id, filename)
                # Notify the user's browser that the export is complete.
                _SendMessage({'link': link})
            except Exception as e:  # pylint: disable=broad-except
                _SendMessage({'error': 'Failed to give file to user: ' + str(e)})
        else:
            _SendMessage({'error': 'Task failed (id: %s).' % task.id})


    def _SendMessageToClient(self, client_id, filename, params):
        """Sends a message to the client using the Channel API.

        Args:
          client_id: The ID of the client to message.
          filename: The name of the exported file the message is about.
          params: The params to send in the message (as a Dictionary).
        """
        # TODO channel API is deprecated and will be removed in Oct2017 so replace this
        params['filename'] = filename
        channel.send_message(client_id, json.dumps(params))

    def _GiveFilesToUser(self, temp_file_prefix, email, user_id, filename):
        """Moves the files with the prefix to the user's Drive folder.

        Copies and then deletes the source files from the app's Drive.

        Args:
          temp_file_prefix: The prefix of the temp files in the service
              account's Drive.
          email: The email address of the user to give the files to.
          user_id: The ID of the user to give the files to.
          filename: The name to give the files in the user's Drive.

        Returns:
          A link to the files in the user's Drive.
        """
        APP_DRIVE_HELPER = drive.DriveHelper(APP_CREDENTIALS)
        files = APP_DRIVE_HELPER.GetExportedFiles(temp_file_prefix)

        # Grant the user write access to the file(s) in the app service
        # account's Drive.
        for f in files:
            APP_DRIVE_HELPER.GrantAccess(f['id'], email)

        # Create a Drive helper to access the user's Google Drive.
        user_credentials = lib.oauth2client.appengine.StorageByKeyName(
            lib.oauth2client.appengine.CredentialsModel,
            user_id, 'credentials').get()
        user_drive_helper = drive.DriveHelper(user_credentials)

        # Copy the file(s) into the user's Drive.
        if len(files) == 1:
            file_id = files[0]['id']
            copied_file_id = user_drive_helper.CopyFile(file_id, filename)
            trailer = 'open?id=' + copied_file_id
        else:
            trailer = ''
            for f in files:
                # The titles of the files include the coordinates separated by a dash.
                coords = '-'.join(f['title'].split('-')[-2:])
                user_drive_helper.CopyFile(f['id'], filename + '-' + coords)

        # Delete the file from the service account's Drive.
        for f in files:
            APP_DRIVE_HELPER.DeleteFile(f['id'])

        return 'https://drive.google.com/' + trailer

# Define the routing from URL paths to request handler types in this file
# Routing is defined as a WSGIApplication object called access_app, and this
# object is defined in the app.yaml file so AppEngine knows what to do
access_app = webapp2.WSGIApplication([
    ('/costpath', CostPathHandler),
    ('/costvalue', ImageValueHandler),
    ('/exportrunner', ExportRunnerHandler), # internal use only
    ('/export', ExportHandler), # user hook to export data
    ('/', MainHandler),
    (OAUTH_DECORATOR.callback_path, OAUTH_DECORATOR.callback_handler()),
])
