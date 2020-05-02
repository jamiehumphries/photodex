# Photódex

_Gotta snap 'em all!_

## Overview

Photódex takes a Flickr album of AR snaps from Pokémon GO and displays them in a Pokédex-style layout.

The site is powered by the [Flickr API](https://www.flickr.com/services/api/) and requires the corresponding album to be in a particular format:

* The album must be public and contain the word "Photódex" in the title.
* The individual photo titles must contain the 3-digit Pokémon number (e.g. "001 Bulbasaur").

If you would like to set up your own Photódex, all of the instructions are here: https://www.photodex.io/

![JTAtomico's Photódex](https://i.imgur.com/9BNdNzK.jpg)

## Development guide

If you would like to contribute to Photódex or to make your own fork of the site, these instructions should be everything you need to get set up.

### 1. Installs

#### Tools

* [Git](https://git-scm.com/)
* [Visual Studio Code](https://code.visualstudio.com/)
* [Node](https://nodejs.org/en/)

#### Recommended VS Code extensions

* [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
* [DotENV](https://marketplace.visualstudio.com/items?itemName=mikestead.dotenv)

### 2. Apply for a Flickr API key

Sign up for a Flickr API key: https://www.flickr.com/services/api/misc.api_keys.html

You will need it later in your `.env` file.

### 3. Set up

* Check out the code from GitHub (as below, or from your own fork):
```
git clone git@github.com:jamiehumphries/photodex.git
```
* Install all dependencies via NPM:
```
cd photodex/
npm install
```
* Create a file named `.env` at the root of the project to store your Flickr API key and other configuration. The contents of the file should be:
```
# Your personal API key from Flickr.
FLICKR_API_KEY = your_api_key

# The password used to access /admin/dashboard with the username 'admin'.
# The password can be anything non-empty.
ADMIN_PASSWORD = your_password

# Comma-separated list of usernames to show in the 'Featured' section of the home page.
FEATURED = JTAtomico,GeorgeFromCamp,BeppisMAX

# Do not enforce HTTPS locally.
ENFORCE_HTTPS = no

# Various cache durations for different endpoints and API calls.
# These are optional and can be omitted.
HOME_RESPONSE_CACHE_SECONDS = 1
DEX_RESPONSE_CACHE_SECONDS = 1
FIND_USER_CACHE_SECONDS = 1
FIND_PHOTODEX_ID_CACHE_SECONDS = 1
```
* Run the `start` task to launch the site in development mode:
```
npm start
```
* You should now be able to view the site at http://localhost:5000/.

### 4. Development and debugging

Visual Studio Code is recommended for development and debugging.

#### Development

When running the site via `npm start` (as above), the server will update and refresh automatically as you make changes, so you can see changes when you refresh the browser window.

You can also install the [LiveReload browser extension](http://livereload.com/extensions/) for your browser of choice so that the site will reload automatically following changes, without the need to manually refresh.

#### Debugging

With the site running via `npm start`, you can debug the Node process in Visual Studio Code by using the **Attach** configuration, either:

* Press **F5**; or
* Open the debug tab and click the green play button

This will allow you to set breakpoints, etc.
