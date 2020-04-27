# [START gae_python37_app]
import ee
import jinja2
import config
import mail_config_key
import logging
#these have all been replaced in py3.7 migration
#from google.appengine.api import urlfetch,  taskqueue, mail
import os
from AccessToolStaticHelpers import *

from flask import request, Flask, abort
from google.cloud import tasks_v2, storage
import requests
import google.cloud.logging
import datetime
from slugify import slugify

app = Flask(__name__)

taskClient = tasks_v2.CloudTasksClient()
# this queue needs to be created and configured first in gcloud commandline or console
PROJECT = 'access-mapper'
QUEUE = 'access-mapper-queue'
LOCATION = 'europe-west2'
FULL_QUEUE_NAME = taskClient.queue_path(PROJECT, LOCATION, QUEUE)

logClient = google.cloud.logging.Client()
logClient.setup_logging()
import logging

storage_client = storage.Client()
# for local testing:
#os.environ['GOOGLE_APPLICATION_CREDENTIALS']="path/to/privatekey-file.json"

ee.Initialize(config.EE_CREDENTIALS)
ee.data.setDeadline(URL_FETCH_TIMEOUT)

# Create the Jinja templating system we use to dynamically generate HTML. See:
# http://jinja.pocoo.org/docs/dev/
JINJA2_ENVIRONMENT = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)),
    autoescape=True,
    extensions=['jinja2.ext.autoescape'])

@app.route('/')
def getMain():
    """Load the main Accessibility Tool web page

        This returns the index.html page with the mapid and token for the overlay image
        either set to point to a rendered version of the friction surface or to 'None',
        in which case the js code will not create an overlay on top of the googlemap """
    client_id = GetUniqueString()

    template_values = {
        'eeMapId': "None"
        , 'eeToken': "None"
    }
    # If we want to initialise the page with an ee map layer already showing then we need to pass the id
    # of it, and a token for access, to the javascript. We do that by using the template engine to write the
    # required bits into the HTML page before serving it
    if USE_BACKDROP:
        eeFrictionMapId = GetFrictionMapId()
        template_values['eeMapId'] = eeFrictionMapId['mapid']
        template_values['eeToken'] = eeFrictionMapId['token']
    template = JINJA2_ENVIRONMENT.get_template('index.html')
    return(template.render(template_values))

@app.route('/costpath', methods=['POST'])
def getCostPath():
    """Servlet to handle running a cost path map operation on input points, producing a map overlay

        Parses the request item called 'points' and paints the points onto a new
        ee.Image, runs cost path, and returns the mapid and token to add the result
        to the map, along with the downloadurl for it"""
    requestPts = request.form.get('sourcepoints')
    eeFcPts = jsonPtsToFeatureColl(requestPts)
    requestRegion = request.form.get('mapBounds')
    eeRectRegion = jsonRegionToJsonRectangle(requestRegion)
    srcImage = paintPointsToImage(eeFcPts)
    costImage = computeCostDist(srcImage, computationScale=INTERACTIVE_RESOLUTION)
    # costImageId = GetAccessMapId_Plain(costImage)
    costImageId = GetAccessMapId_Pretty(costImage)
    costImageDownloadUrl = getImageDownloadUrl(costImage, eeRectRegion)
    layers = []
    layers.append({
        'eeMapId': costImageId['mapid'],
        'eeToken': costImageId['token']
    })
    if (costImageDownloadUrl):
        layers[0]['downloadUrl'] = costImageDownloadUrl
    return(json.dumps(layers))

