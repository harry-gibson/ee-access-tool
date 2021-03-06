import string
import random
import time
import json
import ee
from AccessToolConstants import *


###############################################################################
#                           EE-related functions                              #
###############################################################################

def paintPointsToImage(featureCollPts):
    """Paints points in a feature collection to a binary ee image"""
    # TODO we could set an analysis region by creating a mask from a polygon
    blankImage = ee.Image(0.0).byte()
    sourcesImage = blankImage.paint(featureCollPts, 1)
    sourcesImage = sourcesImage.updateMask(sourcesImage)
    return sourcesImage

def getMapPaletteString():
    """Formats the constant palette string to get the usable SLD fragment for visuals"""
    maxOld = max(ACCESSIBILITY_STYLE['ramp_positions'])
    normFact = float(MAX_SYMBOLISE_VALUE) / maxOld
    newBreaks = [f * normFact for f in ACCESSIBILITY_STYLE['ramp_positions']]
    sld_ramp = ACCESSIBILITY_STYLE['ramp_template'].format(*newBreaks)
    return sld_ramp


def jsonPtsToFeatureColl(requestPts):
    """Converts json points from the web request into an EE feature collection"""
    jsonPts = json.loads(requestPts)
    return pointsObjToFeatureColl(jsonPts)

def pointsObjToFeatureColl(pointsObj):
    coords = []
    nPts = 0
    for items in pointsObj:
        nPts += 1
        if nPts == SEARCH_MAX_TARGETS:
            # set a server-side limit on the number of sources in case of client-side shenanigans
            break
        try:
            pt = ee.Geometry.Point(items['lng'], items['lat'])
            coords.append(pt)
        except:
            pass
    featColl = ee.FeatureCollection(coords)
    return featColl

def jsonRegionToJsonRectangle(requestRegion):
    """Converts a region passed from gmaps api to a geojson rectangle

    Bizarrely the ee image download function doesn't take an ee.Rectangle object for
    region but rather demands a client-side geojson string representation of
    a region. (A post on the EE developers list suggested this is not by design
    and may change). Conversely the export image (to drive etc) function takes ee.Rectangle"""
    rect = jsonRegionToEERectangle(requestRegion).toGeoJSONString()
    return rect

def regionObjToEERectangle(regionObj):
    rect = ee.Geometry.Rectangle([regionObj['west'], regionObj['south'],
                                  regionObj['east'], regionObj['north']])
    return rect

def jsonRegionToEERectangle(requestRegion):
    jsonRegion = json.loads(requestRegion)
    return regionObjToEERectangle(jsonRegion)

def regionObjToArrayCoords(regionObj):
    w = regionObj['west']
    e = regionObj['east']
    n = regionObj['north']
    s = regionObj['south']
    return [[w, s], [w, n], [e, n], [e, s]]

def jsonRegionToArrayCoords(requestRegion):
    jsonRegion = json.loads(requestRegion)
    return regionObjToArrayCoords(jsonRegion)

def computeCostDist(sourcesImage, clip=False, computationScale=NATIVE_RESOLUTION):
    """Runs the cost-distance map to the provided sources on the friction surface"""
    maxExtent = ee.Geometry.Rectangle(MAX_EXTENT_WSEN)
    frictionSurface = ee.Image(FRICTION_SURFACE)
    if False: #computationScale != NATIVE_RESOLUTION:
        frictionSurface = frictionSurface.reduceResolution(
            reducer = ee.Reducer.mean(),
            maxPixels = int((computationScale / NATIVE_RESOLUTION)**2 + 10)
        )
    searchRadius = min(SEARCH_RADIUS_KM, 10000)
    costDist = ee.Image(
        frictionSurface
        .cumulativeCost(sourcesImage,
                        searchRadius*1000)
        .toInt()
        ).reproject(crs='EPSG:4326', scale=computationScale)
    if (clip):
        return costDist.clip(maxExtent)
    else:
        return costDist


def getImageDownloadUrl(accessImage, exportRegion):
    """Attempts to get direct download URL for an image, usually fails as it's deprecated"""
    try:
        outIm = ee.Image(accessImage).select(ACCESS_BAND)
        # TODO clip as well?
        path = outIm.getDownloadURL({
            # nominal 30 arcsecond equivalent scale, from Weiss code
            'scale': NATIVE_RESOLUTION
            , 'maxPixels': EXPORT_MAX_PIXELS
            , 'region': exportRegion
        })
        return path
    except:
        # if the region is too large for the deprecated getDownloadURL function
        return None


###############################################################################
#                   Tool-specific visualisation functions                     #
###############################################################################

def GetFrictionMapId():
    """Returns the MapID for a visualisation of the friction surface? """
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

def GetAccessMapId_Plain(eeAccessImage):
    """Returns the MapID for simple visualisation of a cost distance image"""
    accessVisOpts = {
        'min':0,
        'max':1000,
        'opacity':0.8,
        'palette':"FFFACD,CD8500,8A360F,68228B"
    }
    return eeAccessImage.getMapId(accessVisOpts)


def GetAccessMapId_Pretty(eeAccessImage):
    """Returns the MapID for a prettier visualisation of a cost distance image

    The map will be rendered in a similar colour scheme to that used in the existing
    static website and the paper, from yellow-orange-red-purple-black, with three
    distinct breaks of slope to improve contrast"""
    sldImage = eeAccessImage.sldStyle(getMapPaletteString())
    try:
        return sldImage.getMapId({'opacity':0.8})
    except:
        print (getMapPaletteString())


###############################################################################
#                              Helper functions                               #
###############################################################################

def GetUniqueString():
    """Returns a likely-to-be unique string."""
    random_str = ''.join(
        random.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    date_str = str(int(time.time()))
    return date_str + random_str
