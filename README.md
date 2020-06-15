# Earth Engine Accessibility Map Creation Tool

This tool was created to accompany the paper "A global map of travel time to cities to assess inequalities in accessibility in 2015", [published](https://www.nature.com/articles/nature25181) in Nature in 2018.

The tool allows users to create their own accessibility maps interactively, or using a CSV of target locations (the published map uses a fixed set of targets - urban areas and cities around the world). The tool is powered by Earth Engine and uses the friction surface from the published paper to calculate travel times. The resultant map can be viewed on a google maps interface, and then can be exported to a GeoTIFF file for local analysis in a GIS program.

The tool is online at access-mapper.appspot.com

The tool was created by Harry Gibson with CSS assistance from [Jake Ozga](https://www.jozga.co.uk/)

### Setup 

Note that installing requirements etc is totally different for App Engine with py3.7 as opposed to 2.7. Installing requirements is easier, but conversely many services provided by app engine have been removed so you have to handle them separately.

* Create a clean python 3.7 virtual environment (app engine docs say to use venv package but I used a conda environment and this worked ok)
* In this environment run `pip install -r requirements.txt`
* Add the private key file for a whitelisted service account (see below) to the project folder (and add it to .gitignore)
* For local testing run `python main.py` to start a flask webserver and host the app on localhost:8080
* For deployment run `gcloud app deploy` (once the gcloud project has been set appropriately)

### Infrastructure and changes for 3.7 runtime

#### Google cloud project
The app is developed under the access-mapper project

#### Google maps API 
The key for this in the access-mapper project is available only on the app's domain and on localhost. 

#### Service account
The service account under the access-mapper project has been whitelisted for use with Earth Engine API and this API has then been activated in the console (you can't find it to activate it until the account has been whitelisted)
The private key for the service account is held separately and must be deployed to app engine with the code (i.e. it must be placed in the project folder and added to .gitignore)

#### Export tasks
* The taskrunner service is not available in App engine 3.7 runtimes. The tasks (previously a push queue) are now handled by Cloud Tasks.
* The /export endpoint is called by the client website code with a POST request as before. This endpoint now submits a task to the Cloud Tasks queue. The task is configured such that its payload is to make a request to the /exportrunner endpoint which actually runs the export.
* Thus the call to /exportrunner comes from the Cloud Tasks infrastructure, via a named queue.
* The task queue has been created and configured in the access-mapper project to allow only a small number (3) of concurrent requests to avoid overloading earth engine allocations
* The endpoint which runs the task (which is now called by the Cloud Tasks infrastructure) is secured by looking for a header in the requests it receives, rather than app engine user / login handling as before

#### Email notifications
* The mail service is not available in App engine 3.7 runtimes. Sending mail is now handled by a third party commercial service - I chose Mailgun.
* This requires having your own domain from which the mails will be sent, and configuring the DNS records of that domain appropriately. Much more hassle than the app engine service which allowed you to send from a gmail address.
* Actually sending the mail is simply a matter of making a POST request so the app engine code is easy