@app.route('/costvalue', methods=['POST'])
def getImageValue():
    """Servlet to handle calculating the accessibility value for a single location.

        This entails running the full analysis as for the CostPathHandler but then returning
        the image value at a given point rather than the image itself. This is quite
        slow, which may be an inevitable consequence of the EE lazy processing but feels a bit
        wrong. That said it's got a lot faster since this was written."""

    sourcePts = request.form.get('sourcepoints')
    eeSourcePts = jsonPtsToFeatureColl(sourcePts)
    srcImage = paintPointsToImage(eeSourcePts)
    costImage = computeCostDist(srcImage, computationScale=INTERACTIVE_RESOLUTION)
    requestPts = request.form.get('querypoints')
    requestPtsObj = json.loads(requestPts)
    requestPt = requestPtsObj[0]
    # eeRequestPts = jsonPtsToFeatureColl(requestPts)
    # eeRequestPt = eeRequestPts.first() #ee.Geometry.Point(eeRequestPts.first())
    eeRequestPt = ee.Geometry.Point(requestPt['lng'], requestPt['lat'])
    value = costImage.reduceRegion(
        reducer=ee.Reducer.first(),
        geometry=eeRequestPt,
        bestEffort=True).get('cumulative_cost')
    output = value.getInfo()  # just a number, or null
    return(json.dumps(output))

@app.route('/export', methods=['POST'])
def postExport():
    """A servlet to handle requests for image exports
    Called by the client code, constructs a task the payload of which will be to call the exportrunner endpoint.
    Submits this task to the Cloud Tasks queue, which in turn will run the task and thus call the export in a
    separate process."""
    task = {
        'app_engine_http_request':{
            'http_method': 'POST',
            'relative_uri': '/exportrunner',
            'headers': {'Content-Type': 'application/json'}
        }
    }
    payload = {
        'filename': request.form.get('filename'),
        'email': request.form.get('email'),
        'region': request.form.get('region'),
        'sourcepoints': request.form.get('sourcepoints')
    }
    payload_converted = json.dumps(payload).encode()
    task['app_engine_http_request']['body'] = payload_converted

    response = taskClient.create_task(FULL_QUEUE_NAME, task)
    logging.info("Created task {}".format(response.name))
    return response.name


