import json
import lib.ee as ee
import webapp2
import jinja2
import config
import socket
from google.appengine.api import urlfetch, users
import os
###############################################################################
#                             Setup                                           #
###############################################################################
URL_FETCH_TIMEOUT = 120
SEARCH_RADIUS_KM = 1000
SEARCH_MAX_TARGETS = 100

ACCESS_BAND = "XXXX" # TODO check the band name created by cumulativeCost function
FRICTION_SURFACE = 'users/harrygibson/friction_surface_v47'
USE_BACKDROP = True
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

class MainHandler(webapp2.RequestHandler):
    """Servlet to load the main Accessibility Tool web page"""

    def get(self, path=''):
        template_values = {
            'eeMapId': "None"
            ,'eeToken': "None"
        }
        if USE_BACKDROP:
            eeFrictionMapId = GetAccessBackdropMapId()
            template_values = {
                'eeMapId': eeFrictionMapId['mapid']
                ,'eeToken': eeFrictionMapId['token']
            }
        template = JINJA2_ENVIRONMENT.get_template('index.html')
        self.response.out.write(template.render(template_values))

class CostPathHandler(webapp2.RequestHandler):
    """Servlet to handle running a cost path map operation on input points"""

    def get(self):
        # TODO see what the points item passed by maps api is actually called
        requestPts = unicode(self.request.get('points'))
        fcPts = jsonPtsToFeatureColl(requestPts)



# Define the routing from URL paths to request handler types in this file
# Routing is defined as a WSGIApplication object called access_app, and this
# object is defined in the app.yaml file so AppEngine knows what to do
access_app = webapp2.WSGIApplication([
    ('/costpath', CostPathHandler),
    ('/', MainHandler)
])


###############################################################################
#                              Helper functions                               #
###############################################################################

def GetAccessBackdropMapId():
    """Returns the MapID for a backdrop map - maybe friction surface? """
    frictionSurface = ee.Image(FRICTION_SURFACE)
    #Map.addLayer(frictionSurface, {min: 0.0, max: 0.01, palette: "FFFF00,FFA500,800080,4B0082"});
    frictionVisOpts = {
            'min': 0.0,
            'max': 0.01,
            'palette': "FFFF00,FFA500,800080,4B0082",
            'opacity': 0.5
        }
    return frictionSurface.getMapId(frictionVisOpts)
    #return None

def paintPointsToImage(featureCollPts):
    # TODO we could set an analysis region by creating a mask from a polygon
    blankImage = ee.Image(0.0).byte()
    sourcesImage = blankImage.paint(featureCollPts, 1)
    sourcesImage = sourcesImage.updateMask(sourcesImage)
    return sourcesImage

def jsonPtsToFeatureColl(requestPts):
    jsonPts = json.loads(requestPts)
    coords = []
    nPts = 0
    for items in jsonPts:
        nPts += 1
        if nPts == SEARCH_MAX_TARGETS:
            # set a last-ditch limit on the number of sources
            break
        pt = ee.Geometry.Point(c)


def computeCostDist(sourcesImage):
    frictionSurface = ee.Image(FRICTION_SURFACE)
    searchRadius = max(SEARCH_RADIUS_KM, 1000)
    costDist = ee.Image(
        frictionSurface.cumulativeCost(sourcesImage, searchRadius*1000)).toInt()
    return costDist

def exportAccessImageToDrive(accessImage):
    # need to bring in user authentication as well to enable this
    # see the EE demo
    pass


def getImageDownloadUrl(accessImage):
    outIm = ee.Image(accessImage).select("ACCESS_BAND")
    # TODO clip as well?
    path = outIm.getDownloadURL({
        # nominal 30 arcsecond equivalent scale, from Weiss code
        'scale': 927.662423820733
        , 'maxPixels': 400000000
        #, 'region': coords ?
    })
    return path
