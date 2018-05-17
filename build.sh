
#!/bin/bash

# This Bash script builds Python dependencies needed to run and deploy
# the demo application.

# Builds the specified dependency if it hasn't been built. Takes 4 parameters:
#   For PyPI packages:
#     1. The source type: "pypi".
#     2. The name of the PyPI package.
#     3. The version of the package.
#     4. The path within the package of the library folder.
#   For Git repositories:
#     1. The source type: "git".
#     2. The URL of the git repository.
#     3. The tag name or commit SHA at which to checkout the repo.
#     4. The path within the repo of the library folder.
BuildDep () {
  DST_FOLDER=$(basename "$4")
  echo "Building $DST_FOLDER ($3)..."
  if [ ! -d "./lib/$DST_FOLDER" ]; then
    if [ ! -f "./lib/$DST_FOLDER" ]; then
      # See: http://unix.stackexchange.com/a/84980
      TEMP_DIR=$(mktemp -d 2> /dev/null || mktemp -d -t 'mytmpdir')
      cd "$TEMP_DIR"
      case $1 in
        "git"  ) echo "Git: Cloning $2..."
                 git clone "$2" .
                 echo "Git: Checking out $4..."
                 git checkout "$3" .
                 ;;
        "pypi" ) echo "Pip: Installing $2..."
                 pip install -t "$TEMP_DIR" "$2"=="$3" --user --prefix= --system
                 ;;
        *      )
                 echo "ERROR: Unrecognized source type. Specifiy 'git' or 'pypi'."
                 cd -
      esac
      cd -
      mv "$TEMP_DIR/$4" ./lib/
      rm -rf "$TEMP_DIR"
    fi
  fi
}

# Create the lib directory if it doesn't exist.
if [ ! -d "lib" ]; then
  mkdir lib
  # Make the Python libraries in the lib/ folder available as if they were in
  # the root.
  { echo "import sys" ; echo "sys.path.append('lib/')"; } >> ./lib/__init__.py
fi

# Build oauth2client v4.1.2 dependencies:
# httplib2>=0.9.1, pyasn1>=0.1.7, pyasn1-modules>=0.0.5, rsa>=3.1.4, six>=1.6.1
BuildDep pypi six 1.10.0 six.py
BuildDep pypi pyasn1 0.1.9 pyasn1
BuildDep pypi pyasn1-modules 0.0.8 pyasn1_modules
BuildDep pypi rsa 3.4.2 rsa

# Build oauth2client. TODO replace according to deprecation notice...
BuildDep git https://github.com/google/oauth2client.git tags/v4.1.2 oauth2client

# Build the Google API Python Client
BuildDep git https://github.com/google/google-api-python-client.git tags/v1.6.4 googleapiclient

# Build the URI template library, version>=3.0.0 and <4dev required by google api client
BuildDep git https://github.com/sigmavirus24/uritemplate.git tags/3.0.0 uritemplate

# Build the Earth Engine Python client library.
BuildDep git https://github.com/google/earthengine-api.git v0.1.128 python/ee

# Build httplib2.
BuildDep git https://github.com/jcgregorio/httplib2.git tags/v0.10.3 python2/httplib2

# Install the Google App Engine command line tools.
if ! hash dev_appserver.py 2>/dev/null; then
  # Install the `gcloud` command line tool.
  curl https://sdk.cloud.google.com/ | bash
  # Ensure the `gcloud` command is in our path.
  if [ -f ~/.bashrc ]; then
    source ~/.bashrc
  elif [ -f ~/.bash_profile ]; then
    source ~/.bash_profile
  fi
  # Install the Google App Engine command line tools.
  gcloud components update gae-python
fi