@app.route('/exportrunner', methods=['POST'])
def runExport():
    """A servlet for handling async export task requests.
    Exports an image for the year and region, gives it to the user.

    Adapted from the EE export-to-drive sample. This handler is the one that actually runs the export. As the
    task takes a very long time, it needs to run asynchronously, which we do via a task. This handler can therefore
    only be called by the taskrunner, not the external site. At app engine 3.7 we enforce this by looking for a header
    that only the task queue can set. (At app engine 2.7, we used the internal task service and used app.yaml to
    configure access to this endpoint.)

    Unlike in the original EE sample here we export to a cloud storage bucket, not a user's Drive account,
    bypassing the need for users to authenticate

        HTTP Parameters:
          region: the map extent to export for, should be set from the client viewport
          sourcepoints: the accessibility-to locations from the map at time of export
          email: The email address to send the link to on completed export.
          filename: The final filename of the file to create (TODO).

        """

    # as user: admin is not supported anymore instead we need to check for this header on the request
    # 'HTTP_USER_AGENT': 'AppEngine-Google; (+http://code.google.com/appengine; appid: s~my-project)'
    #print(str(request.headers))
    incoming_task_queue = request.headers.get('X-Appengine-QueueName', None)
    if incoming_task_queue != QUEUE:
        logging.error("Unauthorised request made to exporter, {}".format(incoming_task_queue))
        #abort(403, "unauthorised: queue name was " + incoming_task_queue)

    def _EmailLinkToUser(link, emailAddr):
        # Use Mailgun to email link to the user
        subject = "Your Accessibility Map export"
        body = "Hi there,\n\n" \
               "Your export from the Malaria Atlas Project Accessibility Mapping tool has completed successfully.\n\n" \
               "Please click here to retrieve your exported map in GeoTIFF format. \n\n" \
               + link + \
               "\n\nNote that this link will remain active for 48 hours, after which time the output data will be deleted " \
               "and you would have to re-run your search."
        logging.info("Sending success email containing link: \n" + link)
        result = requests.post(config.MAILGUN_BASE_URL,
                               auth=("api", mail_config_key.MAILGUN_API_KEY),
                               data={"from": config.APP_SENDER_ADDRESS,
                                     "to": emailAddr,
                                     "subject": subject,
                                     "text": body})
        return result

    def _EmailErrorMessage(msg, emailAddr):
        # Use Mailgun to email error to the user
        subject = "Accessibility Map export - Error"
        body = "Hi there,\n\n " \
               "Unfortunately an error occurred exporting your accessibility map.\n\n" \
               "The error message was: \n\n" \
               + msg
        logging.info("Sending error email containing message: " + msg)
        result = requests.post(config.MAILGUN_BASE_URL,
                               auth=("api", mail_config_key.MAILGUN_API_KEY),
                               data={"from": config.APP_SENDER_ADDRESS,
                                     "to": emailAddr,
                                     "subject": subject,
                                     "text": body})
        return result

    def _GetFilenameSlug(emailAddr):
        timeSlug = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        emailSlug = slugify(emailAddr)
        fn = '-'.join(['access-mapper-export', timeSlug, emailSlug])
        return fn

    def _GetExportedFileLink(temp_file_prefix):
        # rename the exported file from its temporary name to something probably unique
        # and relevant, and return the public link to it
        # TODO rename the file to something specific to the user? Zip it up with metadata?
        newFilename = _GetFilenameSlug(email)
        bucket = storage_client.bucket(config.APP_STORAGE_BUCKET)
        blob = bucket.blob(temp_file_prefix + '.tif')
        new_blob = bucket.rename_blob(blob, newFilename + '.tif')
        return new_blob.public_url
        #return ("https://storage.googleapis.com/" +
        #        config.APP_STORAGE_BUCKET + "/" +
        #        temp_file_prefix + ".tif")

    content = request.get_json()
    requestRegion = content['region']
    arrRegion = jsonRegionToArrayCoords(requestRegion)
    email = content['email']

    # Get the image to export, i.e. (re)run the cost mapping with the points
    sourcePts = content['sourcepoints']
    eeSourcePts = jsonPtsToFeatureColl(sourcePts)
    srcImage = paintPointsToImage(eeSourcePts)
    costImage = computeCostDist(srcImage, computationScale=NATIVE_RESOLUTION)

    # Use a unique prefix to identify the exported file. If we want a user specified filename then
    # we'll have to think about how we protect access so one can't overwrite another and much faff
    temp_file_prefix = GetUniqueString()
    # Create and start the task. NB ee.batch.export.image({}) didn't seem to work in that the
    # file was always exported as 0000000000.0000000000.tif
    task = ee.batch.Export.image.toCloudStorage(
        image=costImage,
        description='Accessibilty Mapper Export '+temp_file_prefix,
        bucket="access-mapper.appspot.com",
        fileNamePrefix=temp_file_prefix,
        maxPixels=EXPORT_MAX_PIXELS,
        scale=NATIVE_RESOLUTION,
        region=arrRegion
    )
    task.start()
    logging.info('Started EE task (id: %s) exporting to prefix %s', task.id, temp_file_prefix)

    # Wait for the task to complete (v2.7 taskqueue auto times out after 10 mins, unsure about Cloud Tasks yet).
    while task.active():
        logging.info('Polling for task (id: %s).', task.id)
        time.sleep(TASK_POLL_FREQUENCY)

    state = task.status()['state']
    if state == ee.batch.Task.State.COMPLETED:
        logging.info('Task succeeded (id: %s).', task.id)
        try:
            # Notify the user that it's complete
            link = _GetExportedFileLink(temp_file_prefix)
            _EmailLinkToUser(link, email)
        except Exception as e:  # pylint: disable=broad-except
            logging.warn('Error in file handover ' + str(e))
            #_SendMessage(json.dumps({'error': 'Failed to give file to user: ' + str(e)}))
    else:
        logging.warn('Earth Engine task failed!')
        _EmailErrorMessage('EE Task failed (id: %s)' % task.id, email)
        return "Task Error"
         # _SendMessage({'error': 'Task failed (id: %s).' % task.id})
    return "Task Success"

if __name__ == '__main__':
    # This is used when running locally only. When deploying to Google App
    # Engine, a webserver process such as Gunicorn will serve the app. This
    # can be configured by adding an `entrypoint` to app.yaml.
    app.run(host='127.0.0.1', port=8080, debug=True)

# [END gae_python37_app]