# Earth Engine Accessibility Map Creation Tool

This tool was created to accompany the paper "A global map of travel time to cities to assess inequalities in accessibility in 2015", [published](https://www.nature.com/articles/nature25181) in Nature in 2018.

The tool allows users to create their own accessibility maps interactively, or using a CSV of target locations (the published map uses a fixed set of targets - urban areas and cities around the world). The tool is powered by Earth Engine and uses the friction surface from the published paper to calculate travel times. The resultant map can be viewed on a google maps interface, and then can be exported to a GeoTIFF file for local analysis in a GIS program.

The tool is online at access-mapper.appspot.com

The tool was created by Harry Gibson with CSS assistance from [Jake Ozga](https://www.jozga.co.uk/)

Setup - CURRENTLY BROKEN
all linux shit is broken as too hard to get pip to install into lib folder. The pip version doesn't work with the necessary switches. Using virtualenv is all broken. Fuck it all.

Use python 2.7 for now because everything is different at 3 and app engine structure needs total rewrite

Use powershell, use python 2.7, in project folder: 
 C:\Python27\ArcGISx6410.6\python.exe -m pip install -r .\requirements.txt -t lib
Add lib to pythonpath environment variable before trying to import ee
 