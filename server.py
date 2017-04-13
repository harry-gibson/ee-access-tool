import json
import ee
import webapp2
import jinja2

import socket
from google.appengine.api import urlfetch, users

###############################################################################
#                             Setup                                           #
###############################################################################
URL_FETCH_TIMEOUT = 120
SEARCH_RADIUS_KM = 1000
SEARCH_MAX_TARGETS = 100

ACCESS_BAND = "XXXX" # TODO check the band name created by cumulativeCost function
FRICTION_SURFACE = 'users/weissdanj/friction_surface_v47'
ee.Initialize(config.EE_CREDENTIALS)
ee.data.setDeadline(URL_FETCH_TIMEOUT)
socket.setdefaulttimeout(URL_FETCH_TIMEOUT)
urlfetch.set_default_fetch_deadline(URL_FETCH_TIMEOUT)

###############################################################################
#                             Web request handlers.                           #
###############################################################################

class MainHandler(webapp2.RequestHandler):
    """Servlet tot load the main Accessibility Tool web page"""

    def get(self, path=''):
        pass

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
        var pt = ee.Geometry.Point(c)


def computeCostDist(sourcesImage):
    frictionSurface = ee.Image(FRICTION_SURFACE)
    searchRadius = max(SEARCH_RADIUS_KM, 1000)
    costDist = ee.Image(
        frictionSurface.cumulativeCost(sourcesImage, searchRadius*1000))
        .toInt()
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
